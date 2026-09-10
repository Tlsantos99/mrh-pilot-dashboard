import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function isoWeek(dateStr: string): { year: number; week: number } {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
  return { year: d.getFullYear(), week: wk };
}

export async function GET(req: NextRequest) {
  try {
    const callsMaxDate = new URL(req.url).searchParams.get('calls_max_date');
    const supabase = createServerClient();

    // Raw individual calls
    let rawQ = supabase.from('calls').select('answered, abandoned, within_business_hours, call_duration_minutes, call_year, call_week');
    if (callsMaxDate) rawQ = rawQ.lte('call_date', callsMaxDate);

    // Daily aggregates
    let aggQ = supabase.from('calls_daily_agg').select('total_offered, handled, abandoned, avg_conversation_minutes, call_year, call_week');
    if (callsMaxDate) aggQ = aggQ.lte('call_date', callsMaxDate);

    const [{ data: weekly }, { data: rawTotals }, { data: aggData }] = await Promise.all([
      supabase.from('v_call_center_weekly').select('*').order('year').order('week'),
      rawQ,
      aggQ,
    ]);

    // Filter weekly by date if needed
    let filteredWeekly = weekly;
    if (callsMaxDate) {
      const { year: maxY, week: maxW } = isoWeek(callsMaxDate);
      filteredWeekly = (weekly ?? []).filter(w =>
        w.year < maxY || (w.year === maxY && w.week <= maxW)
      );
    }

    // Determine which year/week combinations are covered by raw calls
    const rawWeekKeys = new Set(
      (rawTotals ?? [])
        .filter(r => r.call_year != null && r.call_week != null)
        .map(r => `${r.call_year}-${r.call_week}`)
    );

    // Agg rows for weeks NOT covered by raw calls
    const filteredAgg = (aggData ?? []).filter(r =>
      r.call_year != null && r.call_week != null &&
      !rawWeekKeys.has(`${r.call_year}-${r.call_week}`)
    );

    // Raw totals
    const rawTotal = rawTotals?.length ?? 0;
    const rawAnswered = rawTotals?.filter(r => r.answered).length ?? 0;
    const rawWithin = rawTotals?.filter(r => r.within_business_hours).length ?? 0;
    const rawAnsweredWithin = rawTotals?.filter(r => r.answered && r.within_business_hours).length ?? 0;
    const rawOutside = rawTotals?.filter(r => !r.within_business_hours).length ?? 0;
    const rawAnsweredDuration = rawTotals?.filter(r => r.answered && r.call_duration_minutes) ?? [];
    const rawDurationSum = rawAnsweredDuration.reduce((s, r) => s + (r.call_duration_minutes ?? 0), 0);

    // Agg totals (all agg calls treated as within business hours)
    const aggTotal = filteredAgg.reduce((s, r) => s + (r.total_offered ?? 0), 0);
    const aggAnswered = filteredAgg.reduce((s, r) => s + (r.handled ?? 0), 0);
    const aggAbandoned = filteredAgg.reduce((s, r) => s + (r.abandoned ?? 0), 0);
    const aggDurationSum = filteredAgg.reduce((s, r) => s + (r.avg_conversation_minutes ?? 0) * (r.handled ?? 0), 0);

    const total = rawTotal + aggTotal;
    const answered = rawAnswered + aggAnswered;
    const withinHoursTotal = rawWithin + aggTotal; // agg calls are all within hours
    const answeredWithin = rawAnsweredWithin + aggAnswered;
    const outsideHours = rawOutside; // agg doesn't track outside-hours separately
    const totalAnsweredForDuration = rawAnsweredDuration.length + aggAnswered;
    const avgDuration = totalAnsweredForDuration > 0
      ? (rawDurationSum + aggDurationSum) / totalAnsweredForDuration
      : 0;

    return NextResponse.json({
      weekly: filteredWeekly,
      totals: {
        total,
        answered,
        answerRate: total > 0 ? Math.round((answered / total) * 1000) / 10 : 0,
        withinHoursTotal,
        answeredWithin,
        answerRateWithin: withinHoursTotal > 0 ? Math.round((answeredWithin / withinHoursTotal) * 1000) / 10 : 0,
        outsideHours,
        avgDurationMinutes: Math.round(avgDuration * 10) / 10,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

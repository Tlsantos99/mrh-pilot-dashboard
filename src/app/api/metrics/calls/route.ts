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

    let rawQ = supabase.from('calls').select('answered, abandoned, within_business_hours, call_duration_minutes');
    if (callsMaxDate) rawQ = rawQ.lte('call_date', callsMaxDate);

    const [{ data: weekly }, { data: totals }] = await Promise.all([
      supabase.from('v_call_center_weekly').select('*').order('year').order('week'),
      rawQ,
    ]);

    // Filter weekly by date if needed
    let filteredWeekly = weekly;
    if (callsMaxDate) {
      const { year: maxY, week: maxW } = isoWeek(callsMaxDate);
      filteredWeekly = (weekly ?? []).filter(w =>
        w.year < maxY || (w.year === maxY && w.week <= maxW)
      );
    }

    const total = totals?.length ?? 0;
    const answered = totals?.filter(r => r.answered).length ?? 0;
    const withinHoursTotal = totals?.filter(r => r.within_business_hours).length ?? 0;
    const answeredWithin = totals?.filter(r => r.answered && r.within_business_hours).length ?? 0;
    const outsideHours = totals?.filter(r => !r.within_business_hours).length ?? 0;
    const avgDuration = totals && totals.length > 0
      ? totals.filter(r => r.answered && r.call_duration_minutes).reduce((s, r) => s + (r.call_duration_minutes ?? 0), 0) /
        (totals.filter(r => r.answered && r.call_duration_minutes).length || 1)
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

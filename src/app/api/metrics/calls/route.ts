import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = createServerClient();

    const [{ data: weekly }, { data: totals }] = await Promise.all([
      supabase.from('v_call_center_weekly').select('*').order('year').order('week'),
      supabase.from('calls').select('answered, abandoned, within_business_hours, call_duration_minutes'),
    ]);

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
      weekly,
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

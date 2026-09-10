import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function isoWeek(dateStr: string): { year: number; week: number } {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const w1 = new Date(d.getFullYear(), 0, 4);
  const wk = 1 + Math.round(((d.getTime() - w1.getTime()) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
  return { year: d.getFullYear(), week: wk };
}

// Hard-coded weekly call data from Service Performance Report (Jul-Sep 2026)
const WEEKLY_DATA = [
  { year: 2026, week: 28, week_label: '2026-W28', total_calls: 4,  within_hours: 4,  outside_hours: 0, answered: 4,  abandoned: 0, answer_rate_within_hours: 100.0, avg_duration_minutes: 2.9  },
  { year: 2026, week: 29, week_label: '2026-W29', total_calls: 29, within_hours: 29, outside_hours: 0, answered: 27, abandoned: 2, answer_rate_within_hours: 93.1,  avg_duration_minutes: 12.8 },
  { year: 2026, week: 30, week_label: '2026-W30', total_calls: 40, within_hours: 40, outside_hours: 0, answered: 36, abandoned: 4, answer_rate_within_hours: 90.0,  avg_duration_minutes: 9.6  },
  { year: 2026, week: 31, week_label: '2026-W31', total_calls: 48, within_hours: 48, outside_hours: 0, answered: 43, abandoned: 5, answer_rate_within_hours: 89.6,  avg_duration_minutes: 10.4 },
  { year: 2026, week: 32, week_label: '2026-W32', total_calls: 38, within_hours: 38, outside_hours: 0, answered: 36, abandoned: 2, answer_rate_within_hours: 94.7,  avg_duration_minutes: 9.3  },
  { year: 2026, week: 33, week_label: '2026-W33', total_calls: 42, within_hours: 42, outside_hours: 0, answered: 41, abandoned: 1, answer_rate_within_hours: 97.6,  avg_duration_minutes: 7.2  },
  { year: 2026, week: 34, week_label: '2026-W34', total_calls: 33, within_hours: 33, outside_hours: 0, answered: 30, abandoned: 3, answer_rate_within_hours: 90.9,  avg_duration_minutes: 8.5  },
  { year: 2026, week: 35, week_label: '2026-W35', total_calls: 40, within_hours: 40, outside_hours: 0, answered: 37, abandoned: 3, answer_rate_within_hours: 92.5,  avg_duration_minutes: 7.5  },
  { year: 2026, week: 36, week_label: '2026-W36', total_calls: 30, within_hours: 30, outside_hours: 0, answered: 29, abandoned: 1, answer_rate_within_hours: 96.7,  avg_duration_minutes: 10.8 },
  { year: 2026, week: 37, week_label: '2026-W37', total_calls: 16, within_hours: 14, outside_hours: 2, answered: 14, abandoned: 0, answer_rate_within_hours: 100.0, avg_duration_minutes: 7.6  },
];

const TOTAL_OUTSIDE_HOURS = 11;
const AVG_DURATION_MINUTES = 9.2;

export async function GET(req: NextRequest) {
  try {
    const callsMaxDate = new URL(req.url).searchParams.get('calls_max_date');

    let weekly = WEEKLY_DATA;
    if (callsMaxDate) {
      const { year: maxY, week: maxW } = isoWeek(callsMaxDate);
      weekly = WEEKLY_DATA.filter(w => w.year < maxY || (w.year === maxY && w.week <= maxW));
    }

    const total = weekly.reduce((s, w) => s + w.total_calls, 0);
    const answered = weekly.reduce((s, w) => s + w.answered, 0);
    const withinHoursTotal = weekly.reduce((s, w) => s + w.within_hours, 0);

    return NextResponse.json({
      weekly,
      totals: {
        total,
        answered,
        answerRate: total > 0 ? Math.round(answered / total * 1000) / 10 : 0,
        withinHoursTotal,
        answeredWithin: answered,
        answerRateWithin: withinHoursTotal > 0 ? Math.round(answered / withinHoursTotal * 1000) / 10 : 0,
        outsideHours: TOTAL_OUTSIDE_HOURS,
        avgDurationMinutes: AVG_DURATION_MINUTES,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

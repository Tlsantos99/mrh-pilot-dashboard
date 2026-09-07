/**
 * Count business days (Mon-Fri) between start and end dates (exclusive of end).
 * Returns null if dates are invalid.
 */
export function businessDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
  if (start.getFullYear() < 2000 || end.getFullYear() < 2000) return null;
  if (end < start) return null;

  let count = 0;
  const d = new Date(start);
  d.setHours(0, 0, 0, 0);
  const endD = new Date(end);
  endD.setHours(0, 0, 0, 0);

  while (d < endD) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}

/**
 * Get ISO week info for a date.
 */
export function getISOWeek(date: Date): { year: number; week: number; label: string } | null {
  if (!date || isNaN(date.getTime())) return null;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  const year = d.getFullYear();
  return { year, week, label: `${year}-W${String(week).padStart(2, '0')}` };
}

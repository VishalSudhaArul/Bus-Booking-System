/** All journey dates are interpreted in Indian Standard Time (UTC+05:30). */
export const IST_OFFSET_MINUTES = 330;

const MS_MIN = 60_000;

/** [start, end) UTC instants covering the IST calendar day `YYYY-MM-DD`. */
export function istDayRange(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000+05:30`);
  return { start, end: new Date(start.getTime() + 24 * 60 * MS_MIN) };
}

/** IST calendar date (`YYYY-MM-DD`) of an instant. */
export function istDateString(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MINUTES * MS_MIN).toISOString().slice(0, 10);
}

/** Hour of day (0-23) in IST. */
export function istHour(d: Date): number {
  return new Date(d.getTime() + IST_OFFSET_MINUTES * MS_MIN).getUTCHours();
}

export const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * MS_MIN);
export const hoursBetween = (from: Date, to: Date) => (to.getTime() - from.getTime()) / (60 * MS_MIN);
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

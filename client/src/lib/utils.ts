import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const TZ = 'Asia/Kolkata';

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const formatCurrency = (value: number | undefined | null) => inr.format(value ?? 0);
export const formatNumber = (value: number | undefined | null) => new Intl.NumberFormat('en-IN').format(value ?? 0);

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, ...options });
const timeFmt = fmt({ hour: '2-digit', minute: '2-digit', hour12: false });
const dateFmt = fmt({ day: '2-digit', month: 'short', year: 'numeric' });
const dayFmt = fmt({ weekday: 'short', day: '2-digit', month: 'short' });
const dateTimeFmt = fmt({ day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

type DateInput = string | Date | null | undefined;
const safe = (f: Intl.DateTimeFormat) => (value: DateInput) => {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : f.format(d);
};

/** All times are shown in IST, the timezone the buses run in. */
export const formatTime = safe(timeFmt);
export const formatDate = safe(dateFmt);
export const formatDay = safe(dayFmt);
export const formatDateTime = safe(dateTimeFmt);

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** YYYY-MM-DD for "today + offset" in IST. */
export function istDate(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now);
}

/** IST calendar date (YYYY-MM-DD) of an instant. */
export const istDateOf = (value: string | Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(value));

/** Converts an IST wall-clock `YYYY-MM-DDTHH:mm` (datetime-local value) to an ISO instant. */
export const istLocalToIso = (local: string) => new Date(`${local}:00+05:30`).toISOString();

export const titleCase = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

export const busTypeLabel = (type: string, isAC?: boolean) => `${isAC === undefined ? '' : isAC ? 'A/C ' : 'Non A/C '}${titleCase(type).replace('Semi Sleeper', 'Semi-Sleeper')}`;

export const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

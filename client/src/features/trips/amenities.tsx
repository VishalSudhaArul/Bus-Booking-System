import { BedDouble, CircleCheck, Cookie, GlassWater, Lamp, Navigation, PlugZap, Tv, Wifi, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const ICONS: [RegExp, LucideIcon][] = [
  [/wi-?fi/i, Wifi],
  [/charg|plug|usb/i, PlugZap],
  [/water/i, GlassWater],
  [/track|gps/i, Navigation],
  [/blanket|pillow/i, BedDouble],
  [/reading|light|lamp/i, Lamp],
  [/tv|screen|movie/i, Tv],
  [/snack|meal|food/i, Cookie],
];

export const amenityIcon = (name: string): LucideIcon => ICONS.find(([rx]) => rx.test(name))?.[1] ?? CircleCheck;

/** Icon row for a bus's amenities, with the names available on hover and to screen readers. */
export function AmenityIcons({ amenities, max = 5, className }: { amenities: string[]; max?: number; className?: string }) {
  const shown = amenities.slice(0, max);
  const extra = amenities.length - shown.length;
  return (
    <ul className={cn('flex flex-wrap items-center gap-1.5', className)} aria-label="Amenities">
      {shown.map((a) => {
        const Icon = amenityIcon(a);
        return (
          <li key={a} title={a} className="flex size-7 items-center justify-center rounded-lg bg-ink-100 text-ink-600 transition-colors hover:bg-brand-50 hover:text-brand-700">
            <Icon className="size-3.5" aria-hidden />
            <span className="sr-only">{a}</span>
          </li>
        );
      })}
      {extra > 0 && (
        <li className="rounded-lg bg-ink-100 px-2 py-1 text-[11px] font-semibold text-ink-600" title={amenities.slice(max).join(', ')}>
          +{extra}
        </li>
      )}
    </ul>
  );
}

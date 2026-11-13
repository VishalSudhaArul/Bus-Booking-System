import { ArrowRight, ChevronDown, MapPin, Snowflake, Star, Wind } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge, Card } from '@/components/ui/card';
import { busTypeLabel, cn, formatCurrency, formatDay, formatDuration, formatTime } from '@/lib/utils';
import type { TripPoint, TripSearchResult } from '@/types';

/** Departure → duration → arrival, used on trip cards, trip details and tickets. */
export function JourneyLine({ departure, arrival, durationMinutes, from, to, className }: { departure: string; arrival: string; durationMinutes: number; from: string; to: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 sm:gap-5', className)}>
      <div className="min-w-0">
        <p className="tabular text-xl font-bold text-ink-950 sm:text-2xl">{formatTime(departure)}</p>
        <p className="truncate text-xs font-medium text-ink-500">{from}</p>
      </div>
      <div className="flex min-w-16 flex-1 flex-col items-center gap-1">
        <span className="text-[11px] font-semibold text-ink-500">{formatDuration(durationMinutes)}</span>
        <div className="flex w-full items-center gap-1" aria-hidden>
          <span className="size-1.5 rounded-full border border-ink-400" />
          <span className="h-px flex-1 bg-[repeating-linear-gradient(90deg,var(--color-ink-300)_0_4px,transparent_4px_8px)]" />
          <span className="size-1.5 rounded-full bg-ink-400" />
        </div>
      </div>
      <div className="min-w-0 text-right">
        <p className="tabular text-xl font-bold text-ink-950 sm:text-2xl">{formatTime(arrival)}</p>
        <p className="truncate text-xs font-medium text-ink-500">{to}</p>
      </div>
    </div>
  );
}

export function StopList({ title, points }: { title: string; points: TripPoint[] }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-500">{title}</h4>
      <ul className="mt-2 space-y-2">
        {points.map((p) => (
          <li key={p.stopId} className="flex items-start gap-2.5 text-sm">
            <span className="tabular mt-px w-11 shrink-0 font-semibold text-ink-900">{formatTime(p.time)}</span>
            <span className="min-w-0">
              <span className="font-medium text-ink-800">{p.name}</span>
              {p.landmark && <span className="block text-xs text-ink-500">{p.landmark}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function TripCard({ trip, passengers }: { trip: TripSearchResult; passengers: number }) {
  const [open, setOpen] = useState(false);
  const few = trip.availableSeats <= 5;
  const overnight = formatDay(trip.departureTime) !== formatDay(trip.arrivalTime);

  return (
    <Card className="overflow-hidden transition-shadow hover:shadow-raised">
      <div className="grid gap-5 p-5 xl:grid-cols-[1.1fr_1.4fr_auto] xl:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-bold text-ink-950">{trip.operator.name}</h3>
            <span className="tabular inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-700 px-1.5 py-0.5 text-xs font-bold text-white" aria-label={`Rated ${trip.operator.rating} out of 5`}>
              <Star className="size-3 fill-current" aria-hidden /> {trip.operator.rating.toFixed(1)}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
            {trip.bus.isAC ? <Snowflake className="size-3.5 text-blue-600" aria-hidden /> : <Wind className="size-3.5 text-ink-400" aria-hidden />}
            {busTypeLabel(trip.bus.busType, trip.bus.isAC)}
          </p>
          <p className="mt-0.5 truncate text-xs text-ink-500">{trip.bus.name}</p>
        </div>

        <div>
          <JourneyLine departure={trip.departureTime} arrival={trip.arrivalTime} durationMinutes={trip.durationMinutes} from={trip.boardingPoints[0]?.name ?? trip.route.sourceCity} to={trip.droppingPoints.at(-1)?.name ?? trip.route.destinationCity} />
          {overnight && <p className="mt-1 text-right text-[11px] font-medium text-ink-500">Arrives {formatDay(trip.arrivalTime)}</p>}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-dashed border-ink-200 pt-4 xl:flex-col xl:items-end xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <div className="xl:text-right">
            <p className="text-[11px] font-medium text-ink-500">{trip.minFare === trip.maxFare ? 'Per seat' : 'Starts from'}</p>
            <p className="tabular text-2xl font-extrabold text-ink-950">{formatCurrency(trip.minFare)}</p>
            <p className={cn('text-xs font-semibold', few ? 'text-warning' : 'text-success')}>{few ? `Only ${trip.availableSeats} seats left` : `${trip.availableSeats} seats available`}</p>
          </div>
          <Button asChild>
            <Link to={`/trips/${trip._id}?passengers=${passengers}`}>
              Select seats <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 bg-ink-50/50 px-5 py-2.5">
        <div className="flex flex-wrap gap-1.5">
          {trip.bus.amenities.slice(0, 4).map((a) => (
            <Badge key={a}>{a}</Badge>
          ))}
          {trip.bus.amenities.length > 4 && <Badge>+{trip.bus.amenities.length - 4} more</Badge>}
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-900">
          <MapPin className="size-3.5" aria-hidden /> Boarding & dropping points
          <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </div>
      {open && (
        <div className="grid animate-fade-up gap-6 border-t border-ink-100 px-5 py-4 sm:grid-cols-2">
          <StopList title="Boarding points" points={trip.boardingPoints} />
          <StopList title="Dropping points" points={trip.droppingPoints} />
        </div>
      )}
    </Card>
  );
}

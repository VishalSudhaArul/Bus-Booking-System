import { ChevronDown, Flame, MapPin, Snowflake, Star, Wind } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SeatSelector, type SeatSelection } from '@/features/seats/SeatDrawer';
import { busTypeLabel, cn, formatCurrency, formatDay, formatDuration, formatTime } from '@/lib/utils';
import type { TripPoint, TripSearchResult } from '@/types';
import { AmenityIcons } from './amenities';

/** Departure → duration → arrival, used on trip cards, trip details and tickets. */
export function JourneyLine({ departure, arrival, durationMinutes, from, to, className }: { departure: string; arrival: string; durationMinutes: number; from: string; to: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3 sm:gap-4', className)}>
      <div className="min-w-0">
        <p className="tabular text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{formatTime(departure)}</p>
        <p className="truncate text-xs font-medium text-ink-500">{from}</p>
      </div>
      <div className="flex min-w-16 flex-1 flex-col items-center gap-1">
        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">{formatDuration(durationMinutes)}</span>
        <div className="flex w-full items-center" aria-hidden>
          <span className="size-2 rounded-full border-2 border-brand-600 bg-white" />
          <span className="h-0.5 flex-1 bg-[repeating-linear-gradient(90deg,var(--color-ink-300)_0_5px,transparent_5px_9px)]" />
          <span className="size-2 rounded-full bg-brand-600" />
        </div>
      </div>
      <div className="min-w-0 text-right">
        <p className="tabular text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{formatTime(arrival)}</p>
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

export function RatingBadge({ rating }: { rating: number }) {
  const tone = rating >= 4.5 ? 'bg-emerald-600' : rating >= 4 ? 'bg-emerald-500' : rating >= 3.5 ? 'bg-amber-500' : 'bg-ink-500';
  return (
    <span className={cn('tabular inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-bold text-white', tone)} aria-label={`Rated ${rating.toFixed(1)} out of 5`}>
      <Star className="size-3 fill-current" aria-hidden /> {rating.toFixed(1)}
    </span>
  );
}

interface TripCardProps {
  trip: TripSearchResult;
  open: boolean;
  onToggle: () => void;
  onContinue: (selection: SeatSelection) => void;
  initial?: Partial<SeatSelection>;
}

export function TripCard({ trip, open, onToggle, onContinue, initial }: TripCardProps) {
  const [showStops, setShowStops] = useState(false);
  const few = trip.availableSeats <= 6;
  const overnight = formatDay(trip.departureTime) !== formatDay(trip.arrivalTime);

  return (
    <Card className={cn('overflow-hidden transition-all duration-200', open ? 'border-brand-300 shadow-raised ring-4 ring-brand-500/10' : 'hover:border-ink-300 hover:shadow-raised')}>
      <div className="grid gap-5 p-5 xl:grid-cols-[1.05fr_1.5fr_auto] xl:items-center">
        {/* Operator */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-bold text-ink-900">{trip.operator.name}</h3>
            <RatingBadge rating={trip.operator.rating} />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
            {trip.bus.isAC ? <Snowflake className="size-3.5 text-brand-600" aria-hidden /> : <Wind className="size-3.5 text-ink-400" aria-hidden />}
            {busTypeLabel(trip.bus.busType, trip.bus.isAC)}
          </p>
          <AmenityIcons amenities={trip.bus.amenities} className="mt-3" />
        </div>

        {/* Timeline */}
        <div>
          <JourneyLine
            departure={trip.departureTime}
            arrival={trip.arrivalTime}
            durationMinutes={trip.durationMinutes}
            from={trip.boardingPoints[0]?.name ?? trip.route.sourceCity}
            to={trip.droppingPoints.at(-1)?.name ?? trip.route.destinationCity}
          />
          <div className="mt-2 flex items-center justify-between text-[11px] font-medium text-ink-500">
            <button type="button" onClick={() => setShowStops((v) => !v)} aria-expanded={showStops} className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:text-brand-800">
              <MapPin className="size-3.5" aria-hidden /> {trip.boardingPoints.length + trip.droppingPoints.length} stops
              <ChevronDown className={cn('size-3.5 transition-transform', showStops && 'rotate-180')} aria-hidden />
            </button>
            {overnight && <span>Arrives {formatDay(trip.arrivalTime)}</span>}
          </div>
        </div>

        {/* Price + CTA */}
        <div className="flex items-center justify-between gap-4 border-t border-ink-100 pt-4 xl:flex-col xl:items-end xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
          <div className="xl:text-right">
            {few ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-bold text-red-700 ring-1 ring-inset ring-red-200">
                <Flame className="size-3" aria-hidden /> Only {trip.availableSeats} seats left
              </span>
            ) : (
              <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200">{trip.availableSeats} seats left</span>
            )}
            <p className="mt-1.5 text-[11px] font-medium text-ink-500">{trip.minFare === trip.maxFare ? 'per seat' : 'from'}</p>
            <p className="tabular text-2xl font-extrabold tracking-tight text-ink-900">{formatCurrency(trip.minFare)}</p>
          </div>
          <Button onClick={onToggle} variant={open ? 'outline' : 'primary'} aria-expanded={open} className="min-w-32">
            {open ? 'Hide seats' : 'Select seats'}
            <ChevronDown className={cn('transition-transform duration-200', open && 'rotate-180')} />
          </Button>
        </div>
      </div>

      {showStops && (
        <div className="grid animate-drawer gap-6 border-t border-ink-100 bg-ink-50/50 px-5 py-4 sm:grid-cols-2">
          <StopList title="Boarding points" points={trip.boardingPoints} />
          <StopList title="Dropping points" points={trip.droppingPoints} />
        </div>
      )}

      {/* Inline seat-selection drawer */}
      {open && (
        <div className="animate-drawer border-t border-ink-200 bg-white px-5 py-5">
          <SeatSelector tripId={trip._id} boardingPoints={trip.boardingPoints} droppingPoints={trip.droppingPoints} initial={initial} onContinue={onContinue} onClose={onToggle} />
        </div>
      )}
    </Card>
  );
}

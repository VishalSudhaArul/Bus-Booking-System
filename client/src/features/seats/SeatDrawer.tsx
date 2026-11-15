import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Info, RefreshCw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ErrorState } from '@/components/common/feedback';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Field, Select } from '@/components/ui/form';
import { estimateFare, FareBreakdown } from '@/features/bookings/FareSummary';
import { cn, formatTime } from '@/lib/utils';
import { tripApi } from '@/services';
import type { TripPoint, TripSeat } from '@/types';
import { SeatLegend, SeatMap } from './SeatMap';

export const MAX_SEATS = 6;

export interface SeatSelection {
  tripId: string;
  seatIds: string[];
  boardingStopId: string;
  droppingStopId: string;
}

interface Props {
  tripId: string;
  boardingPoints: TripPoint[];
  droppingPoints: TripPoint[];
  initial?: Partial<SeatSelection>;
  onContinue: (selection: SeatSelection) => void;
  onClose?: () => void;
  continueLabel?: string;
  className?: string;
}

/**
 * Seat selection with a live summary. Availability is polled from the server;
 * a seat that someone else books while you look at it is dropped from your
 * selection with a notice.
 */
export function SeatSelector({ tripId, boardingPoints, droppingPoints, initial, onContinue, onClose, continueLabel = 'Continue to book', className }: Props) {
  const seatMap = useQuery({ queryKey: ['trip-seats', tripId], queryFn: () => tripApi.seats(tripId), refetchInterval: 15_000, refetchOnWindowFocus: true, staleTime: 0 });
  const [selected, setSelected] = useState<string[]>(initial?.seatIds ?? []);
  const [boardingStopId, setBoarding] = useState(initial?.boardingStopId || boardingPoints[0]?.stopId || '');
  const [droppingStopId, setDropping] = useState(initial?.droppingStopId || droppingPoints.at(-1)?.stopId || '');

  useEffect(() => {
    if (!seatMap.data) return;
    const free = new Set(seatMap.data.seats.filter((s) => s.status === 'AVAILABLE').map((s) => s._id));
    const lost = selected.filter((sid) => !free.has(sid));
    if (lost.length === 0) return;
    const names = seatMap.data.seats.filter((s) => lost.includes(s._id)).map((s) => s.seatNumber);
    setSelected((cur) => cur.filter((sid) => free.has(sid)));
    toast.warning(`Seat ${names.join(', ')} was just booked by someone else`, { description: 'Please choose another seat.' });
  }, [seatMap.data, selected]);

  const selectedSeats = useMemo(
    () => (seatMap.data?.seats ?? []).filter((s) => selected.includes(s._id)).sort((a, b) => a.seatNumber.localeCompare(b.seatNumber, undefined, { numeric: true })),
    [seatMap.data, selected],
  );
  const fare = useMemo(() => estimateFare(seatMap.data?.baseFare ?? 0, selectedSeats.map((s) => s.fare)), [seatMap.data, selectedSeats]);
  const hasLadies = (seatMap.data?.seats ?? []).some((s) => s.ladiesOnly);

  const toggle = (seat: TripSeat) => {
    if (seat.status !== 'AVAILABLE') return;
    setSelected((cur) => (cur.includes(seat._id) ? cur.filter((s) => s !== seat._id) : cur.length >= MAX_SEATS ? cur : [...cur, seat._id]));
  };

  if (seatMap.isLoading) {
    return (
      <div className={cn('grid gap-6 md:grid-cols-[1fr_20rem]', className)}>
        <Skeleton className="mx-auto h-96 w-64 rounded-2xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }
  if (seatMap.error || !seatMap.data) return <ErrorState error={seatMap.error} onRetry={() => seatMap.refetch()} className="py-8" />;

  const bookable = seatMap.data.bookable;
  const freeCount = seatMap.data.seats.filter((s) => s.status === 'AVAILABLE').length;

  return (
    <div className={cn('grid gap-6 md:grid-cols-[1fr_20rem]', className)}>
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink-800">
            Select seats <span className="font-normal text-ink-500">· {freeCount} available</span>
          </p>
          <Button variant="ghost" size="sm" onClick={() => seatMap.refetch()} loading={seatMap.isFetching} aria-label="Refresh seat availability">
            {!seatMap.isFetching && <RefreshCw />} Refresh
          </Button>
        </div>
        {!bookable && (
          <div className="mb-4 flex gap-2.5 rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900" role="status">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden /> This trip is no longer open for booking.
          </div>
        )}
        <SeatMap layout={seatMap.data.layout} seats={seatMap.data.seats} selected={selected} onToggle={toggle} maxSelectable={MAX_SEATS} disabled={!bookable} />
        <div className="mt-5 flex justify-center">
          <SeatLegend showLadies={hasLadies} />
        </div>
      </div>

      {/* Summary */}
      <aside className="flex flex-col rounded-xl border border-ink-200 bg-ink-50/60 p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-ink-900">Booking summary</h4>
          {onClose && (
            <button type="button" onClick={onClose} className="rounded-md p-1 text-ink-400 hover:bg-ink-200/60 hover:text-ink-700" aria-label="Close seat selection">
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Seats</p>
          {selectedSeats.length === 0 ? (
            <p className="mt-1.5 rounded-lg border border-dashed border-ink-300 bg-white px-3 py-3 text-center text-xs text-ink-500">Tap a seat on the map</p>
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-live="polite">
              {selectedSeats.map((s) => (
                <li key={s._id}>
                  <button
                    type="button"
                    onClick={() => toggle(s)}
                    className={cn(
                      'tabular inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors animate-pop',
                      s.ladiesOnly ? 'bg-ladies-50 text-ladies-700 ring-1 ring-ladies-300' : 'bg-brand-600 text-white hover:bg-brand-700',
                    )}
                    aria-label={`Remove seat ${s.seatNumber}`}
                  >
                    {s.seatNumber} <X className="size-3" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedSeats.some((s) => s.ladiesOnly) && <p className="mt-2 text-[11px] font-medium text-ladies-700">Pink seats are reserved for women passengers.</p>}
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Boarding point" htmlFor={`boarding-${tripId}`}>
            <Select id={`boarding-${tripId}`} value={boardingStopId} onChange={(e) => setBoarding(e.target.value)}>
              {boardingPoints.map((p) => (
                <option key={p.stopId} value={p.stopId}>
                  {formatTime(p.time)} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Dropping point" htmlFor={`dropping-${tripId}`}>
            <Select id={`dropping-${tripId}`} value={droppingStopId} onChange={(e) => setDropping(e.target.value)}>
              {droppingPoints.map((p) => (
                <option key={p.stopId} value={p.stopId}>
                  {formatTime(p.time)} · {p.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4 border-t border-ink-200 pt-4">
          {selectedSeats.length > 0 ? (
            <FareBreakdown fare={fare} seatCount={selectedSeats.length} totalLabel="Total fare" />
          ) : (
            <p className="text-xs text-ink-500">Your fare appears here as you pick seats.</p>
          )}
        </div>

        <Button
          size="lg"
          className="mt-4 w-full"
          disabled={selectedSeats.length === 0 || !bookable || !boardingStopId || !droppingStopId}
          onClick={() => onContinue({ tripId, seatIds: selectedSeats.map((s) => s._id), boardingStopId, droppingStopId })}
        >
          {continueLabel} <ArrowRight />
        </Button>
        <p className="mt-2 text-center text-[11px] text-ink-500">Seats are confirmed only when you book.</p>
      </aside>
    </div>
  );
}

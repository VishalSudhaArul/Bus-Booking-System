import { useMemo, useState } from 'react';
import { cn, formatCurrency } from '@/lib/utils';
import type { BusLayout, Deck, TripSeat } from '@/types';

interface SeatMapProps {
  layout: BusLayout;
  seats: TripSeat[];
  selected: string[];
  onToggle: (seat: TripSeat) => void;
  maxSelectable?: number;
  disabled?: boolean;
}

type SeatState = 'AVAILABLE' | 'SELECTED' | 'BOOKED' | 'UNAVAILABLE';

/** Seat colours by state; ladies-only seats keep a pink outline while available. */
function seatClasses(state: SeatState, ladies: boolean) {
  switch (state) {
    case 'SELECTED':
      return 'border-brand-600 bg-brand-600 text-white shadow-md shadow-brand-600/30';
    case 'BOOKED':
      return 'border-ink-200 bg-ink-200 text-ink-400';
    case 'UNAVAILABLE':
      return 'border-dashed border-ink-200 bg-ink-50 text-ink-300';
    default:
      return ladies
        ? 'border-ladies-300 bg-ladies-50 text-ladies-700 hover:border-ladies-500 hover:shadow-sm'
        : 'border-ink-300 bg-white text-ink-700 hover:border-brand-500 hover:text-brand-700 hover:shadow-sm';
  }
}

export function SteeringWheel({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M12 14.2V21M9.9 11.4 3.4 9.6M14.1 11.4l6.5-1.8" />
    </svg>
  );
}

function LegendSwatch({ className }: { className: string }) {
  return <span className={cn('relative h-4 w-5 rounded-[5px] border', className)} aria-hidden />;
}

export function SeatLegend({ showLadies = true }: { showLadies?: boolean }) {
  const items = [
    { label: 'Available', swatch: 'border-ink-300 bg-white' },
    { label: 'Selected', swatch: 'border-brand-600 bg-brand-600' },
    { label: 'Booked', swatch: 'border-ink-200 bg-ink-200' },
    ...(showLadies ? [{ label: 'Ladies only', swatch: 'border-ladies-300 bg-ladies-50' }] : []),
    { label: 'Unavailable', swatch: 'border-dashed border-ink-200 bg-ink-50' },
  ];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-ink-600" aria-label="Seat legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <LegendSwatch className={i.swatch} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Renders the bus exactly as described by the server: every seat is placed on
 * the grid by its own row/column/deck. Availability comes from the trip seat
 * map; this component never decides on its own that a seat is free.
 */
export function SeatMap({ layout, seats, selected, onToggle, maxSelectable = 6, disabled }: SeatMapProps) {
  const decks = useMemo(() => [...new Set(seats.map((s) => s.deck))].sort() as Deck[], [seats]);
  const [deck, setDeck] = useState<Deck>(decks[0] ?? 'LOWER');
  const activeDeck = decks.includes(deck) ? deck : decks[0];
  const isSleeper = seats.some((s) => s.seatType === 'SLEEPER');
  const limitReached = selected.length >= maxSelectable;

  // Grid columns: seat columns plus one narrow aisle track.
  const template = Array.from({ length: layout.columns + 1 }, (_, i) => (i === layout.aisleAfterColumn ? '1rem' : 'minmax(0, 1fr)')).join(' ');
  const gridColumn = (column: number) => (column > layout.aisleAfterColumn ? column + 1 : column);
  const selectedOnDeck = (d: Deck) => seats.filter((s) => s.deck === d && selected.includes(s._id)).length;

  return (
    <div>
      {decks.length > 1 && (
        <div className="mb-4 grid grid-cols-2 rounded-xl bg-ink-100 p-1" role="tablist" aria-label="Deck">
          {decks.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={activeDeck === d}
              onClick={() => setDeck(d)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-all duration-200',
                activeDeck === d ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-800',
              )}
            >
              {d === 'LOWER' ? 'Lower deck' : 'Upper deck'}
              <span className={cn('rounded-full px-1.5 text-[11px] font-bold', activeDeck === d ? 'bg-brand-50 text-brand-700' : 'bg-ink-200/70 text-ink-500')}>
                {selectedOnDeck(d) ? `${selectedOnDeck(d)} sel.` : `${seats.filter((s) => s.deck === d && s.status === 'AVAILABLE').length} free`}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto w-full max-w-[17rem] rounded-[1.5rem] border-2 border-ink-200 bg-white p-4 pt-3 shadow-inner">
        <div className="mb-3 flex items-center justify-between border-b border-dashed border-ink-200 pb-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-ink-400">{activeDeck === 'UPPER' ? 'Upper deck' : 'Front'}</span>
          {activeDeck !== 'UPPER' && (
            <span className="flex items-center gap-1.5 text-ink-400" title="Driver">
              <span className="text-[10px] font-bold uppercase tracking-widest">Driver</span>
              <SteeringWheel className="size-6" />
            </span>
          )}
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: template }} role="group" aria-label={`${activeDeck === 'LOWER' ? 'Lower' : 'Upper'} deck seats`}>
          {seats
            .filter((s) => s.deck === activeDeck)
            .map((seat) => {
              const isSelected = selected.includes(seat._id);
              const state: SeatState = isSelected ? 'SELECTED' : seat.status;
              const blocked = disabled || seat.status !== 'AVAILABLE' || (!isSelected && limitReached);
              const label = `Seat ${seat.seatNumber}, ${seat.position.toLowerCase()}, ${isSelected ? 'selected' : seat.status.toLowerCase()}, ${formatCurrency(seat.fare)}${seat.ladiesOnly ? ', reserved for women' : ''}`;
              return (
                <button
                  key={seat._id}
                  type="button"
                  disabled={blocked && !isSelected}
                  aria-pressed={isSelected}
                  aria-label={label}
                  title={
                    seat.status === 'AVAILABLE'
                      ? `${seat.seatNumber} · ${formatCurrency(seat.fare)}${seat.ladiesOnly ? ' · Ladies only' : ''}`
                      : `${seat.seatNumber} · ${seat.status === 'BOOKED' ? 'Booked' : 'Not available'}`
                  }
                  onClick={() => onToggle(seat)}
                  style={{ gridColumn: gridColumn(seat.column), gridRow: seat.row }}
                  className={cn(
                    'group relative flex flex-col items-center justify-end overflow-hidden rounded-lg border-[1.5px] pb-1 text-[10px] font-bold transition-all duration-150 enabled:cursor-pointer enabled:active:scale-90',
                    isSleeper ? 'h-[4.5rem]' : 'h-11',
                    seatClasses(state, !!seat.ladiesOnly),
                    !isSelected && limitReached && seat.status === 'AVAILABLE' && 'opacity-40',
                    isSelected && 'animate-pop',
                  )}
                >
                  {/* Backrest / pillow drawn inside the seat */}
                  <span
                    aria-hidden
                    className={cn(
                      'absolute rounded-sm',
                      isSleeper ? 'inset-x-1.5 top-1.5 h-2' : 'inset-x-1 top-1 h-1.5',
                      state === 'SELECTED' ? 'bg-white/40' : state === 'BOOKED' ? 'bg-ink-300/70' : seat.ladiesOnly && state === 'AVAILABLE' ? 'bg-ladies-300/70' : 'bg-ink-200',
                    )}
                  />
                  <span className="tabular relative">{seat.seatNumber}</span>
                </button>
              );
            })}
        </div>
        <p className="mt-3 border-t border-dashed border-ink-200 pt-2 text-center text-[10px] font-bold uppercase tracking-widest text-ink-400">Rear</p>
      </div>
      {limitReached && <p className="mt-3 text-center text-xs font-medium text-warning">You can select up to {maxSelectable} seats in one booking.</p>}
    </div>
  );
}

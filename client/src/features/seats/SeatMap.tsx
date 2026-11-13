import { CircleUserRound } from 'lucide-react';
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

const STATE_STYLES = {
  AVAILABLE: 'border-ink-300 bg-white text-ink-700 hover:border-brand-500 hover:bg-brand-50 hover:text-brand-800',
  SELECTED: 'border-brand-700 bg-brand-700 text-white shadow-sm',
  BOOKED: 'border-ink-200 bg-ink-200 text-ink-400 cursor-not-allowed',
  UNAVAILABLE: 'border-dashed border-ink-200 bg-ink-50 text-ink-300 cursor-not-allowed',
};

export function SeatLegend() {
  const items = [
    { label: 'Available', style: STATE_STYLES.AVAILABLE },
    { label: 'Selected', style: STATE_STYLES.SELECTED },
    { label: 'Booked', style: STATE_STYLES.BOOKED },
    { label: 'Unavailable', style: STATE_STYLES.UNAVAILABLE },
  ];
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-ink-600" aria-label="Seat legend">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span className={cn('size-4 rounded-[5px] border', i.style, 'pointer-events-none')} aria-hidden />
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
  const template = Array.from({ length: layout.columns + 1 }, (_, i) => (i === layout.aisleAfterColumn ? '1.25rem' : 'minmax(0, 1fr)')).join(' ');
  const gridColumn = (column: number) => (column > layout.aisleAfterColumn ? column + 1 : column);

  return (
    <div>
      {decks.length > 1 && (
        <div className="mb-4 inline-flex rounded-xl bg-ink-100 p-1" role="tablist" aria-label="Deck">
          {decks.map((d) => (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={activeDeck === d}
              onClick={() => setDeck(d)}
              className={cn('rounded-lg px-4 py-1.5 text-sm font-semibold transition-all', activeDeck === d ? 'bg-white text-ink-950 shadow-sm' : 'text-ink-600 hover:text-ink-900')}
            >
              {d === 'LOWER' ? 'Lower deck' : 'Upper deck'}
              <span className="ml-1.5 text-xs font-medium text-ink-400">{seats.filter((s) => s.deck === d && s.status === 'AVAILABLE').length} free</span>
            </button>
          ))}
        </div>
      )}

      <div className="mx-auto w-full max-w-xs rounded-[1.75rem] border-2 border-ink-200 bg-ink-50/60 p-4 pt-3">
        <div className="mb-3 flex items-center justify-between border-b border-dashed border-ink-200 pb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          <span>Front</span>
          <span className="flex items-center gap-1.5">
            Driver <CircleUserRound className="size-5" aria-hidden />
          </span>
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: template }} role="group" aria-label={`${activeDeck === 'LOWER' ? 'Lower' : 'Upper'} deck seats`}>
          {seats
            .filter((s) => s.deck === activeDeck)
            .map((seat) => {
              const isSelected = selected.includes(seat._id);
              const state = isSelected ? 'SELECTED' : seat.status;
              const blocked = disabled || seat.status !== 'AVAILABLE' || (!isSelected && limitReached);
              const label = `Seat ${seat.seatNumber}, ${seat.position.toLowerCase()}, ${isSelected ? 'selected' : seat.status.toLowerCase()}, ${formatCurrency(seat.fare)}`;
              return (
                <button
                  key={seat._id}
                  type="button"
                  disabled={blocked && !isSelected}
                  aria-pressed={isSelected}
                  aria-label={label}
                  title={seat.status === 'AVAILABLE' ? `${seat.seatNumber} · ${formatCurrency(seat.fare)}` : `${seat.seatNumber} · ${seat.status === 'BOOKED' ? 'Booked' : 'Not available'}`}
                  onClick={() => onToggle(seat)}
                  style={{ gridColumn: gridColumn(seat.column), gridRow: seat.row }}
                  className={cn(
                    'tabular flex items-center justify-center rounded-lg border text-[11px] font-bold transition-all duration-150 enabled:active:scale-95',
                    isSleeper ? 'h-16' : 'h-10',
                    STATE_STYLES[state],
                    !isSelected && limitReached && seat.status === 'AVAILABLE' && 'opacity-50',
                  )}
                >
                  {seat.seatNumber}
                </button>
              );
            })}
        </div>
        <p className="mt-3 border-t border-dashed border-ink-200 pt-2 text-center text-[11px] font-semibold uppercase tracking-wide text-ink-400">Rear</p>
      </div>
      {limitReached && <p className="mt-3 text-center text-xs font-medium text-warning">You can select up to {maxSelectable} seats in one booking.</p>}
    </div>
  );
}

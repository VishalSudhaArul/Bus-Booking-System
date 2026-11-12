import type { BusType, Deck, LayoutTemplate } from '../../types/domain';

interface TemplateSpec {
  columns: number;
  aisleAfterColumn: number;
  decks: 1 | 2;
  seatType: BusType;
}

/** `columns` counts seat columns only; the aisle is drawn after `aisleAfterColumn`. */
export const LAYOUT_SPECS: Record<LayoutTemplate, TemplateSpec> = {
  SEATER_2X2: { columns: 4, aisleAfterColumn: 2, decks: 1, seatType: 'SEATER' },
  SEATER_2X1: { columns: 3, aisleAfterColumn: 2, decks: 1, seatType: 'SEATER' },
  SEMI_SLEEPER_2X2: { columns: 4, aisleAfterColumn: 2, decks: 1, seatType: 'SEMI_SLEEPER' },
  SLEEPER_2X1: { columns: 3, aisleAfterColumn: 1, decks: 2, seatType: 'SLEEPER' },
  SLEEPER_1X1: { columns: 2, aisleAfterColumn: 1, decks: 2, seatType: 'SLEEPER' },
};

export interface GeneratedSeat {
  seatNumber: string;
  deck: Deck;
  row: number;
  column: number;
  seatType: BusType;
  position: 'WINDOW' | 'AISLE';
  priceModifier: number;
}

export interface LayoutOptions {
  template: LayoutTemplate;
  rows: number;
  windowPremium?: number;
  lowerDeckPremium?: number;
}

/**
 * Builds the seat list for a vehicle from a layout template.
 * Seaters are numbered row+letter (1A, 1B…); sleeper berths L1…/U1… per deck.
 */
export function generateSeats(options: LayoutOptions): GeneratedSeat[] {
  const spec = LAYOUT_SPECS[options.template];
  const seats: GeneratedSeat[] = [];
  const decks: Deck[] = spec.decks === 2 ? ['LOWER', 'UPPER'] : ['LOWER'];

  for (const deck of decks) {
    let berth = 0;
    for (let row = 1; row <= options.rows; row += 1) {
      for (let column = 1; column <= spec.columns; column += 1) {
        berth += 1;
        const position = column === 1 || column === spec.columns ? 'WINDOW' : 'AISLE';
        const seatNumber =
          spec.decks === 2 ? `${deck === 'LOWER' ? 'L' : 'U'}${berth}` : `${row}${String.fromCharCode(64 + column)}`;
        let priceModifier = 0;
        if (position === 'WINDOW') priceModifier += options.windowPremium ?? 0;
        if (spec.decks === 2 && deck === 'LOWER') priceModifier += options.lowerDeckPremium ?? 0;
        seats.push({ seatNumber, deck, row, column, seatType: spec.seatType, position, priceModifier });
      }
    }
  }
  return seats;
}

export function layoutMeta(options: LayoutOptions) {
  const spec = LAYOUT_SPECS[options.template];
  return {
    template: options.template,
    rows: options.rows,
    columns: spec.columns,
    aisleAfterColumn: spec.aisleAfterColumn,
    decks: spec.decks,
  };
}

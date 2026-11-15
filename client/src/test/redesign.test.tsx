import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { FareBreakdown } from '@/features/bookings/FareSummary';
import { SeatLegend, SeatMap } from '@/features/seats/SeatMap';
import { SearchWidget } from '@/features/search/SearchWidget';
import { AmenityIcons, amenityIcon } from '@/features/trips/amenities';
import { RatingBadge } from '@/features/trips/TripCard';
import { istDate } from '@/lib/utils';
import type { BusLayout, TripSeat } from '@/types';

const layout: BusLayout = { template: 'SEATER_2X2', rows: 1, columns: 4, aisleAfterColumn: 2, decks: 1 };
const seat = (n: number, extra: Partial<TripSeat> = {}): TripSeat => ({
  _id: `s${n}`,
  seatNumber: `1${'ABCD'[n - 1]}`,
  deck: 'LOWER',
  row: 1,
  column: n,
  seatType: 'SEATER',
  position: n === 1 || n === 4 ? 'WINDOW' : 'AISLE',
  fare: 500,
  status: 'AVAILABLE',
  ...extra,
});

describe('seat map redesign', () => {
  it('marks ladies-only seats for assistive tech and still lets them be selected', async () => {
    const onToggle = vi.fn();
    render(<SeatMap layout={layout} seats={[seat(1, { ladiesOnly: true }), seat(2)]} selected={[]} onToggle={onToggle} />);
    const ladies = screen.getByRole('button', { name: /Seat 1A, window, available, .*reserved for women/ });
    expect(screen.getByRole('button', { name: /Seat 1B/ }).getAttribute('aria-label')).not.toMatch(/reserved/);
    await userEvent.click(ladies);
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ _id: 's1', ladiesOnly: true }));
  });

  it('shows the driver at the front of the lower deck', () => {
    render(<SeatMap layout={layout} seats={[seat(1)]} selected={[]} onToggle={() => undefined} />);
    expect(screen.getByTitle('Driver')).toBeInTheDocument();
  });

  it('includes the ladies-only swatch in the legend only when relevant', () => {
    const { rerender } = render(<SeatLegend showLadies />);
    expect(screen.getByText('Ladies only')).toBeInTheDocument();
    rerender(<SeatLegend showLadies={false} />);
    expect(screen.queryByText('Ladies only')).not.toBeInTheDocument();
    expect(screen.getByText('Booked')).toBeInTheDocument();
  });
});

describe('search card quick dates', () => {
  it('sets today and tomorrow from the pills', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <SearchWidget />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const date = screen.getByLabelText(/^departure$/i) as HTMLInputElement;
    expect(date.value).toBe(istDate(1));
    expect(screen.getByRole('button', { name: 'Tomorrow' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(date.value).toBe(istDate(0));
    expect(screen.getByRole('button', { name: 'Today' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('fare and trip card details', () => {
  it('shows a promo discount line when the server applied one', () => {
    render(<FareBreakdown fare={{ baseFare: 1200, seatCharges: 0, discount: 120, promoCode: 'SAVE10', taxPercent: 5, taxes: 54, total: 1134 }} seatCount={2} />);
    expect(screen.getByText('SAVE10')).toBeInTheDocument();
    expect(screen.getByText(/− ₹120/)).toBeInTheDocument();
    expect(screen.getByText('₹1,134')).toBeInTheDocument();
  });

  it('hides the promo line when there is no discount', () => {
    render(<FareBreakdown fare={{ baseFare: 500, seatCharges: 0, discount: 0, taxPercent: 5, taxes: 25, total: 525 }} seatCount={1} />);
    expect(screen.queryByText(/Promo/)).not.toBeInTheDocument();
  });

  it('maps amenities to icons with accessible names and an overflow count', () => {
    expect(amenityIcon('WiFi')).not.toBe(amenityIcon('Charging point'));
    render(<AmenityIcons amenities={['WiFi', 'Charging point', 'Water bottle', 'Live tracking', 'Blanket', 'Snacks']} max={4} />);
    expect(screen.getByText('WiFi')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
  });

  it('labels the operator rating', () => {
    render(<RatingBadge rating={4.6} />);
    expect(screen.getByLabelText('Rated 4.6 out of 5')).toBeInTheDocument();
  });
});

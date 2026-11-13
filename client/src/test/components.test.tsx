import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { estimateFare, FareBreakdown } from '@/features/bookings/FareSummary';
import { SeatMap } from '@/features/seats/SeatMap';
import { SearchWidget } from '@/features/search/SearchWidget';
import { checkoutSchema } from '@/pages/public/CheckoutPage';
import { registerSchema } from '@/pages/public/AuthPages';
import { istDate } from '@/lib/utils';
import type { BusLayout, TripSeat } from '@/types';

const layout: BusLayout = { template: 'SEATER_2X2', rows: 1, columns: 4, aisleAfterColumn: 2, decks: 1 };
const seat = (n: number, status: TripSeat['status'], fare = 500): TripSeat => ({
  _id: `seat${n}`,
  seatNumber: `1${'ABCD'[n - 1]}`,
  deck: 'LOWER',
  row: 1,
  column: n,
  seatType: 'SEATER',
  position: n === 1 || n === 4 ? 'WINDOW' : 'AISLE',
  fare,
  status,
});
const seats = [seat(1, 'AVAILABLE', 550), seat(2, 'BOOKED'), seat(3, 'UNAVAILABLE'), seat(4, 'AVAILABLE')];

function wrap(ui: ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={ui} />
          <Route path="/search" element={<p>search results page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SeatMap', () => {
  it('renders every seat with its availability and blocks booked and unavailable seats', async () => {
    const onToggle = vi.fn();
    render(<SeatMap layout={layout} seats={seats} selected={[]} onToggle={onToggle} />);

    const available = screen.getByRole('button', { name: /Seat 1A, window, available/ });
    const booked = screen.getByRole('button', { name: /Seat 1B, aisle, booked/ });
    const unavailable = screen.getByRole('button', { name: /Seat 1C, aisle, unavailable/ });
    expect(booked).toBeDisabled();
    expect(unavailable).toBeDisabled();

    await userEvent.click(available);
    expect(onToggle).toHaveBeenCalledWith(expect.objectContaining({ _id: 'seat1' }));
    await userEvent.click(booked);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it('marks selected seats as pressed and enforces the selection limit', () => {
    render(<SeatMap layout={layout} seats={seats} selected={['seat1']} onToggle={() => undefined} maxSelectable={1} />);
    expect(screen.getByRole('button', { name: /Seat 1A.*selected/ })).toHaveAttribute('aria-pressed', 'true');
    // Limit reached: the other free seat can no longer be picked, but the selected one can be released.
    expect(screen.getByRole('button', { name: /Seat 1D/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Seat 1A/ })).toBeEnabled();
    expect(screen.getByText(/up to 1 seats/)).toBeInTheDocument();
  });

  it('shows a deck switcher for two-deck sleepers', async () => {
    const sleeper: TripSeat[] = [
      { ...seat(1, 'AVAILABLE'), _id: 'l1', seatNumber: 'L1', seatType: 'SLEEPER' },
      { ...seat(1, 'AVAILABLE'), _id: 'u1', seatNumber: 'U1', seatType: 'SLEEPER', deck: 'UPPER' },
    ];
    render(<SeatMap layout={{ ...layout, decks: 2 }} seats={sleeper} selected={[]} onToggle={() => undefined} />);
    expect(screen.getByRole('button', { name: /Seat L1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Seat U1/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: /Upper deck/ }));
    expect(screen.getByRole('button', { name: /Seat U1/ })).toBeInTheDocument();
  });
});

describe('fare preview', () => {
  it('matches the server formula: base × seats + seat premiums + GST', () => {
    expect(estimateFare(500, [550, 500])).toEqual({ baseFare: 1000, seatCharges: 50, taxPercent: 5, taxes: 52.5, total: 1102.5 });
  });

  it('renders the breakdown', () => {
    render(<FareBreakdown fare={estimateFare(500, [550, 500])} seatCount={2} />);
    expect(screen.getByText('Seat preference charges')).toBeInTheDocument();
    expect(screen.getByText('GST (5%)')).toBeInTheDocument();
    expect(screen.getByText('₹1,102.5')).toBeInTheDocument();
  });
});

describe('SearchWidget', () => {
  it('validates input before searching', async () => {
    wrap(<SearchWidget />);
    await userEvent.click(screen.getByRole('button', { name: /search buses/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a departure city');

    await userEvent.type(screen.getByLabelText(/from/i), 'Pune');
    await userEvent.type(screen.getByLabelText(/^to/i), 'pune');
    await userEvent.click(screen.getByRole('button', { name: /search buses/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Destination must differ from departure');
  });

  it('navigates to results with the search in the URL', async () => {
    wrap(<SearchWidget />);
    await userEvent.type(screen.getByLabelText(/from/i), 'Bengaluru');
    await userEvent.type(screen.getByLabelText(/^to/i), 'Chennai');
    await userEvent.click(screen.getByRole('button', { name: /search buses/i }));
    expect(await screen.findByText('search results page')).toBeInTheDocument();
  });

  it('swaps source and destination', async () => {
    wrap(<SearchWidget defaults={{ from: 'Pune', to: 'Mumbai', date: istDate(1), passengers: 1 }} />);
    await userEvent.click(screen.getByRole('button', { name: /swap/i }));
    expect(screen.getByLabelText(/from/i)).toHaveValue('Mumbai');
    expect(screen.getByLabelText(/^to/i)).toHaveValue('Pune');
  });
});

describe('form validation schemas', () => {
  it('rejects invalid passenger details at checkout', () => {
    const bad = checkoutSchema.safeParse({ passengers: [{ seatId: 's', name: 'J', age: 0, gender: '' }], contact: { email: 'x', phone: '123' } });
    expect(bad.success).toBe(false);
    const fields = bad.error!.issues.map((i) => i.path.join('.'));
    expect(fields).toEqual(expect.arrayContaining(['passengers.0.name', 'passengers.0.age', 'passengers.0.gender', 'contact.email', 'contact.phone']));

    const good = checkoutSchema.safeParse({ passengers: [{ seatId: 's', name: 'Asha Rao', age: '29', gender: 'FEMALE' }], contact: { email: 'a@example.com', phone: '9876543210' } });
    expect(good.success).toBe(true);
  });

  it('enforces password strength and confirmation on registration', () => {
    const weak = registerSchema.safeParse({ name: 'Asha Rao', email: 'a@example.com', phone: '', password: 'password', confirmPassword: 'other' });
    expect(weak.success).toBe(false);
    expect(weak.error!.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['password', 'confirmPassword']));
    expect(registerSchema.safeParse({ name: 'Asha Rao', email: 'a@example.com', phone: '', password: 'Travel@123', confirmPassword: 'Travel@123' }).success).toBe(true);
  });
});

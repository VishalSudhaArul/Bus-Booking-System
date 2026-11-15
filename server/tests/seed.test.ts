import { describe, expect, it, vi } from 'vitest';
import { DEMO, seedDatabase } from '../scripts/seed';
import { allModels } from '../src/config/models';
import { Booking, SeatAllocation } from '../src/modules/bookings/booking.model';
import { api } from './helpers/factory';

const counts = async () => Object.fromEntries(await Promise.all(allModels.map(async (m) => [m.modelName, await m.countDocuments()] as const)));

describe('seed script', () => {
  it('creates a usable demo dataset and is repeatable without duplicates', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const first = await seedDatabase();
    expect(first.tripsCreated).toBe(first.totalTrips);
    expect(first.bookings).toBeGreaterThan(20);
    expect(first.cancellations).toBeGreaterThan(0);
    const before = await counts();
    expect(before).toMatchObject({ Operator: 4, Bus: 9, Route: 9, Stop: 17, User: 6 });

    const second = await seedDatabase();
    expect(second).toMatchObject({ tripsCreated: 0, bookings: 0, cancellations: 0 });
    const after = await counts();
    // Audit entries and refresh tokens legitimately grow; business data must not.
    for (const name of ['Operator', 'Bus', 'Seat', 'Route', 'Stop', 'User', 'Trip', 'TripStop', 'Booking', 'BookingPassenger', 'SeatAllocation', 'Cancellation']) {
      expect(after[name], name).toBe(before[name]);
    }

    // Seeded data respects the integrity rule: no seat is actively held twice.
    const dupes = await SeatAllocation.aggregate([{ $match: { status: 'ACTIVE' } }, { $group: { _id: { t: '$tripId', s: '$seatId' }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }]);
    expect(dupes).toHaveLength(0);
    expect(await Booking.countDocuments({ status: 'PENDING' })).toBe(0);
  }, 180_000);

  it('produces working demo logins for every role', async () => {
    for (const [role, creds] of [['ADMIN', DEMO.admin], ['OPERATOR', DEMO.operator], ['PASSENGER', DEMO.passenger]] as const) {
      const res = await api().post('/api/v1/auth/login').send(creds);
      expect(res.status, role).toBe(200);
      expect(res.body.data.user.role).toBe(role);
    }
  });

  it('never adds a second set of demo bookings to a trip when re-run on a later day', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const perTrip = async () => new Map((await Booking.aggregate<{ _id: unknown; n: number }>([{ $match: { idempotencyKey: { $regex: '^seed-' } } }, { $group: { _id: '$tripId', n: { $sum: 1 } } }])).map((r) => [String(r._id), r.n]));
    const before = await perTrip();
    expect(before.size).toBeGreaterThan(0);

    // Pretend the seed runs again tomorrow (only Date is faked; driver timers stay real).
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(Date.now() + 24 * 60 * 60 * 1000));
    try {
      await seedDatabase();
    } finally {
      vi.useRealTimers();
    }

    const after = await perTrip();
    for (const [tripId, n] of before) expect(after.get(tripId), tripId).toBe(n);
  }, 180_000);
});

import { afterEach, describe, expect, it } from 'vitest';
import { setTransactionSupport } from '../src/config/db';
import { Booking, BookingPassenger, SeatAllocation } from '../src/modules/bookings/booking.model';
import { Cancellation } from '../src/modules/cancellations/cancellation.model';
import { calculateRefund, type CancellationPolicy } from '../src/modules/cancellations/cancellation.service';
import { api, bearer, book, makeUser, makeWorld } from './helpers/factory';

afterEach(() => setTransactionSupport(true));

const cancel = (user: Parameters<typeof bearer>[0], id: string, reason = 'Change of plans') =>
  api().post(`/api/v1/bookings/${id}/cancel`).set(bearer(user)).send({ reason });

describe('refund calculation (pure)', () => {
  const policy: CancellationPolicy = {
    cutoffHours: 2,
    tiers: [
      { minHours: 48, refundPercent: 100 },
      { minHours: 24, refundPercent: 75 },
      { minHours: 12, refundPercent: 50 },
      { minHours: 0, refundPercent: 0 },
    ],
  };
  const now = new Date('2026-06-01T00:00:00Z');
  const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);

  it.each([
    [72, 100, 1000, 0, 'FULL'],
    [48, 100, 1000, 0, 'FULL'],
    [47.9, 75, 750, 250, 'PARTIAL'],
    [24, 75, 750, 250, 'PARTIAL'],
    [13, 50, 500, 500, 'PARTIAL'],
    [5, 0, 0, 1000, 'NONE'],
    [2, 0, 0, 1000, 'NONE'],
  ])('%d hours before departure → %d%% refund', (hours, percent, refund, fee, type) => {
    const quote = calculateRefund(1000, at(hours), now, policy);
    expect(quote).toMatchObject({ allowed: true, refundPercent: percent, refundAmount: refund, cancellationFee: fee, refundType: type });
  });

  it('refuses cancellation inside the cut-off and after departure', () => {
    expect(calculateRefund(1000, at(1.5), now, policy)).toMatchObject({ allowed: false, refundAmount: 0 });
    expect(calculateRefund(1000, at(-1), now, policy)).toMatchObject({ allowed: false, reason: 'This trip has already departed' });
  });

  it('honours a custom policy and rounds to paise', () => {
    const custom: CancellationPolicy = { cutoffHours: 0, tiers: [{ minHours: 6, refundPercent: 33.33 }, { minHours: 0, refundPercent: 10 }] };
    expect(calculateRefund(999.99, at(10), now, custom)).toMatchObject({ refundAmount: 333.3, cancellationFee: 666.69, refundType: 'PARTIAL' });
    expect(calculateRefund(999.99, at(0.5), now, custom)).toMatchObject({ allowed: true, refundPercent: 10 });
  });
});

describe.each([
  { name: 'transactions', tx: true },
  { name: 'compensation (no transactions)', tx: false },
])('cancelling a booking — $name', ({ tx }) => {
  it('previews the refund, cancels, releases the seats and keeps the history', async () => {
    const world = await makeWorld({ departInHours: 30, baseFare: 1000 }); // 24-48h tier → 75%
    const passenger = await makeUser();
    setTransactionSupport(tx);
    const created = await book(passenger, world, [world.seats[0]._id, world.seats[1]._id]);
    const id = created.body.data._id;
    const total = created.body.data.fare.total; // 2100

    const quote = await api().get(`/api/v1/bookings/${id}/cancellation-quote`).set(bearer(passenger));
    expect(quote.status).toBe(200);
    expect(quote.body.data).toMatchObject({ allowed: true, refundPercent: 75, refundAmount: 1575, cancellationFee: 525, refundType: 'PARTIAL', total });

    const res = await cancel(passenger, id, 'Meeting was moved');
    expect(res.status).toBe(200);
    expect(res.body.data.cancellation).toMatchObject({ reason: 'Meeting was moved', refundPercent: 75, refundAmount: 1575, cancellationFee: 525, refundStatus: 'PROCESSED', status: 'COMPLETED' });
    expect(res.body.data.cancellation.refundReference).toMatch(/^RFND-/);
    expect(res.body.data.booking).toMatchObject({ status: 'CANCELLED', payment: { status: 'PARTIALLY_REFUNDED' } });
    expect(res.body.data.booking.cancelledAt).toBeTruthy();

    // History is preserved: the booking, its passengers and its (released) allocations still exist.
    expect(res.body.data.booking.passengers).toHaveLength(2);
    expect(await Booking.countDocuments({ _id: id })).toBe(1);
    expect(await BookingPassenger.countDocuments({ bookingId: id })).toBe(2);
    expect(await SeatAllocation.countDocuments({ bookingId: id, status: 'RELEASED' })).toBe(2);
    expect(await SeatAllocation.countDocuments({ bookingId: id, status: 'ACTIVE' })).toBe(0);

    // The seats are sellable again, and the seat map shows it.
    const map = await api().get(`/api/v1/trips/${world.tripId}/seats`);
    expect(map.body.data.seats.filter((s: { status: string }) => s.status === 'BOOKED')).toHaveLength(0);
    const rebook = await book(await makeUser(), world, [world.seats[0]._id]);
    expect(rebook.status).toBe(201);

    const history = await api().get('/api/v1/cancellations').set(bearer(passenger));
    expect(history.body.data).toHaveLength(1);
    expect(history.body.data[0].booking.pnr).toBe(created.body.data.pnr);
  });

  it('rejects a repeated cancellation without refunding twice', async () => {
    const world = await makeWorld();
    const passenger = await makeUser();
    setTransactionSupport(tx);
    const id = (await book(passenger, world, [world.seats[0]._id])).body.data._id;

    expect((await cancel(passenger, id)).status).toBe(200);
    const again = await cancel(passenger, id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_CANCELLED');
    expect(await Cancellation.countDocuments({ bookingId: id })).toBe(1);
  });

  it('processes simultaneous cancellations exactly once', async () => {
    const world = await makeWorld();
    const passenger = await makeUser();
    setTransactionSupport(tx);
    const id = (await book(passenger, world, [world.seats[0]._id])).body.data._id;

    const results = await Promise.all(Array.from({ length: 6 }, () => cancel(passenger, id)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(5);
    expect(await Cancellation.countDocuments({ bookingId: id })).toBe(1);
    expect(await SeatAllocation.countDocuments({ bookingId: id, status: 'ACTIVE' })).toBe(0);
  });
});

describe('cancellation rules', () => {
  it('gives a full refund when cancelled early', async () => {
    const world = await makeWorld({ departInHours: 100 });
    const passenger = await makeUser();
    const created = await book(passenger, world, [world.seats[0]._id]);
    const res = await cancel(passenger, created.body.data._id);
    expect(res.body.data.cancellation).toMatchObject({ refundPercent: 100, refundAmount: created.body.data.fare.total, cancellationFee: 0 });
    expect(res.body.data.booking.payment.status).toBe('REFUNDED');
  });

  it('allows a late cancellation with no refund', async () => {
    const world = await makeWorld({ departInHours: 6 });
    const passenger = await makeUser();
    const created = await book(passenger, world, [world.seats[0]._id]);
    const res = await cancel(passenger, created.body.data._id);
    expect(res.status).toBe(200);
    expect(res.body.data.cancellation).toMatchObject({ refundPercent: 0, refundAmount: 0, refundStatus: 'NOT_APPLICABLE' });
    expect(res.body.data.booking.payment.status).toBe('NOT_REFUNDED');
    expect(await SeatAllocation.countDocuments({ bookingId: created.body.data._id, status: 'ACTIVE' })).toBe(0);
  });

  it('refuses cancellation inside the cut-off window and keeps the seat', async () => {
    const world = await makeWorld({ departInHours: 1 });
    const passenger = await makeUser();
    const created = await book(passenger, world, [world.seats[0]._id]);
    const id = created.body.data._id;

    const quote = await api().get(`/api/v1/bookings/${id}/cancellation-quote`).set(bearer(passenger));
    expect(quote.body.data.allowed).toBe(false);

    const res = await cancel(passenger, id);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CANCELLATION_NOT_ALLOWED');
    expect((await Booking.findById(id))!.status).toBe('CONFIRMED');
    expect(await SeatAllocation.countDocuments({ bookingId: id, status: 'ACTIVE' })).toBe(1);
  });

  it('rejects invalid cancellation requests', async () => {
    const world = await makeWorld();
    const passenger = await makeUser();
    const id = (await book(passenger, world, [world.seats[0]._id])).body.data._id;

    expect((await api().post(`/api/v1/bookings/${id}/cancel`).set(bearer(passenger)).send({})).status).toBe(400);
    expect((await api().post(`/api/v1/bookings/${id}/cancel`).set(bearer(passenger)).send({ reason: 'x' })).status).toBe(400);
    expect((await cancel(passenger, '665f1c2e9b1e8a0012a4c001')).status).toBe(404);
    expect((await cancel(passenger, 'not-an-id')).status).toBe(400);
    expect((await api().post(`/api/v1/bookings/${id}/cancel`).send({ reason: 'anonymous' })).status).toBe(401);
    // Operators cancel trips, not individual bookings.
    expect((await cancel(world.operatorUser, id)).status).toBe(403);
    expect((await Booking.findById(id))!.status).toBe('CONFIRMED');
  });

  it('lets an admin cancel on behalf of a passenger', async () => {
    const world = await makeWorld();
    const id = (await book(await makeUser(), world, [world.seats[0]._id])).body.data._id;
    const res = await cancel(world.admin, id, 'Customer support request');
    expect(res.status).toBe(200);
    expect((await Cancellation.findOne({ bookingId: id }))!.cancelledByRole).toBe('ADMIN');
  });

  it('refunds every passenger in full when the operator cancels the trip', async () => {
    const world = await makeWorld({ departInHours: 6 }); // would normally be a 0% tier
    const [a, b] = [await makeUser(), await makeUser()];
    const first = await book(a, world, [world.seats[0]._id]);
    const second = await book(b, world, [world.seats[1]._id, world.seats[2]._id]);

    const res = await api().patch(`/api/v1/trips/${world.tripId}`).set(bearer(world.operatorUser)).send({ status: 'CANCELLED' });
    expect(res.status).toBe(200);
    expect(res.body.data.cancelledBookings).toBe(2);

    for (const created of [first, second]) {
      const c = await Cancellation.findOne({ bookingId: created.body.data._id }).lean();
      expect(c).toMatchObject({ refundPercent: 100, refundAmount: created.body.data.fare.total, cancelledByRole: 'OPERATOR' });
    }
    expect(await SeatAllocation.countDocuments({ tripId: world.tripId, status: 'ACTIVE' })).toBe(0);
    // A cancelled trip can no longer be booked.
    expect((await book(await makeUser(), world, [world.seats[5]._id])).status).toBe(409);
  });
});

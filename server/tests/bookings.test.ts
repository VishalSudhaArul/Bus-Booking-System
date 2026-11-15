import { afterEach, describe, expect, it, vi } from 'vitest';
import { setTransactionSupport, supportsTransactions } from '../src/config/db';
import { Booking, BookingPassenger, SeatAllocation } from '../src/modules/bookings/booking.model';
import { reconcileBookings } from '../src/modules/bookings/booking.service';
import { Seat } from '../src/modules/seats/seat.model';
import { pnrGenerator } from '../src/utils/pnr';
import { api, bearer, book, bookingBody, makeUser, makeWorld, newKey } from './helpers/factory';

afterEach(() => {
  vi.restoreAllMocks();
  setTransactionSupport(true);
});

// Every integrity test runs twice: with real transactions (Atlas / replica set)
// and with the compensation strategy used when transactions are unavailable.
const MODES = [
  { name: 'transactions', tx: true },
  { name: 'compensation (no transactions)', tx: false },
];

describe('booking a seat', () => {
  it('runs against a deployment that really supports transactions', () => {
    expect(supportsTransactions()).toBe(true);
  });

  it('confirms a booking with a PNR, passengers, seats and a server-computed fare', async () => {
    const world = await makeWorld({ baseFare: 500, windowPremium: 50 });
    const passenger = await makeUser();
    const res = await book(passenger, world, [world.seats[0]._id, world.seats[1]._id]);

    expect(res.status).toBe(201);
    const b = res.body.data;
    expect(b.pnr).toMatch(/^BN[2-9A-Z]{8}$/);
    expect(b.status).toBe('CONFIRMED');
    expect(b.passengers.map((p: { seatNumber: string }) => p.seatNumber)).toEqual(['1A', '1B']);
    // 2 x 500 base + 50 window premium = 1050, 5% GST = 52.5
    expect(b.fare).toEqual({ baseFare: 1000, seatCharges: 50, discount: 0, taxPercent: 5, taxes: 52.5, total: 1102.5 });
    expect(b.payment.status).toBe('PAID');
    expect(b.route.sourceCity).toBeTruthy();
    expect(b.boardingPoint.time).toBeTruthy();
    expect(JSON.stringify(b)).not.toMatch(/idempotencyKey|requestHash/);

    expect(await SeatAllocation.countDocuments({ bookingId: b._id, status: 'ACTIVE' })).toBe(2);
  });

  it('ignores client-supplied prices, status and PNR', async () => {
    const world = await makeWorld({ baseFare: 800 });
    const passenger = await makeUser();
    const res = await book(passenger, world, [world.seats[2]._id], newKey(), { fare: { total: 1 }, total: 1, status: 'CANCELLED', pnr: 'HACKED0001' });
    expect(res.status).toBe(201);
    expect(res.body.data.fare.total).toBe(840);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.pnr).not.toBe('HACKED0001');
  });

  it('rejects invalid passenger details', async () => {
    const world = await makeWorld();
    const passenger = await makeUser();
    const body = bookingBody(world, [world.seats[0]._id]);
    const cases: Record<string, unknown>[] = [
      { passengers: [{ ...body.passengers[0], age: 0 }] },
      { passengers: [{ ...body.passengers[0], age: 'old' }] },
      { passengers: [{ ...body.passengers[0], name: '' }] },
      { passengers: [{ ...body.passengers[0], gender: 'ROBOT' }] },
      { passengers: [] },
      { contact: { email: 'nope', phone: '123' } },
    ];
    for (const override of cases) {
      const res = await api().post('/api/v1/bookings').set(bearer(passenger)).set('Idempotency-Key', newKey()).send({ ...body, ...override });
      expect(res.status, JSON.stringify(override)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await Booking.countDocuments({ tripId: world.tripId })).toBe(0);
  });

  it('rejects seats from another bus, duplicate seats, disabled seats and too many seats', async () => {
    const world = await makeWorld();
    const other = await makeWorld();
    const passenger = await makeUser();

    const foreign = await book(passenger, world, [other.seats[0]._id]);
    expect(foreign.status).toBe(400);
    expect(foreign.body.error.code).toBe('INVALID_SEATS');

    expect((await book(passenger, world, [world.seats[0]._id, world.seats[0]._id])).status).toBe(400);
    expect((await book(passenger, world, world.seats.slice(0, 7).map((s) => s._id))).status).toBe(400);

    await Seat.updateOne({ _id: world.seats[5]._id }, { isActive: false });
    const disabled = await book(passenger, world, [world.seats[5]._id]);
    expect(disabled.status).toBe(409);
    expect(disabled.body.error.code).toBe('SEAT_UNAVAILABLE');

    expect(await SeatAllocation.countDocuments({ tripId: world.tripId })).toBe(0);
  });

  it('rejects invalid boarding/dropping points and unknown trips', async () => {
    const world = await makeWorld();
    const passenger = await makeUser();
    const swapped = await book(passenger, world, [world.seats[0]._id], newKey(), { boardingStopId: world.droppingStopId, droppingStopId: world.boardingStopId });
    expect(swapped.status).toBe(400);
    const ghost = await book(passenger, world, [world.seats[0]._id], newKey(), { tripId: '665f1c2e9b1e8a0012a4c001' });
    expect(ghost.status).toBe(404);
  });

  it('refuses to sell a seat that is already booked', async () => {
    const world = await makeWorld();
    const [first, second] = [await makeUser(), await makeUser()];
    expect((await book(first, world, [world.seats[0]._id])).status).toBe(201);

    const res = await book(second, world, [world.seats[0]._id]);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SEAT_ALREADY_BOOKED');
    expect(res.body.error.details.seats).toEqual([{ seatId: world.seats[0]._id, seatNumber: '1A' }]);
  });

  it('requires an Idempotency-Key and authentication', async () => {
    const world = await makeWorld();
    const passenger = await makeUser();
    const noKey = await api().post('/api/v1/bookings').set(bearer(passenger)).send(bookingBody(world, [world.seats[0]._id]));
    expect(noKey.status).toBe(400);
    const anonymous = await api().post('/api/v1/bookings').set('Idempotency-Key', newKey()).send(bookingBody(world, [world.seats[0]._id]));
    expect(anonymous.status).toBe(401);
  });

  it('never issues a duplicate PNR: a collision is retried with a fresh one', async () => {
    const world = await makeWorld();
    const [first, second] = [await makeUser(), await makeUser()];
    const spy = vi.spyOn(pnrGenerator, 'next').mockReturnValueOnce('BNDUPLICATE').mockReturnValueOnce('BNDUPLICATE').mockReturnValueOnce('BNSECOND22');

    const a = await book(first, world, [world.seats[0]._id]);
    const b = await book(second, world, [world.seats[1]._id]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.data.pnr).toBe('BNDUPLICATE');
    expect(b.body.data.pnr).toBe('BNSECOND22');
    expect(spy).toHaveBeenCalledTimes(3);
    expect(await Booking.countDocuments({ pnr: 'BNDUPLICATE' })).toBe(1);
  });

  it('generates unique PNRs across many bookings', async () => {
    const world = await makeWorld({ rows: 5 });
    const pnrs = new Set<string>();
    for (const seat of world.seats.slice(0, 12)) {
      const res = await book(await makeUser(), world, [seat._id]);
      pnrs.add(res.body.data.pnr);
    }
    expect(pnrs.size).toBe(12);
  });
});

describe.each(MODES)('seat integrity under concurrency — $name', ({ tx }) => {
  it('lets exactly one of many simultaneous requests for the same seat succeed', async () => {
    const world = await makeWorld();
    const users = await Promise.all(Array.from({ length: 12 }, () => makeUser()));
    setTransactionSupport(tx);

    const results = await Promise.all(users.map((u) => book(u, world, [world.seats[0]._id])));

    const statuses = results.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(11);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.error.code === 'SEAT_ALREADY_BOOKED')).toBe(true);

    // The database agrees: one active allocation, one confirmed booking, one passenger row.
    expect(await SeatAllocation.countDocuments({ tripId: world.tripId, seatId: world.seats[0]._id, status: 'ACTIVE' })).toBe(1);
    expect(await Booking.countDocuments({ tripId: world.tripId })).toBe(1);
    expect(await Booking.countDocuments({ tripId: world.tripId, status: 'CONFIRMED' })).toBe(1);
    expect(await BookingPassenger.countDocuments({ tripId: world.tripId })).toBe(1);
  });

  it('never double-sells when overlapping multi-seat requests race', async () => {
    const world = await makeWorld({ rows: 4 });
    const users = await Promise.all(Array.from({ length: 8 }, () => makeUser()));
    setTransactionSupport(tx);
    const s = world.seats.map((x) => x._id);
    // Each request wants two seats and overlaps its neighbours: [0,1] [1,2] [2,3] …
    const results = await Promise.all(users.map((u, i) => book(u, world, [s[i], s[i + 1]])));

    expect(results.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    const confirmed = results.filter((r) => r.status === 201);
    expect(confirmed.length).toBeGreaterThanOrEqual(1);

    const active = await SeatAllocation.find({ tripId: world.tripId, status: 'ACTIVE' }).lean();
    const seatIds = active.map((a) => String(a.seatId));
    expect(new Set(seatIds).size).toBe(seatIds.length); // no seat held twice
    expect(active).toHaveLength(confirmed.length * 2); // losers left nothing behind
    expect(await Booking.countDocuments({ tripId: world.tripId })).toBe(confirmed.length);
    expect(await BookingPassenger.countDocuments({ tripId: world.tripId })).toBe(confirmed.length * 2);
  });

  it('rolls back a partial allocation and leaves the free seat bookable', async () => {
    const world = await makeWorld();
    const [holder, buyer] = [await makeUser(), await makeUser()];
    const [seatA, seatB] = [world.seats[0]._id, world.seats[1]._id];
    setTransactionSupport(tx);

    expect((await book(holder, world, [seatB])).status).toBe(201);

    // seatA is free, seatB is taken: the whole request must fail…
    const key = newKey();
    const res = await book(buyer, world, [seatA, seatB], key);
    expect(res.status).toBe(409);
    expect(res.body.error.details.seats.map((x: { seatNumber: string }) => x.seatNumber)).toEqual(['1B']);

    // …and nothing of it may remain: seatA not held, no booking, no passengers.
    expect(await SeatAllocation.countDocuments({ tripId: world.tripId, seatId: seatA })).toBe(0);
    expect(await Booking.countDocuments({ userId: buyer.id })).toBe(0);
    expect(await BookingPassenger.countDocuments({ tripId: world.tripId })).toBe(1);

    // Recovery: the buyer can immediately take seatA on its own.
    const retry = await book(buyer, world, [seatA]);
    expect(retry.status).toBe(201);
    expect(retry.body.data.passengers[0].seatNumber).toBe('1A');
  });

  it('is idempotent: repeating a request returns the same booking', async () => {
    const world = await makeWorld();
    const passenger = await makeUser();
    setTransactionSupport(tx);
    const key = newKey();

    const first = await book(passenger, world, [world.seats[0]._id], key);
    const second = await book(passenger, world, [world.seats[0]._id], key);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers['idempotent-replayed']).toBe('true');
    expect(second.body.data._id).toBe(first.body.data._id);
    expect(second.body.data.pnr).toBe(first.body.data.pnr);
    expect(await Booking.countDocuments({ userId: passenger.id })).toBe(1);
    expect(await SeatAllocation.countDocuments({ tripId: world.tripId })).toBe(1);
  });

  it('is idempotent when the same request is fired several times at once', async () => {
    const world = await makeWorld();
    const passenger = await makeUser();
    setTransactionSupport(tx);
    const key = newKey();

    const results = await Promise.all(Array.from({ length: 6 }, () => book(passenger, world, [world.seats[0]._id, world.seats[1]._id], key)));

    // Never a second booking; in-flight duplicates are told to retry (409), completed ones are replayed.
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.every((r) => [200, 201, 409].includes(r.status))).toBe(true);
    expect(await Booking.countDocuments({ userId: passenger.id })).toBe(1);
    expect(await SeatAllocation.countDocuments({ tripId: world.tripId, status: 'ACTIVE' })).toBe(2);
    expect(await BookingPassenger.countDocuments({ tripId: world.tripId })).toBe(2);

    const after = await book(passenger, world, [world.seats[0]._id, world.seats[1]._id], key);
    expect(after.status).toBe(200);
  });
});

describe('idempotency keys and ownership', () => {
  it('rejects a key reused for a different request', async () => {
    const world = await makeWorld();
    const passenger = await makeUser();
    const key = newKey();
    expect((await book(passenger, world, [world.seats[0]._id], key)).status).toBe(201);
    const res = await book(passenger, world, [world.seats[1]._id], key);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(await Booking.countDocuments({ userId: passenger.id })).toBe(1);
  });

  it('scopes keys per user', async () => {
    const world = await makeWorld();
    const [a, b] = [await makeUser(), await makeUser()];
    const key = newKey();
    expect((await book(a, world, [world.seats[0]._id], key)).status).toBe(201);
    expect((await book(b, world, [world.seats[1]._id], key)).status).toBe(201);
  });

  it("hides one passenger's booking from another and lists only own bookings", async () => {
    const world = await makeWorld();
    const [owner, stranger] = [await makeUser(), await makeUser()];
    const created = await book(owner, world, [world.seats[0]._id]);
    const id = created.body.data._id;

    expect((await api().get(`/api/v1/bookings/${id}`).set(bearer(owner))).status).toBe(200);
    expect((await api().get(`/api/v1/bookings/${id}`).set(bearer(stranger))).status).toBe(404);
    expect((await api().get(`/api/v1/bookings/pnr/${created.body.data.pnr}`).set(bearer(stranger))).status).toBe(404);
    expect((await api().post(`/api/v1/bookings/${id}/cancel`).set(bearer(stranger)).send({ reason: 'not mine' })).status).toBe(404);

    const mine = await api().get('/api/v1/bookings/me').set(bearer(owner));
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({ pnr: created.body.data.pnr, seats: ['1A'] });
    expect((await api().get('/api/v1/bookings/me').set(bearer(stranger))).body.data).toHaveLength(0);
  });

  it('shows the booking to the owning operator and admin, not to another operator', async () => {
    const world = await makeWorld();
    const rival = await makeWorld();
    const created = await book(await makeUser(), world, [world.seats[0]._id]);
    const id = created.body.data._id;

    expect((await api().get(`/api/v1/bookings/${id}`).set(bearer(world.operatorUser))).status).toBe(200);
    expect((await api().get(`/api/v1/bookings/${id}`).set(bearer(world.admin))).status).toBe(200);
    expect((await api().get(`/api/v1/bookings/${id}`).set(bearer(rival.operatorUser))).status).toBe(403);

    const rivalList = await api().get('/api/v1/bookings').set(bearer(rival.operatorUser));
    expect(rivalList.body.data).toHaveLength(0);
    const ownList = await api().get(`/api/v1/bookings?search=${created.body.data.pnr}`).set(bearer(world.operatorUser));
    expect(ownList.body.data).toHaveLength(1);
  });
});

describe('crash recovery (compensation strategy)', () => {
  it('discards bookings stuck in PENDING and frees their seats', async () => {
    const world = await makeWorld();
    const passenger = await makeUser();
    const ok = await book(passenger, world, [world.seats[0]._id]);

    // Simulate a process that died after allocating a seat but before confirming.
    const stuck = await Booking.findById(ok.body.data._id).lean();
    const { _id: _ignored, ...copy } = stuck!;
    const pending = await Booking.create({ ...copy, pnr: 'BNSTUCK001', idempotencyKey: newKey(), status: 'PENDING' });
    await Booking.collection.updateOne({ _id: pending._id }, { $set: { createdAt: new Date(Date.now() - 10 * 60_000) } });
    await SeatAllocation.create({ tripId: world.tripId, seatId: world.seats[3]._id, bookingId: pending._id, status: 'ACTIVE' });

    const blocked = await book(await makeUser(), world, [world.seats[3]._id]);
    expect(blocked.status).toBe(409);

    const report = await reconcileBookings();
    expect(report.discardedPending).toBe(1);
    expect(await Booking.exists({ _id: pending._id })).toBeNull();
    expect((await book(await makeUser(), world, [world.seats[3]._id])).status).toBe(201);
    // The healthy booking was not touched.
    expect(await SeatAllocation.countDocuments({ bookingId: ok.body.data._id, status: 'ACTIVE' })).toBe(1);
  });
});

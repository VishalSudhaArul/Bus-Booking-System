import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, book, makeUser, makeWorld, type TestUser, type World } from './helpers/factory';

describe('reporting', () => {
  let world: World; // 12-seat bus, fare 1000
  let rival: World; // another operator
  let admin: TestUser;
  let cancelledPnr: string;

  beforeAll(async () => {
    world = await makeWorld({ baseFare: 1000, departInHours: 30 });
    rival = await makeWorld({ baseFare: 400, departInHours: 30 });
    admin = world.admin;

    // Operator A: 3 bookings / 5 seats, then one 2-seat booking is cancelled (75% refund).
    await book(await makeUser(), world, [world.seats[0]._id]);
    await book(await makeUser(), world, [world.seats[1]._id, world.seats[2]._id]);
    const canceller = await makeUser();
    const toCancel = await book(canceller, world, [world.seats[3]._id, world.seats[4]._id]);
    cancelledPnr = toCancel.body.data.pnr;
    await api().post(`/api/v1/bookings/${toCancel.body.data._id}/cancel`).set(bearer(canceller)).send({ reason: 'Plans changed' });

    // Operator B: 1 booking / 1 seat.
    await book(await makeUser(), rival, [rival.seats[0]._id]);
  });

  it('produces a correct passenger manifest', async () => {
    const res = await api().get(`/api/v1/trips/${world.tripId}/manifest`).set(bearer(world.operatorUser));
    expect(res.status).toBe(200);
    const { passengers, summary, trip } = res.body.data;

    // Only confirmed passengers, in seat order; the cancelled booking is absent.
    expect(passengers.map((p: { seatNumber: string }) => p.seatNumber)).toEqual(['1A', '1B', '1C']);
    expect(passengers.every((p: { pnr: string }) => p.pnr !== cancelledPnr)).toBe(true);
    expect(passengers[0]).toMatchObject({ name: 'Passenger A', age: 25, gender: 'MALE', contactPhone: '9876543210', fare: 1000 });
    expect(passengers[0].boardingPoint).toMatch(/Central Stand/);
    expect(passengers[0].droppingPoint).toMatch(/Main Terminal/);
    expect(passengers[1].pnr).toBe(passengers[2].pnr); // booked together
    expect(summary).toEqual({ totalSeats: 12, bookedSeats: 3, availableSeats: 9, occupancyPercent: 25, bookings: 2 });
    expect(trip.route.sourceCity).toBeTruthy();
  });

  it('reports correct seat occupancy per trip', async () => {
    const res = await api().get('/api/v1/reports/occupancy').set(bearer(world.operatorUser));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ _id: world.tripId, totalSeats: 12, bookedSeats: 3, occupancyPercent: 25 });
    expect(res.body.meta.summary).toEqual({ capacity: 12, sold: 3, percent: 25 });
  });

  it('reports correct booking totals for an operator', async () => {
    const res = await api().get('/api/v1/reports/bookings').set(bearer(world.operatorUser));
    const { totals, routes } = res.body.data;
    // Confirmed: 1050 + 2100 = 3150. Cancelled 2100 at 75% → 1575 refunded, 525 kept.
    expect(totals).toEqual({
      totalBookings: 3,
      confirmedBookings: 2,
      cancelledBookings: 1,
      seatsSold: 3,
      revenue: 3675,
      refundsIssued: 1575,
      cancellationFees: 525,
    });
    expect(routes).toHaveLength(1);
    expect(routes[0]).toMatchObject({ bookings: 3, confirmed: 2, cancelled: 1, seats: 3, revenue: 3150 });
  });

  it('builds the operator dashboard from real records, scoped to that operator', async () => {
    const res = await api().get('/api/v1/reports/dashboard').set(bearer(world.operatorUser));
    expect(res.status).toBe(200);
    const { stats, trend, recentBookings, routeSummary } = res.body.data;
    expect(stats).toMatchObject({
      totalBookings: 3,
      confirmedBookings: 2,
      cancelledBookings: 1,
      scheduledTrips: 1,
      totalBuses: 1,
      occupancyPercent: 25,
      revenue: 3675,
    });
    expect(stats.activeOperators).toBeUndefined();
    expect(trend).toHaveLength(14);
    expect(trend.reduce((n: number, d: { bookings: number }) => n + d.bookings, 0)).toBe(3);
    expect(recentBookings).toHaveLength(3);
    expect(routeSummary).toHaveLength(1);

    const other = await api().get('/api/v1/reports/dashboard').set(bearer(rival.operatorUser));
    expect(other.body.data.stats).toMatchObject({ totalBookings: 1, confirmedBookings: 1, cancelledBookings: 0, revenue: 420 });
  });

  it('gives the admin the combined picture', async () => {
    const res = await api().get('/api/v1/reports/dashboard').set(bearer(admin));
    expect(res.body.data.stats).toMatchObject({
      totalBookings: 4,
      confirmedBookings: 3,
      cancelledBookings: 1,
      scheduledTrips: 2,
      totalBuses: 2,
      revenue: 4095,
      activeOperators: 2,
    });
    // 4 of 24 seats filled across both trips.
    expect(res.body.data.stats.occupancyPercent).toBeCloseTo(16.67, 2);
    expect(res.body.data.routeSummary).toHaveLength(2);

    const bookings = await api().get('/api/v1/bookings?status=CANCELLED').set(bearer(admin));
    expect(bookings.body.data.map((b: { pnr: string }) => b.pnr)).toEqual([cancelledPnr]);
    const cancellations = await api().get('/api/v1/cancellations').set(bearer(admin));
    expect(cancellations.body.data).toHaveLength(1);
  });

  it('blocks reports for passengers and other operators', async () => {
    const passenger = await makeUser();
    expect((await api().get('/api/v1/reports/dashboard').set(bearer(passenger))).status).toBe(403);
    expect((await api().get(`/api/v1/trips/${world.tripId}/manifest`).set(bearer(passenger))).status).toBe(403);
    expect((await api().get(`/api/v1/trips/${world.tripId}/manifest`).set(bearer(rival.operatorUser))).status).toBe(403);
    expect((await api().get('/api/v1/reports/occupancy')).status).toBe(401);
  });
});

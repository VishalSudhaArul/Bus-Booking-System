import { beforeAll, describe, expect, it } from 'vitest';
import { createTrips } from '../src/modules/trips/trip.service';
import { istDateString } from '../src/utils/time';
import { api, bearer, book, hoursFromNow, makeUser, makeWorld, type World } from './helpers/factory';

const search = (params: Record<string, string | number>) => api().get('/api/v1/trips/search').query(params);

describe('trip search', () => {
  let seater: World;
  let sleeper: World;
  let date: string;

  beforeAll(async () => {
    // Two operators on the same city pair, departing ~3 days out on the same IST date.
    const depart = hoursFromNow(72);
    depart.setUTCHours(6, 0, 0, 0); // 11:30 IST — safely inside one IST day
    const inHours = (depart.getTime() - Date.now()) / 3_600_000;
    date = istDateString(depart);
    seater = await makeWorld({ source: 'Bengaluru', destination: 'Chennai', template: 'SEATER_2X2', rows: 3, baseFare: 600, departInHours: inHours, isAC: false });
    sleeper = await makeWorld({ source: 'Bengaluru', destination: 'Chennai', template: 'SLEEPER_2X1', rows: 2, baseFare: 1100, departInHours: inHours + 3, isAC: true });
  });

  it('returns matching trips with operator, bus, times, stops, fare and live availability', async () => {
    const res = await search({ from: 'bengaluru', to: 'CHENNAI', date });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const first = res.body.data[0];
    expect(first).toMatchObject({ _id: seater.tripId, baseFare: 600, minFare: 600, totalSeats: 12, availableSeats: 12, durationMinutes: 360 });
    expect(first.operator.name).toEqual(expect.any(String));
    expect(first.bus.busType).toBe('SEATER');
    expect(first.boardingPoints).toHaveLength(1);
    expect(first.droppingPoints).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 2, page: 1 });
  });

  it('reflects booked seats in availability', async () => {
    const passenger = await makeUser();
    expect((await book(passenger, seater, [seater.seats[0]._id, seater.seats[1]._id])).status).toBe(201);
    const res = await search({ from: 'Bengaluru', to: 'Chennai', date });
    expect(res.body.data.find((t: { _id: string }) => t._id === seater.tripId).availableSeats).toBe(10);
  });

  it('hides trips that cannot seat the whole party', async () => {
    const res = await search({ from: 'Bengaluru', to: 'Chennai', date, passengers: 6 });
    // Seater has 10 free seats, sleeper has 12 berths: both still fit 6.
    expect(res.body.data).toHaveLength(2);
    const passenger = await makeUser();
    await book(passenger, sleeper, sleeper.seats.slice(0, 6).map((s) => s._id));
    const other = await makeUser();
    await book(other, sleeper, sleeper.seats.slice(6, 9).map((s) => s._id));
    const after = await search({ from: 'Bengaluru', to: 'Chennai', date, passengers: 6 });
    expect(after.body.data.map((t: { _id: string }) => t._id)).toEqual([seater.tripId]);
  });

  it('filters by bus type and AC', async () => {
    const sleepers = await search({ from: 'Bengaluru', to: 'Chennai', date, busType: 'SLEEPER' });
    expect(sleepers.body.data.map((t: { _id: string }) => t._id)).toEqual([sleeper.tripId]);
    const nonAc = await search({ from: 'Bengaluru', to: 'Chennai', date, ac: 'false' });
    expect(nonAc.body.data.map((t: { _id: string }) => t._id)).toEqual([seater.tripId]);
    const cheap = await search({ from: 'Bengaluru', to: 'Chennai', date, maxPrice: 700 });
    expect(cheap.body.data.map((t: { _id: string }) => t._id)).toEqual([seater.tripId]);
  });

  it('sorts by price and by departure time', async () => {
    const priceDesc = await search({ from: 'Bengaluru', to: 'Chennai', date, sort: 'price', order: 'desc' });
    expect(priceDesc.body.data.map((t: { _id: string }) => t._id)).toEqual([sleeper.tripId, seater.tripId]);
    const departure = await search({ from: 'Bengaluru', to: 'Chennai', date, sort: 'departure' });
    expect(departure.body.data.map((t: { _id: string }) => t._id)).toEqual([seater.tripId, sleeper.tripId]);
  });

  it('paginates results', async () => {
    const page1 = await search({ from: 'Bengaluru', to: 'Chennai', date, limit: 1, page: 1 });
    const page2 = await search({ from: 'Bengaluru', to: 'Chennai', date, limit: 1, page: 2 });
    expect(page1.body.data).toHaveLength(1);
    expect(page2.body.data).toHaveLength(1);
    expect(page1.body.data[0]._id).not.toBe(page2.body.data[0]._id);
    expect(page1.body.meta).toMatchObject({ total: 2, totalPages: 2, limit: 1 });
  });

  it('returns an empty list for an unknown route', async () => {
    const res = await search({ from: 'Atlantis', to: 'Chennai', date });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.total).toBe(0);
  });

  it('returns an empty list when no trips run on that date', async () => {
    const res = await search({ from: 'Bengaluru', to: 'Chennai', date: istDateString(hoursFromNow(24 * 40)) });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it('rejects invalid searches', async () => {
    expect((await search({ from: 'Bengaluru', to: 'bengaluru', date })).status).toBe(400);
    expect((await search({ from: 'Bengaluru', to: 'Chennai', date: '12-01-2026' })).status).toBe(400);
    expect((await search({ from: 'Bengaluru', to: 'Chennai' })).status).toBe(400);
    expect((await search({ from: 'Bengaluru', to: 'Chennai', date, passengers: 99 })).status).toBe(400);
  });
});

describe('trip details and management', () => {
  it('serves trip details and a live seat map', async () => {
    const world = await makeWorld({ windowPremium: 50 });
    const details = await api().get(`/api/v1/trips/${world.tripId}`);
    expect(details.status).toBe(200);
    expect(details.body.data).toMatchObject({ status: 'SCHEDULED', totalSeats: 12, availableSeats: 12 });

    const passenger = await makeUser();
    await book(passenger, world, [world.seats[0]._id]);
    const map = await api().get(`/api/v1/trips/${world.tripId}/seats`);
    expect(map.headers['cache-control']).toBe('no-store');
    const seat = (n: number) => map.body.data.seats.find((s: { _id: string }) => s._id === world.seats[n]._id);
    expect(seat(0)).toMatchObject({ status: 'BOOKED', fare: 550 }); // window seat: 500 + 50
    expect(seat(1)).toMatchObject({ status: 'AVAILABLE', fare: 500 });
  });

  it('returns 404 for an unknown trip and 400 for a malformed id', async () => {
    expect((await api().get('/api/v1/trips/665f1c2e9b1e8a0012a4c001')).status).toBe(404);
    expect((await api().get('/api/v1/trips/not-an-id')).status).toBe(400);
  });

  it('refuses to double-book a bus on overlapping trips', async () => {
    const world = await makeWorld({ departInHours: 100 });
    const res = await api()
      .post('/api/v1/trips')
      .set(bearer(world.admin))
      .send({ routeId: world.routeId, busId: world.busId, departureTime: hoursFromNow(102).toISOString(), baseFare: 400 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('BUS_SCHEDULE_CONFLICT');
  });

  it('lets the owning operator schedule a daily series and edit the fare', async () => {
    const world = await makeWorld({ departInHours: 30 });
    const created = await api()
      .post('/api/v1/trips')
      .set(bearer(world.operatorUser))
      .send({ routeId: world.routeId, busId: world.busId, departureTime: hoursFromNow(200).toISOString(), baseFare: 750, repeatDays: 3 });
    expect(created.status).toBe(201);
    expect(created.body.data.created).toBe(3);

    const patched = await api().patch(`/api/v1/trips/${created.body.data.tripIds[0]}`).set(bearer(world.operatorUser)).send({ baseFare: 820 });
    expect(patched.status).toBe(200);
    expect(patched.body.data.baseFare).toBe(820);

    const list = await api().get('/api/v1/trips?limit=50').set(bearer(world.operatorUser));
    expect(list.body.meta.total).toBe(4);
  });

  it('rejects trips in the past and invalid status transitions', async () => {
    const world = await makeWorld();
    const past = await api().post('/api/v1/trips').set(bearer(world.admin)).send({ routeId: world.routeId, busId: world.busId, departureTime: hoursFromNow(-5).toISOString(), baseFare: 400 });
    expect(past.status).toBe(400);

    const { tripIds } = await createTrips(world.admin.actor, { routeId: world.routeId, busId: world.busId, departureTime: hoursFromNow(300).toISOString(), baseFare: 400, repeatDays: 1 });
    const bad = await api().patch(`/api/v1/trips/${tripIds[0]}`).set(bearer(world.admin)).send({ status: 'COMPLETED' });
    expect(bad.status).toBe(409);
    expect(bad.body.error.code).toBe('INVALID_TRIP_TRANSITION');
  });
});

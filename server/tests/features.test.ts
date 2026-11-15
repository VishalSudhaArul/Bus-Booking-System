import { describe, expect, it } from 'vitest';
import { Booking } from '../src/modules/bookings/booking.model';
import { Seat } from '../src/modules/seats/seat.model';
import { slotOf } from '../src/modules/trips/trip.service';
import { istDateString } from '../src/utils/time';
import { api, bearer, book, bookingBody, makeUser, makeWorld, newKey, type World } from './helpers/factory';

const femalePassengers = (world: World, seatIds: string[]) =>
  bookingBody(world, seatIds).passengers.map((p) => ({ ...p, gender: 'FEMALE' }));

describe('ladies-only seats', () => {
  it('appear in the live seat map', async () => {
    const world = await makeWorld();
    await Seat.updateOne({ _id: world.seats[0]._id }, { ladiesOnly: true });
    const map = await api().get(`/api/v1/trips/${world.tripId}/seats`);
    const seat = (id: string) => map.body.data.seats.find((s: { _id: string }) => s._id === id);
    expect(seat(world.seats[0]._id).ladiesOnly).toBe(true);
    expect(seat(world.seats[1]._id).ladiesOnly).toBe(false);
  });

  it('can only be booked for a female passenger', async () => {
    const world = await makeWorld();
    await Seat.updateOne({ _id: world.seats[0]._id }, { ladiesOnly: true });
    const passenger = await makeUser();

    // Default factory gender for the first passenger is MALE.
    const male = await book(passenger, world, [world.seats[0]._id]);
    expect(male.status).toBe(422);
    expect(male.body.error.code).toBe('LADIES_ONLY_SEAT');
    expect(male.body.error.details.seats[0].seatNumber).toBe('1A');
    expect(await Booking.countDocuments({ tripId: world.tripId })).toBe(0);

    const female = await book(passenger, world, [world.seats[0]._id], newKey(), { passengers: femalePassengers(world, [world.seats[0]._id]) });
    expect(female.status).toBe(201);
  });

  it('can be toggled by an admin on the bus layout', async () => {
    const world = await makeWorld();
    const res = await api().patch(`/api/v1/buses/${world.busId}/seats/${world.seats[3]._id}`).set(bearer(world.admin)).send({ ladiesOnly: true });
    expect(res.status).toBe(200);
    expect(res.body.data.ladiesOnly).toBe(true);
    expect((await api().patch(`/api/v1/buses/${world.busId}/seats/${world.seats[3]._id}`).set(bearer(world.operatorUser)).send({ ladiesOnly: false })).status).toBe(403);
  });
});

describe('promo codes', () => {
  it('lists the available offers publicly', async () => {
    const res = await api().get('/api/v1/promos');
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { code: string }) => p.code)).toEqual(expect.arrayContaining(['SAVE10', 'FLAT50']));
  });

  it('quotes the exact amount the booking then charges', async () => {
    const world = await makeWorld({ baseFare: 600 });
    const passenger = await makeUser();
    const seatIds = [world.seats[1]._id, world.seats[2]._id];

    const quote = await api().post('/api/v1/bookings/quote').set(bearer(passenger)).send({ tripId: world.tripId, seatIds, promoCode: 'save10' });
    expect(quote.status).toBe(200);
    // 1200 subtotal → 120 off → GST 5% on 1080 = 54 → 1134
    expect(quote.body.data.fare).toEqual({ baseFare: 1200, seatCharges: 0, discount: 120, promoCode: 'SAVE10', taxPercent: 5, taxes: 54, total: 1134 });
    expect(quote.body.data.seats.map((s: { seatNumber: string }) => s.seatNumber)).toEqual(['1B', '1C']);

    const booked = await book(passenger, world, seatIds, newKey(), { promoCode: 'SAVE10' });
    expect(booked.status).toBe(201);
    expect(booked.body.data.fare.total).toBe(quote.body.data.fare.total);
    expect(booked.body.data.fare.promoCode).toBe('SAVE10');
  });

  it('rejects unknown codes and codes below their minimum', async () => {
    const world = await makeWorld({ baseFare: 300 });
    const passenger = await makeUser();
    const bad = await api().post('/api/v1/bookings/quote').set(bearer(passenger)).send({ tripId: world.tripId, seatIds: [world.seats[0]._id], promoCode: 'FREEBUS' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('INVALID_PROMO');

    const tooSmall = await book(passenger, world, [world.seats[0]._id], newKey(), { promoCode: 'FLAT50' });
    expect(tooSmall.status).toBe(400);
    expect(tooSmall.body.error.code).toBe('PROMO_MIN_NOT_MET');
    expect(await Booking.countDocuments({ tripId: world.tripId })).toBe(0);
  });

  it('treats a different promo code as a different request for idempotency', async () => {
    const world = await makeWorld({ baseFare: 600 });
    const passenger = await makeUser();
    const key = newKey();
    expect((await book(passenger, world, [world.seats[0]._id], key)).status).toBe(201);
    const reused = await book(passenger, world, [world.seats[0]._id], key, { promoCode: 'SAVE10' });
    expect(reused.status).toBe(422);
    expect(reused.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('requires a signed-in passenger to quote', async () => {
    const world = await makeWorld();
    expect((await api().post('/api/v1/bookings/quote').send({ tripId: world.tripId, seatIds: [world.seats[0]._id] })).status).toBe(401);
  });
});

describe('search filters', () => {
  it('filters by time of day and minimum operator rating', async () => {
    const world = await makeWorld({ source: 'Slotpur', destination: 'Ratingnagar', departInHours: 80 });
    const search = await api().get('/api/v1/trips/search').query({ from: 'Slotpur', to: 'Ratingnagar', date: '2000-01-01' });
    expect(search.status).toBe(200); // past date simply yields nothing

    const details = await api().get(`/api/v1/trips/${world.tripId}`);
    const departure = new Date(details.body.data.departureTime);
    const date = istDateString(departure);
    const slot = slotOf(departure);
    const other = ['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT'].find((s) => s !== slot)!;
    const q = { from: 'Slotpur', to: 'Ratingnagar', date };

    expect((await api().get('/api/v1/trips/search').query({ ...q, departureSlot: slot })).body.data).toHaveLength(1);
    expect((await api().get('/api/v1/trips/search').query({ ...q, departureSlot: other })).body.data).toHaveLength(0);
    // Factory operators are rated 4.0.
    expect((await api().get('/api/v1/trips/search').query({ ...q, minRating: 4 })).body.data).toHaveLength(1);
    expect((await api().get('/api/v1/trips/search').query({ ...q, minRating: 4.5 })).body.data).toHaveLength(0);
    expect((await api().get('/api/v1/trips/search').query({ ...q, departureSlot: 'EARLY' })).status).toBe(400);
  });
});

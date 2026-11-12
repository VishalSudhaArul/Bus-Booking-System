import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { createApp } from '../../src/app';
import { signAccessToken } from '../../src/middleware/auth';
import { createBus } from '../../src/modules/buses/bus.service';
import { Operator } from '../../src/modules/operators/operator.model';
import { createRoute } from '../../src/modules/routes/route.service';
import { Seat } from '../../src/modules/seats/seat.model';
import { Stop } from '../../src/modules/stops/stop.model';
import { createTrips } from '../../src/modules/trips/trip.service';
import { User } from '../../src/modules/users/user.model';
import type { Actor, LayoutTemplate, Role } from '../../src/types/domain';

export const app = createApp();
export const api = () => request(app);

let counter = 0;
const next = () => {
  counter += 1;
  return counter;
};

export const PASSWORD = 'Travel@123';
const passwordHash = bcrypt.hashSync(PASSWORD, 4);

export interface TestUser {
  id: string;
  email: string;
  token: string;
  actor: Actor;
}

export async function makeUser(role: Role = 'PASSENGER', operatorId?: string): Promise<TestUser> {
  const n = next();
  const user = await User.create({ name: `Test User ${String.fromCharCode(65 + (n % 26))}`, email: `user${n}-${randomUUID().slice(0, 6)}@example.com`, phone: '9876543210', passwordHash, role, operatorId });
  const id = String(user._id);
  return { id, email: user.email, token: signAccessToken({ sub: id, role, operatorId }), actor: { id, role, operatorId } };
}

export const bearer = (user: TestUser) => ({ Authorization: `Bearer ${user.token}` });
export const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000);

export interface World {
  admin: TestUser;
  operatorId: string;
  operatorUser: TestUser;
  busId: string;
  routeId: string;
  tripId: string;
  boardingStopId: string;
  droppingStopId: string;
  seats: { _id: string; seatNumber: string; priceModifier: number }[];
  baseFare: number;
}

export interface WorldOptions {
  source?: string;
  destination?: string;
  template?: LayoutTemplate;
  rows?: number;
  baseFare?: number;
  departInHours?: number;
  isAC?: boolean;
  windowPremium?: number;
}

/** A complete, bookable setup: operator → bus + seats → stops → route → one trip. */
export async function makeWorld(options: WorldOptions = {}): Promise<World> {
  const n = next();
  const source = options.source ?? `Sourceville${n}`;
  const destination = options.destination ?? `Destinburg${n}`;
  const baseFare = options.baseFare ?? 500;

  const admin = await makeUser('ADMIN');
  const operator = await Operator.create({ name: `Operator ${n}`, code: `OP${n}`, contactEmail: `ops${n}@example.com`, contactPhone: '08012345678' });
  const operatorId = String(operator._id);
  const operatorUser = await makeUser('OPERATOR', operatorId);

  const bus = await createBus(admin.actor, {
    operatorId,
    name: `Coach ${n}`,
    registrationNumber: `KA01T${String(1000 + n)}`,
    isAC: options.isAC ?? true,
    amenities: ['WiFi'],
    layout: { template: options.template ?? 'SEATER_2X2', rows: options.rows ?? 3, windowPremium: options.windowPremium ?? 0, lowerDeckPremium: 0 },
  });
  const busId = String(bus._id);

  const [boarding, dropping] = await Stop.create([
    { name: `Central Stand ${n}`, city: source, cityKey: source.toLowerCase() },
    { name: `Main Terminal ${n}`, city: destination, cityKey: destination.toLowerCase() },
  ]);
  const route = await createRoute(admin.actor, {
    operatorId,
    code: `RT-${n}`,
    sourceCity: source,
    destinationCity: destination,
    distanceKm: 350,
    durationMinutes: 360,
    stops: [
      { stopId: String(boarding._id), type: 'BOARDING', offsetMinutes: 0 },
      { stopId: String(dropping._id), type: 'DROPPING', offsetMinutes: 360 },
    ],
  });
  const routeId = String(route._id);

  const { tripIds } = await createTrips(admin.actor, { routeId, busId, departureTime: hoursFromNow(options.departInHours ?? 72).toISOString(), baseFare, repeatDays: 1 });
  const seats = await Seat.find({ busId }).sort({ row: 1, column: 1 }).lean();

  return {
    admin,
    operatorId,
    operatorUser,
    busId,
    routeId,
    tripId: tripIds[0],
    boardingStopId: String(boarding._id),
    droppingStopId: String(dropping._id),
    seats: seats.map((s) => ({ _id: String(s._id), seatNumber: s.seatNumber, priceModifier: s.priceModifier })),
    baseFare,
  };
}

export function bookingBody(world: World, seatIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    tripId: world.tripId,
    boardingStopId: world.boardingStopId,
    droppingStopId: world.droppingStopId,
    contact: { email: 'traveller@example.com', phone: '9876543210' },
    passengers: seatIds.map((seatId, i) => ({ seatId, name: `Passenger ${String.fromCharCode(65 + i)}`, age: 25 + i, gender: i % 2 ? 'FEMALE' : 'MALE' })),
    ...overrides,
  };
}

export const newKey = () => `key-${randomUUID()}`;

export function book(user: TestUser, world: World, seatIds: string[], key: string = newKey(), overrides: Record<string, unknown> = {}) {
  return api().post('/api/v1/bookings').set(bearer(user)).set('Idempotency-Key', key).send(bookingBody(world, seatIds, overrides));
}

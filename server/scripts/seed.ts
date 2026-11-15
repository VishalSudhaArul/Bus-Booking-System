 
/**
 * Reproducible demo data. Safe to run repeatedly: every record is matched on a
 * natural key (email, operator code, registration number, route code,
 * bus + departure time, idempotency key), so re-running adds nothing twice.
 *
 *   npm run seed            → upsert demo data
 *   npm run seed -- --reset → wipe the application collections first
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../src/config/db';
import { allModels, ensureIndexes } from '../src/config/models';
import { hashPassword } from '../src/modules/auth/auth.service';
import { Booking } from '../src/modules/bookings/booking.model';
import { createBooking } from '../src/modules/bookings/booking.service';
import { Bus } from '../src/modules/buses/bus.model';
import { createBus } from '../src/modules/buses/bus.service';
import { cancelBooking } from '../src/modules/cancellations/cancellation.service';
import { Operator } from '../src/modules/operators/operator.model';
import { Route } from '../src/modules/routes/route.model';
import { createRoute } from '../src/modules/routes/route.service';
import { Seat } from '../src/modules/seats/seat.model';
import { Stop } from '../src/modules/stops/stop.model';
import { Trip, TripStop } from '../src/modules/trips/trip.model';
import { createTrips } from '../src/modules/trips/trip.service';
import { User } from '../src/modules/users/user.model';
import type { Actor, LayoutTemplate, Role } from '../src/types/domain';
import { AppError } from '../src/utils/errors';
import { istDateString } from '../src/utils/time';

// Documented in README. Demo-only accounts with fictional identities.
export const DEMO = {
  admin: { email: 'admin@busnest.example.com', password: 'Admin@12345' },
  operator: { email: 'operator@busnest.example.com', password: 'Operator@12345' },
  operator2: { email: 'operator2@busnest.example.com', password: 'Operator@12345' },
  passenger: { email: 'passenger@busnest.example.com', password: 'Passenger@12345' },
};

const OPERATORS = [
  { code: 'DSL', name: 'Deccan Starline', rating: 4.6, description: 'Premium overnight sleepers across the Deccan plateau.', contactEmail: 'care@deccanstarline.example.com', contactPhone: '080-4000-1101' },
  { code: 'NEL', name: 'Nilgiri Express Lines', rating: 4.3, description: 'Reliable day and night services through the Nilgiris.', contactEmail: 'help@nilgiriexpress.example.com', contactPhone: '0422-400-2202' },
  { code: 'CCC', name: 'Coastal Comfort Coaches', rating: 4.4, description: 'Comfortable coaches along the western coast.', contactEmail: 'support@coastalcomfort.example.com', contactPhone: '0484-400-3303' },
  { code: 'WGT', name: 'Western Ghats Transit', rating: 4.1, description: 'Value-for-money seaters connecting the Sahyadri cities.', contactEmail: 'desk@wgtransit.example.com', contactPhone: '020-4000-4404' },
];

const STOPS: [city: string, name: string, landmark: string][] = [
  ['Bengaluru', 'Majestic Bus Stand', 'Kempegowda Bus Station, Platform 12'],
  ['Bengaluru', 'Silk Board Junction', 'Opposite the flyover service road'],
  ['Bengaluru', 'Electronic City', 'Near toll plaza, Phase 1'],
  ['Chennai', 'Koyambedu CMBT', 'Omni bus terminus, Bay 4'],
  ['Chennai', 'Guindy', 'Near Kathipara flyover'],
  ['Hyderabad', 'Ameerpet', 'Metro station pillar 1445'],
  ['Hyderabad', 'LB Nagar', 'Ring road bus bay'],
  ['Mysuru', 'Sub-Urban Bus Stand', 'Near the clock tower'],
  ['Coimbatore', 'Gandhipuram', 'Omni bus stand'],
  ['Kochi', 'Vyttila Mobility Hub', 'Bay 7'],
  ['Kochi', 'Edappally', 'Opposite the mall junction'],
  ['Pune', 'Swargate', 'Near the depot gate'],
  ['Pune', 'Wakad', 'Highway bridge pick-up'],
  ['Mumbai', 'Dadar East', 'Near the flyover'],
  ['Mumbai', 'Borivali', 'National Park gate'],
  ['Goa', 'Panaji KTC', 'Kadamba bus stand'],
  ['Goa', 'Mapusa', 'Municipal market stop'],
];

const BUSES: { reg: string; name: string; op: string; template: LayoutTemplate; rows: number; isAC: boolean; amenities: string[]; windowPremium?: number; lowerDeckPremium?: number }[] = [
  { reg: 'KA01DS1001', name: 'Starline Signature Sleeper', op: 'DSL', template: 'SLEEPER_2X1', rows: 6, isAC: true, amenities: ['Charging point', 'Blanket', 'Reading light', 'Water bottle', 'Live tracking'], lowerDeckPremium: 150 },
  { reg: 'KA01DS1002', name: 'Starline Signature Sleeper II', op: 'DSL', template: 'SLEEPER_2X1', rows: 6, isAC: true, amenities: ['Charging point', 'Blanket', 'Reading light', 'Water bottle', 'Live tracking'], lowerDeckPremium: 150 },
  { reg: 'KA01DS2001', name: 'Starline Recliner', op: 'DSL', template: 'SEMI_SLEEPER_2X2', rows: 10, isAC: true, amenities: ['Charging point', 'Water bottle', 'Live tracking'], windowPremium: 40 },
  { reg: 'TN38NE3001', name: 'Nilgiri Day Rider', op: 'NEL', template: 'SEATER_2X2', rows: 11, isAC: false, amenities: ['Live tracking'] },
  { reg: 'TN38NE3002', name: 'Nilgiri Night Owl', op: 'NEL', template: 'SLEEPER_1X1', rows: 7, isAC: true, amenities: ['Charging point', 'Blanket', 'Personal TV'], lowerDeckPremium: 200 },
  { reg: 'KL07CC4001', name: 'Coastal Cruiser', op: 'CCC', template: 'SEATER_2X1', rows: 9, isAC: true, amenities: ['Charging point', 'WiFi', 'Snacks'], windowPremium: 60 },
  { reg: 'KL07CC4002', name: 'Coastal Dreamliner', op: 'CCC', template: 'SLEEPER_2X1', rows: 5, isAC: true, amenities: ['Charging point', 'Blanket', 'WiFi'], lowerDeckPremium: 120 },
  { reg: 'MH12WG5001', name: 'Ghats Shuttle', op: 'WGT', template: 'SEATER_2X2', rows: 10, isAC: true, amenities: ['Charging point'] },
  { reg: 'MH12WG5002', name: 'Ghats Overnighter', op: 'WGT', template: 'SEMI_SLEEPER_2X2', rows: 9, isAC: true, amenities: ['Charging point', 'Blanket'], windowPremium: 30 },
];

// stops: [city, stop name, BOARDING|DROPPING, minutes after departure]
const ROUTES: { code: string; op: string; from: string; to: string; km: number; minutes: number; bus: string; time: string; fare: number; stops: [string, string, 'BOARDING' | 'DROPPING', number][] }[] = [
  { code: 'DSL-BLR-HYD', op: 'DSL', from: 'Bengaluru', to: 'Hyderabad', km: 570, minutes: 540, bus: 'KA01DS1001', time: '21:30', fare: 1250, stops: [['Bengaluru', 'Majestic Bus Stand', 'BOARDING', 0], ['Bengaluru', 'Electronic City', 'BOARDING', 45], ['Hyderabad', 'LB Nagar', 'DROPPING', 500], ['Hyderabad', 'Ameerpet', 'DROPPING', 540]] },
  { code: 'DSL-HYD-BLR', op: 'DSL', from: 'Hyderabad', to: 'Bengaluru', km: 570, minutes: 540, bus: 'KA01DS1002', time: '22:00', fare: 1250, stops: [['Hyderabad', 'Ameerpet', 'BOARDING', 0], ['Hyderabad', 'LB Nagar', 'BOARDING', 40], ['Bengaluru', 'Electronic City', 'DROPPING', 495], ['Bengaluru', 'Majestic Bus Stand', 'DROPPING', 540]] },
  { code: 'DSL-BLR-MAA', op: 'DSL', from: 'Bengaluru', to: 'Chennai', km: 350, minutes: 390, bus: 'KA01DS2001', time: '07:15', fare: 780, stops: [['Bengaluru', 'Majestic Bus Stand', 'BOARDING', 0], ['Bengaluru', 'Silk Board Junction', 'BOARDING', 35], ['Chennai', 'Guindy', 'DROPPING', 360], ['Chennai', 'Koyambedu CMBT', 'DROPPING', 390]] },
  { code: 'NEL-BLR-MAA', op: 'NEL', from: 'Bengaluru', to: 'Chennai', km: 350, minutes: 420, bus: 'TN38NE3001', time: '13:00', fare: 520, stops: [['Bengaluru', 'Silk Board Junction', 'BOARDING', 0], ['Bengaluru', 'Electronic City', 'BOARDING', 25], ['Chennai', 'Koyambedu CMBT', 'DROPPING', 420]] },
  { code: 'NEL-CBE-BLR', op: 'NEL', from: 'Coimbatore', to: 'Bengaluru', km: 365, minutes: 450, bus: 'TN38NE3002', time: '22:45', fare: 990, stops: [['Coimbatore', 'Gandhipuram', 'BOARDING', 0], ['Bengaluru', 'Electronic City', 'DROPPING', 410], ['Bengaluru', 'Majestic Bus Stand', 'DROPPING', 450]] },
  { code: 'CCC-COK-BLR', op: 'CCC', from: 'Kochi', to: 'Bengaluru', km: 550, minutes: 600, bus: 'KL07CC4002', time: '20:00', fare: 1400, stops: [['Kochi', 'Vyttila Mobility Hub', 'BOARDING', 0], ['Kochi', 'Edappally', 'BOARDING', 30], ['Bengaluru', 'Silk Board Junction', 'DROPPING', 570], ['Bengaluru', 'Majestic Bus Stand', 'DROPPING', 600]] },
  { code: 'CCC-BLR-MYS', op: 'CCC', from: 'Bengaluru', to: 'Mysuru', km: 145, minutes: 180, bus: 'KL07CC4001', time: '09:00', fare: 380, stops: [['Bengaluru', 'Majestic Bus Stand', 'BOARDING', 0], ['Mysuru', 'Sub-Urban Bus Stand', 'DROPPING', 180]] },
  { code: 'WGT-PNQ-BOM', op: 'WGT', from: 'Pune', to: 'Mumbai', km: 150, minutes: 210, bus: 'MH12WG5001', time: '06:30', fare: 450, stops: [['Pune', 'Swargate', 'BOARDING', 0], ['Pune', 'Wakad', 'BOARDING', 40], ['Mumbai', 'Dadar East', 'DROPPING', 180], ['Mumbai', 'Borivali', 'DROPPING', 210]] },
  { code: 'WGT-BOM-GOI', op: 'WGT', from: 'Mumbai', to: 'Goa', km: 590, minutes: 690, bus: 'MH12WG5002', time: '19:30', fare: 1150, stops: [['Mumbai', 'Borivali', 'BOARDING', 0], ['Mumbai', 'Dadar East', 'BOARDING', 50], ['Goa', 'Mapusa', 'DROPPING', 660], ['Goa', 'Panaji KTC', 'DROPPING', 690]] },
];

const FIRST_NAMES = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Ananya', 'Vikram', 'Sana', 'Arjun', 'Nisha', 'Dev', 'Tara', 'Imran', 'Leela', 'Farhan', 'Pooja'];
const LAST_NAMES = ['Menon', 'Kulkarni', 'Fernandes', 'Reddy', 'Bose', 'Chowdhury', 'Pillai', 'Saxena'];

const DAYS_BACK = 3;
const DAYS_AHEAD = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// Small deterministic PRNG so every run picks the same seats and names.
function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function upsertUser(name: string, email: string, password: string, role: Role, phone: string, operatorId?: unknown) {
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { name, role, phone, operatorId, isActive: true, passwordHash: await hashPassword(password) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return user!;
}

/** Upserts the demo data into the already-connected database. */
export async function seedDatabase(reset = false) {
  console.info(`Seeding database "${mongoose.connection.name}"${reset ? ' (reset requested)' : ''}…`);

  if (reset) {
    for (const model of allModels) await model.deleteMany({});
    console.info('  cleared application collections');
  }
  await ensureIndexes();

  // ── Operators ────────────────────────────────────────────────────────────
  const operatorIds = new Map<string, string>();
  for (const o of OPERATORS) {
    const doc = await Operator.findOneAndUpdate({ code: o.code }, { $set: { ...o, isActive: true } }, { upsert: true, new: true });
    operatorIds.set(o.code, String(doc!._id));
  }

  // ── Users ────────────────────────────────────────────────────────────────
  const adminUser = await upsertUser('Priya Nair', DEMO.admin.email, DEMO.admin.password, 'ADMIN', '9000000001');
  await upsertUser('Rahul Deshmukh', DEMO.operator.email, DEMO.operator.password, 'OPERATOR', '9000000002', operatorIds.get('DSL'));
  await upsertUser('Kavya Iyer', DEMO.operator2.email, DEMO.operator2.password, 'OPERATOR', '9000000003', operatorIds.get('NEL'));
  const passengers = [
    await upsertUser('Arjun Mehta', DEMO.passenger.email, DEMO.passenger.password, 'PASSENGER', '9000000004'),
    await upsertUser('Sneha Kapoor', 'sneha@busnest.example.com', DEMO.passenger.password, 'PASSENGER', '9000000005'),
    await upsertUser('Farhan Qureshi', 'farhan@busnest.example.com', DEMO.passenger.password, 'PASSENGER', '9000000006'),
  ];
  const admin: Actor = { id: String(adminUser._id), role: 'ADMIN' };

  // ── Stops ────────────────────────────────────────────────────────────────
  const stopIds = new Map<string, string>();
  for (const [city, name, landmark] of STOPS) {
    const doc = await Stop.findOneAndUpdate(
      { cityKey: city.toLowerCase(), name },
      { $set: { city, landmark, isActive: true } },
      { upsert: true, new: true },
    );
    stopIds.set(`${city}|${name}`, String(doc!._id));
  }

  // ── Buses (with generated seat layouts) ──────────────────────────────────
  const busIds = new Map<string, string>();
  for (const b of BUSES) {
    const existing = await Bus.findOne({ registrationNumber: b.reg }).select('_id').lean();
    const id = existing
      ? String(existing._id)
      : String(
          (
            await createBus(admin, {
              operatorId: operatorIds.get(b.op)!,
              name: b.name,
              registrationNumber: b.reg,
              isAC: b.isAC,
              amenities: b.amenities,
              layout: { template: b.template, rows: b.rows, windowPremium: b.windowPremium ?? 0, lowerDeckPremium: b.lowerDeckPremium ?? 0 },
            })
          )._id,
        );
    busIds.set(b.reg, id);
  }
  // One seat is out of service on the day rider, to demonstrate "unavailable" seats.
  await Seat.updateOne({ busId: busIds.get('TN38NE3001'), seatNumber: '11D' }, { $set: { isActive: false } });
  // A few seats near the front of every bus are reserved for women (idempotent).
  for (const b of BUSES) {
    const ladies = b.template.startsWith('SLEEPER') ? ['L1', 'L2'] : ['2A', '2B'];
    await Seat.updateMany({ busId: busIds.get(b.reg), seatNumber: { $in: ladies } }, { $set: { ladiesOnly: true } });
  }

  // ── Routes ───────────────────────────────────────────────────────────────
  const routeIds = new Map<string, string>();
  for (const r of ROUTES) {
    const existing = await Route.findOne({ code: r.code }).select('_id').lean();
    const id = existing
      ? String(existing._id)
      : String(
          (
            await createRoute(admin, {
              operatorId: operatorIds.get(r.op)!,
              code: r.code,
              sourceCity: r.from,
              destinationCity: r.to,
              distanceKm: r.km,
              durationMinutes: r.minutes,
              stops: r.stops.map(([city, name, type, offsetMinutes]) => ({ stopId: stopIds.get(`${city}|${name}`)!, type, offsetMinutes })),
            })
          )._id,
        );
    routeIds.set(r.code, id);
  }

  // ── Trips: every route runs daily from 3 days ago to 14 days ahead ───────
  const today = istDateString(new Date());
  const todayStart = new Date(`${today}T00:00:00+05:30`).getTime();
  let tripsCreated = 0;
  const seededTrips: { tripId: string; past: boolean; route: (typeof ROUTES)[number]; dayOffset: number }[] = [];
  for (const r of ROUTES) {
    for (let d = -DAYS_BACK; d <= DAYS_AHEAD; d += 1) {
      const date = istDateString(new Date(todayStart + d * DAY_MS + 12 * 3_600_000));
      const departure = new Date(`${date}T${r.time}:00+05:30`);
      const busId = busIds.get(r.bus)!;
      const found = await Trip.findOne({ busId, departureTime: departure }).select('_id').lean();
      let tripId = found ? String(found._id) : '';
      if (!found) {
        const { tripIds } = await createTrips(admin, { routeId: routeIds.get(r.code)!, busId, departureTime: departure.toISOString(), baseFare: r.fare, repeatDays: 1 }, { allowPast: true });
        tripId = tripIds[0];
        tripsCreated += 1;
      }
      seededTrips.push({ tripId, past: departure.getTime() <= Date.now(), route: r, dayOffset: d });
    }
  }

  // ── Sample bookings (through the real booking service) ───────────────────
  let bookings = 0;
  let cancellations = 0;
  for (const t of seededTrips) {
    // Past trips and the next week get bookings; later trips stay mostly empty.
    if (t.dayOffset > 7) continue;
    // A trip is seeded once. Its plan depends on the run date (dayOffset), so
    // re-seeding a trip on a later day would add a second, different set.
    if (await Booking.exists({ tripId: t.tripId, idempotencyKey: { $regex: '^seed-' } })) continue;
    const rand = mulberry(t.route.code.length * 1000 + (t.dayOffset + 10) * 37 + t.route.fare);
    const trip = await Trip.findById(t.tripId).lean();
    if (!trip || trip.status === 'CANCELLED') continue;
    const [seats, stops] = await Promise.all([
      Seat.find({ busId: trip.busId, isActive: true }).sort({ deck: 1, row: 1, column: 1 }).lean(),
      TripStop.find({ tripId: trip._id }).sort({ sequence: 1 }).lean(),
    ]);
    const boarding = stops.find((s) => s.type === 'BOARDING')!;
    const dropping = [...stops].reverse().find((s) => s.type === 'DROPPING')!;
    const wanted = t.past ? 4 + Math.floor(rand() * 4) : 1 + Math.floor(rand() * 4);
    let cursor = Math.floor(rand() * 4);

    for (let n = 0; n < wanted; n += 1) {
      const size = 1 + Math.floor(rand() * 3);
      const chosen = seats.slice(cursor, cursor + size);
      cursor += size + Math.floor(rand() * 3);
      if (chosen.length === 0) break;
      const user = passengers[(n + t.dayOffset + DAYS_BACK) % passengers.length];
      const actor: Actor = { id: String(user._id), role: 'PASSENGER' };
      try {
        const { booking, replayed } = await createBooking(
          actor,
          {
            tripId: t.tripId,
            boardingStopId: String(boarding.stopId),
            droppingStopId: String(dropping.stopId),
            contact: { email: user.email, phone: user.phone ?? '9000000004' },
            passengers: chosen.map((s, i) => ({
              seatId: String(s._id),
              name: i === 0 ? user.name : `${FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)]}`,
              age: 19 + Math.floor(rand() * 45),
              gender: rand() > 0.5 ? 'FEMALE' : 'MALE',
            })),
          },
          `seed-${t.tripId}-${n}`,
          { allowPast: true },
        );
        if (!replayed) bookings += 1;
        // Cancel a few upcoming bookings so refunds and cancellation history have data.
        if (!t.past && n === 0 && t.dayOffset % 3 === 2 && booking.status === 'CONFIRMED') {
          await cancelBooking(actor, booking._id, 'Change of travel plans');
          cancellations += 1;
        }
      } catch (err) {
        // A seat taken by a real user, or a booking already cancelled on an earlier run: skip it.
        if (!(err instanceof AppError && [409, 422].includes(err.status))) throw err;
      }
    }
  }

  // Trips whose departure has passed are marked completed (after their bookings exist).
  const completed = await Trip.updateMany({ status: 'SCHEDULED', arrivalTime: { $lt: new Date() } }, { $set: { status: 'COMPLETED' } });
  await Trip.updateMany({ status: 'SCHEDULED', departureTime: { $lt: new Date() }, arrivalTime: { $gte: new Date() } }, { $set: { status: 'DEPARTED' } });

  console.info(`  operators: ${OPERATORS.length}, stops: ${STOPS.length}, buses: ${BUSES.length}, routes: ${ROUTES.length}`);
  console.info(`  trips created: ${tripsCreated} (of ${seededTrips.length}), marked completed: ${completed.modifiedCount}`);
  console.info(`  bookings created: ${bookings}, cancellations created: ${cancellations}`);
  console.info('Seed complete. Demo accounts are listed in README.md.');
  return { tripsCreated, totalTrips: seededTrips.length, bookings, cancellations };
}

if (require.main === module) {
  connectDatabase()
    .then(() => seedDatabase(process.argv.includes('--reset')))
  .catch((err) => {
    console.error('Seed failed:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
}

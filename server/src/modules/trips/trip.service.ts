import { Types } from 'mongoose';
import { assertOperatorAccess, operatorScope } from '../../middleware/auth';
import type { Actor, TripStatus } from '../../types/domain';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { pageMeta } from '../../utils/http';
import { addMinutes, istDayRange, istHour } from '../../utils/time';
import { recordAudit } from '../audit/audit.service';
import { Booking, BookingPassenger, SeatAllocation } from '../bookings/booking.model';
import { Bus } from '../buses/bus.model';
import { cancelBookingsForTrip } from '../cancellations/cancellation.service';
import { Route } from '../routes/route.model';
import { Seat } from '../seats/seat.model';
import { Trip, TripStop } from './trip.model';
import type { CreateTripInput, ListTripsQuery, SearchTripsQuery, UpdateTripInput } from './trip.validation';

const DAY_MIN = 24 * 60;

interface Named {
  _id: Types.ObjectId;
  name: string;
}

/** Active (bookable) seat count per bus. */
async function capacityByBus(busIds: unknown[]) {
  const rows = await Seat.aggregate<{ _id: Types.ObjectId; seats: number; minModifier: number; maxModifier: number }>([
    { $match: { busId: { $in: busIds }, isActive: true } },
    { $group: { _id: '$busId', seats: { $sum: 1 }, minModifier: { $min: '$priceModifier' }, maxModifier: { $max: '$priceModifier' } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

/** Seats currently held (ACTIVE allocations) per trip. */
export async function bookedByTrip(tripIds: unknown[]) {
  const rows = await SeatAllocation.aggregate<{ _id: Types.ObjectId; booked: number }>([
    { $match: { tripId: { $in: tripIds }, status: 'ACTIVE' } },
    { $group: { _id: '$tripId', booked: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.booked]));
}

async function stopsByTrip(tripIds: unknown[]) {
  const stops = await TripStop.find({ tripId: { $in: tripIds } })
    .sort({ sequence: 1 })
    .populate<{ stopId: Named & { city: string; address?: string; landmark?: string } }>('stopId', 'name city address landmark')
    .lean();
  const map = new Map<string, { stopId: string; name: string; city: string; landmark?: string; type: string; time: Date }[]>();
  for (const s of stops) {
    const key = String(s.tripId);
    const list = map.get(key) ?? [];
    list.push({ stopId: String(s.stopId._id), name: s.stopId.name, city: s.stopId.city, landmark: s.stopId.landmark ?? undefined, type: s.type, time: s.scheduledTime });
    map.set(key, list);
  }
  return map;
}

/** Morning 05–12, Afternoon 12–17, Evening 17–21, Night 21–05 (IST). */
export const slotOf = (d: Date) => {
  const h = istHour(d);
  if (h >= 5 && h < 12) return 'MORNING';
  if (h >= 12 && h < 17) return 'AFTERNOON';
  if (h >= 17 && h < 21) return 'EVENING';
  return 'NIGHT';
};

// ── Passenger search ───────────────────────────────────────────────────────

export async function searchTrips(q: SearchTripsQuery) {
  const routes = await Route.find({
    sourceCityKey: q.from.toLowerCase(),
    destinationCityKey: q.to.toLowerCase(),
    isActive: true,
  })
    .select('sourceCity destinationCity distanceKm durationMinutes')
    .lean();

  const empty = { items: [], meta: pageMeta(q.page, q.limit, 0), facets: { busTypes: [] as string[], minPrice: 0, maxPrice: 0 } };
  if (routes.length === 0) return empty;

  const { start, end } = istDayRange(q.date);
  const now = new Date();
  const trips = await Trip.find({
    routeId: { $in: routes.map((r) => r._id) },
    status: 'SCHEDULED',
    departureTime: { $gte: start > now ? start : now, $lt: end },
  })
    .populate<{ busId: { _id: Types.ObjectId; name: string; busType: string; isAC: boolean; amenities: string[]; isActive: boolean } }>(
      'busId',
      'name busType isAC amenities isActive',
    )
    .populate<{ operatorId: Named & { rating: number; isActive: boolean } }>('operatorId', 'name rating isActive')
    .lean();

  const live = trips.filter((t) => t.busId?.isActive && t.operatorId?.isActive);
  if (live.length === 0) return empty;

  const ids = live.map((t) => t._id);
  const [capacity, booked, stops] = await Promise.all([
    capacityByBus(live.map((t) => t.busId._id)),
    bookedByTrip(ids),
    stopsByTrip(ids),
  ]);
  const routeById = new Map(routes.map((r) => [String(r._id), r]));

  const all = live.map((t) => {
    const cap = capacity.get(String(t.busId._id));
    const totalSeats = cap?.seats ?? 0;
    const tripStops = stops.get(String(t._id)) ?? [];
    const route = routeById.get(String(t.routeId))!;
    return {
      _id: String(t._id),
      departureTime: t.departureTime,
      arrivalTime: t.arrivalTime,
      durationMinutes: Math.round((t.arrivalTime.getTime() - t.departureTime.getTime()) / 60_000),
      baseFare: t.baseFare,
      minFare: t.baseFare + (cap?.minModifier ?? 0),
      maxFare: t.baseFare + (cap?.maxModifier ?? 0),
      totalSeats,
      availableSeats: Math.max(0, totalSeats - (booked.get(String(t._id)) ?? 0)),
      operator: { _id: String(t.operatorId._id), name: t.operatorId.name, rating: t.operatorId.rating },
      bus: { _id: String(t.busId._id), name: t.busId.name, busType: t.busId.busType, isAC: t.busId.isAC, amenities: t.busId.amenities },
      route: { sourceCity: route.sourceCity, destinationCity: route.destinationCity, distanceKm: route.distanceKm },
      boardingPoints: tripStops.filter((s) => s.type === 'BOARDING'),
      droppingPoints: tripStops.filter((s) => s.type === 'DROPPING'),
    };
  });

  // Facets describe the whole day's result set, before the user's filters.
  const facets = {
    busTypes: [...new Set(all.map((t) => t.bus.busType))],
    minPrice: Math.min(...all.map((t) => t.minFare)),
    maxPrice: Math.max(...all.map((t) => t.minFare)),
  };

  const filtered = all.filter(
    (t) =>
      t.availableSeats >= q.passengers &&
      (q.busType.length === 0 || q.busType.includes(t.bus.busType as (typeof q.busType)[number])) &&
      (q.ac === undefined || t.bus.isAC === (q.ac === 'true')) &&
      (q.departureSlot.length === 0 || q.departureSlot.includes(slotOf(t.departureTime))) &&
      (q.maxPrice === undefined || t.minFare <= q.maxPrice) &&
      (q.minRating === undefined || t.operator.rating >= q.minRating),
  );

  const keyOf: Record<SearchTripsQuery['sort'], (t: (typeof all)[number]) => number> = {
    departure: (t) => t.departureTime.getTime(),
    arrival: (t) => t.arrivalTime.getTime(),
    price: (t) => t.minFare,
    seats: (t) => t.availableSeats,
    duration: (t) => t.durationMinutes,
    rating: (t) => t.operator.rating,
  };
  const dir = q.order === 'desc' ? -1 : 1;
  filtered.sort((a, b) => (keyOf[q.sort](a) - keyOf[q.sort](b)) * dir || a.departureTime.getTime() - b.departureTime.getTime());

  const startIdx = (q.page - 1) * q.limit;
  return { items: filtered.slice(startIdx, startIdx + q.limit), meta: pageMeta(q.page, q.limit, filtered.length), facets };
}

// ── Trip details and live seat map ─────────────────────────────────────────

export async function getTripDetails(id: string) {
  const trip = await Trip.findById(id)
    .populate('busId', 'name busType isAC amenities layout registrationNumber')
    .populate('operatorId', 'name code rating contactPhone')
    .populate('routeId', 'code sourceCity destinationCity distanceKm durationMinutes')
    .lean();
  if (!trip) throw notFound('Trip');
  const busId = (trip.busId as unknown as { _id: Types.ObjectId })._id;
  const [capacity, booked, stops] = await Promise.all([capacityByBus([busId]), bookedByTrip([trip._id]), stopsByTrip([trip._id])]);
  const totalSeats = capacity.get(String(busId))?.seats ?? 0;
  const tripStops = stops.get(String(trip._id)) ?? [];
  return {
    _id: String(trip._id),
    status: trip.status,
    departureTime: trip.departureTime,
    arrivalTime: trip.arrivalTime,
    durationMinutes: Math.round((trip.arrivalTime.getTime() - trip.departureTime.getTime()) / 60_000),
    baseFare: trip.baseFare,
    totalSeats,
    availableSeats: Math.max(0, totalSeats - (booked.get(String(trip._id)) ?? 0)),
    bus: trip.busId,
    operator: trip.operatorId,
    route: trip.routeId,
    boardingPoints: tripStops.filter((s) => s.type === 'BOARDING'),
    droppingPoints: tripStops.filter((s) => s.type === 'DROPPING'),
  };
}

/** Seat map for a trip. Status always reflects the allocation collection, never cached data. */
export async function getTripSeats(id: string) {
  const trip = await Trip.findById(id).select('busId baseFare status departureTime').lean();
  if (!trip) throw notFound('Trip');
  const [bus, seats, allocations] = await Promise.all([
    Bus.findById(trip.busId).select('layout busType').lean(),
    Seat.find({ busId: trip.busId }).sort({ deck: 1, row: 1, column: 1 }).lean(),
    SeatAllocation.find({ tripId: trip._id, status: 'ACTIVE' }).select('seatId').lean(),
  ]);
  if (!bus) throw notFound('Bus');
  const taken = new Set(allocations.map((a) => String(a.seatId)));
  return {
    tripId: String(trip._id),
    bookable: trip.status === 'SCHEDULED' && trip.departureTime > new Date(),
    baseFare: trip.baseFare,
    layout: bus.layout,
    seats: seats.map((s) => ({
      _id: String(s._id),
      seatNumber: s.seatNumber,
      deck: s.deck,
      row: s.row,
      column: s.column,
      seatType: s.seatType,
      position: s.position,
      ladiesOnly: !!s.ladiesOnly,
      fare: trip.baseFare + s.priceModifier,
      status: !s.isActive ? 'UNAVAILABLE' : taken.has(String(s._id)) ? 'BOOKED' : 'AVAILABLE',
    })),
  };
}

// ── Management ─────────────────────────────────────────────────────────────

export async function listTrips(actor: Actor, q: ListTripsQuery) {
  const filter: Record<string, unknown> = { ...operatorScope(actor) };
  if (actor.role === 'ADMIN' && q.operatorId) filter.operatorId = q.operatorId;
  if (q.status) filter.status = q.status;
  if (q.routeId) filter.routeId = q.routeId;
  if (q.busId) filter.busId = q.busId;
  if (q.from || q.to) {
    filter.departureTime = {
      ...(q.from ? { $gte: istDayRange(q.from).start } : {}),
      ...(q.to ? { $lt: istDayRange(q.to).end } : {}),
    };
  }
  const [trips, total] = await Promise.all([
    Trip.find(filter)
      .sort({ departureTime: q.order === 'desc' ? -1 : 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('busId', 'name registrationNumber busType isAC')
      .populate('operatorId', 'name code')
      .populate('routeId', 'code sourceCity destinationCity durationMinutes')
      .lean(),
    Trip.countDocuments(filter),
  ]);
  const [capacity, booked] = await Promise.all([
    capacityByBus(trips.map((t) => (t.busId as unknown as { _id: unknown })._id)),
    bookedByTrip(trips.map((t) => t._id)),
  ]);
  const items = trips.map((t) => {
    const totalSeats = capacity.get(String((t.busId as unknown as { _id: unknown })._id))?.seats ?? 0;
    const bookedSeats = booked.get(String(t._id)) ?? 0;
    return {
      ...t,
      bus: t.busId,
      operator: t.operatorId,
      route: t.routeId,
      busId: undefined,
      operatorId: undefined,
      routeId: undefined,
      totalSeats,
      bookedSeats,
      occupancyPercent: totalSeats ? Math.round((bookedSeats / totalSeats) * 1000) / 10 : 0,
    };
  });
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

async function assertBusFree(busId: unknown, departure: Date, arrival: Date, ignoreTripId?: unknown) {
  const clash = await Trip.findOne({
    busId,
    status: { $ne: 'CANCELLED' },
    departureTime: { $lt: arrival },
    arrivalTime: { $gt: departure },
    ...(ignoreTripId ? { _id: { $ne: ignoreTripId } } : {}),
  })
    .select('departureTime')
    .lean();
  if (clash) {
    throw conflict('This bus is already scheduled on an overlapping trip', 'BUS_SCHEDULE_CONFLICT', {
      conflictingTripId: String(clash._id),
      departureTime: clash.departureTime,
    });
  }
}

async function writeTripStops(tripId: unknown, routeStops: { stopId: unknown; type: string; sequence: number; offsetMinutes: number }[], departure: Date) {
  await TripStop.deleteMany({ tripId });
  await TripStop.insertMany(
    routeStops.map((s) => ({ tripId, stopId: s.stopId, type: s.type, sequence: s.sequence, scheduledTime: addMinutes(departure, s.offsetMinutes) })),
  );
}

export async function createTrips(actor: Actor, input: CreateTripInput, options: { allowPast?: boolean } = {}) {
  const [route, bus] = await Promise.all([Route.findById(input.routeId).lean(), Bus.findById(input.busId).lean()]);
  if (!route || !route.isActive) throw badRequest('Route does not exist or is inactive', 'ROUTE_NOT_FOUND');
  if (!bus || !bus.isActive) throw badRequest('Bus does not exist or is inactive', 'BUS_NOT_FOUND');
  assertOperatorAccess(actor, route.operatorId);
  if (String(route.operatorId) !== String(bus.operatorId)) {
    throw badRequest('The bus and the route belong to different operators', 'OPERATOR_MISMATCH');
  }
  const first = new Date(input.departureTime);
  if (!options.allowPast && first <= new Date()) throw badRequest('Departure time must be in the future', 'DEPARTURE_IN_PAST');

  const schedule = Array.from({ length: input.repeatDays }, (_, i) => {
    const departure = addMinutes(first, i * DAY_MIN);
    return { departure, arrival: addMinutes(departure, route.durationMinutes) };
  });
  // Validate the whole schedule first so a clash on day 5 does not leave days 1-4 behind.
  for (const s of schedule) await assertBusFree(bus._id, s.departure, s.arrival);

  const created: string[] = [];
  for (const s of schedule) {
    const trip = await Trip.create({
      routeId: route._id,
      busId: bus._id,
      operatorId: route.operatorId,
      departureTime: s.departure,
      arrivalTime: s.arrival,
      baseFare: input.baseFare,
    });
    try {
      await writeTripStops(trip._id, route.stops, s.departure);
    } catch (err) {
      await TripStop.deleteMany({ tripId: trip._id });
      await Trip.deleteOne({ _id: trip._id });
      throw err;
    }
    created.push(String(trip._id));
  }
  await recordAudit(actor, {
    action: 'TRIP_CREATED',
    entityType: 'Trip',
    entityId: created[0],
    metadata: { count: created.length, routeCode: route.code, baseFare: input.baseFare },
  });
  return { created: created.length, tripIds: created };
}

const TRANSITIONS: Record<TripStatus, TripStatus[]> = {
  SCHEDULED: ['DEPARTED', 'CANCELLED'],
  DEPARTED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

export async function updateTrip(actor: Actor, id: string, input: UpdateTripInput) {
  const trip = await Trip.findById(id);
  if (!trip) throw notFound('Trip');
  assertOperatorAccess(actor, trip.operatorId);

  if ((input.baseFare !== undefined || input.departureTime !== undefined) && trip.status !== 'SCHEDULED') {
    throw conflict(`A ${trip.status.toLowerCase()} trip can no longer be edited`, 'TRIP_NOT_EDITABLE');
  }

  // New fare applies to future bookings only; existing bookings keep their frozen fare.
  if (input.baseFare !== undefined) trip.baseFare = input.baseFare;

  if (input.departureTime !== undefined) {
    const departure = new Date(input.departureTime);
    if (departure <= new Date()) throw badRequest('Departure time must be in the future', 'DEPARTURE_IN_PAST');
    if (await Booking.exists({ tripId: trip._id, status: { $in: ['CONFIRMED', 'PENDING'] } })) {
      throw conflict('This trip already has bookings and cannot be rescheduled', 'TRIP_HAS_BOOKINGS');
    }
    const route = await Route.findById(trip.routeId).lean();
    if (!route) throw notFound('Route');
    const arrival = addMinutes(departure, route.durationMinutes);
    await assertBusFree(trip.busId, departure, arrival, trip._id);
    trip.departureTime = departure;
    trip.arrivalTime = arrival;
    await writeTripStops(trip._id, route.stops, departure);
  }

  let cancelledBookings = 0;
  if (input.status !== undefined && input.status !== trip.status) {
    if (!TRANSITIONS[trip.status].includes(input.status)) {
      throw conflict(`A ${trip.status.toLowerCase()} trip cannot become ${input.status.toLowerCase()}`, 'INVALID_TRIP_TRANSITION');
    }
    trip.status = input.status;
  }
  await trip.save();

  if (input.status === 'CANCELLED') {
    // Passengers are refunded in full when the operator cancels.
    cancelledBookings = await cancelBookingsForTrip(actor, String(trip._id));
  }
  await recordAudit(actor, {
    action: input.status === 'CANCELLED' ? 'TRIP_CANCELLED' : 'TRIP_UPDATED',
    entityType: 'Trip',
    entityId: id,
    metadata: { ...input, cancelledBookings },
  });
  return { ...trip.toObject(), cancelledBookings };
}

// ── Passenger manifest ─────────────────────────────────────────────────────

export async function getManifest(actor: Actor, id: string) {
  const trip = await Trip.findById(id)
    .populate('busId', 'name registrationNumber busType isAC')
    .populate('operatorId', 'name code')
    .populate('routeId', 'code sourceCity destinationCity')
    .lean();
  if (!trip) throw notFound('Trip');
  assertOperatorAccess(actor, (trip.operatorId as unknown as { _id: unknown })._id);

  const bookings = await Booking.find({ tripId: id, status: 'CONFIRMED' })
    .populate<{ boardingStopId: Named }>('boardingStopId', 'name')
    .populate<{ droppingStopId: Named }>('droppingStopId', 'name')
    .lean();
  const bookingById = new Map(bookings.map((b) => [String(b._id), b]));
  const passengers = await BookingPassenger.find({ bookingId: { $in: bookings.map((b) => b._id) } }).lean();
  const capacity = await capacityByBus([(trip.busId as unknown as { _id: unknown })._id]);
  const totalSeats = capacity.get(String((trip.busId as unknown as { _id: unknown })._id))?.seats ?? 0;

  const rows = passengers
    .map((p) => {
      const b = bookingById.get(String(p.bookingId))!;
      return {
        seatNumber: p.seatNumber,
        name: p.name,
        age: p.age,
        gender: p.gender,
        pnr: b.pnr,
        contactPhone: b.contactPhone,
        boardingPoint: b.boardingStopId?.name ?? '',
        droppingPoint: b.droppingStopId?.name ?? '',
        fare: p.fare,
      };
    })
    .sort((a, b) => a.seatNumber.localeCompare(b.seatNumber, undefined, { numeric: true }));

  return {
    trip: {
      _id: String(trip._id),
      status: trip.status,
      departureTime: trip.departureTime,
      arrivalTime: trip.arrivalTime,
      bus: trip.busId,
      operator: trip.operatorId,
      route: trip.routeId,
    },
    summary: {
      totalSeats,
      bookedSeats: rows.length,
      availableSeats: Math.max(0, totalSeats - rows.length),
      occupancyPercent: totalSeats ? Math.round((rows.length / totalSeats) * 1000) / 10 : 0,
      bookings: bookings.length,
    },
    passengers: rows,
  };
}

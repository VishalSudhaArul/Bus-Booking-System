import { z } from 'zod';
import { assertOperatorAccess, operatorScope } from '../../middleware/auth';
import { STOP_TYPES, type Actor } from '../../types/domain';
import { badRequest, notFound } from '../../utils/errors';
import { containsRegex, objectId, pageMeta, searchQuery } from '../../utils/http';
import { recordAudit } from '../audit/audit.service';
import { Booking } from '../bookings/booking.model';
import { Operator } from '../operators/operator.model';
import { Stop } from '../stops/stop.model';
import { Trip } from '../trips/trip.model';
import { Route } from './route.model';

export const listRoutesQuery = searchQuery.extend({
  operatorId: objectId.optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

const routeStop = z.object({
  stopId: objectId,
  type: z.enum(STOP_TYPES),
  offsetMinutes: z.number().int().min(0).max(48 * 60),
});

export const createRouteSchema = z
  .object({
    operatorId: objectId,
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{3,16}$/, 'Code must be 3-16 letters, digits or dashes'),
    sourceCity: z.string().trim().min(2).max(60),
    destinationCity: z.string().trim().min(2).max(60),
    distanceKm: z.number().min(1).max(5000),
    durationMinutes: z.number().int().min(10).max(48 * 60),
    stops: z.array(routeStop).min(2, 'Add at least one boarding and one dropping point').max(20),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.sourceCity.toLowerCase() !== v.destinationCity.toLowerCase(), {
    message: 'Source and destination must be different cities',
    path: ['destinationCity'],
  });

export const updateRouteSchema = z.object({
  distanceKm: z.number().min(1).max(5000).optional(),
  durationMinutes: z.number().int().min(10).max(48 * 60).optional(),
  stops: z.array(routeStop).min(2).max(20).optional(),
  isActive: z.boolean().optional(),
});

/** Orders stops by time and checks the stop list makes a bookable journey. */
async function normaliseStops(stops: z.infer<typeof routeStop>[], durationMinutes: number) {
  const ids = stops.map((s) => s.stopId);
  if (new Set(ids).size !== ids.length) throw badRequest('A stop can appear only once on a route', 'DUPLICATE_STOP');
  const found = await Stop.countDocuments({ _id: { $in: ids }, isActive: true });
  if (found !== ids.length) throw badRequest('One or more stops do not exist or are inactive', 'STOP_NOT_FOUND');

  const ordered = [...stops].sort((a, b) => a.offsetMinutes - b.offsetMinutes);
  if (ordered.some((s) => s.offsetMinutes > durationMinutes)) {
    throw badRequest('Stop offsets cannot exceed the route duration', 'INVALID_STOP_OFFSET');
  }
  const lastBoarding = Math.max(...ordered.map((s, i) => (s.type === 'BOARDING' ? i : -1)));
  const firstDropping = ordered.findIndex((s) => s.type === 'DROPPING');
  if (lastBoarding === -1 || firstDropping === -1) {
    throw badRequest('A route needs at least one boarding and one dropping point', 'INVALID_STOPS');
  }
  if (firstDropping < lastBoarding) {
    throw badRequest('All boarding points must come before the first dropping point', 'INVALID_STOP_ORDER');
  }
  return ordered.map((s, i) => ({ ...s, sequence: i + 1 }));
}

export async function listRoutes(actor: Actor, q: z.infer<typeof listRoutesQuery>) {
  const filter: Record<string, unknown> = { ...operatorScope(actor) };
  if (actor.role === 'ADMIN' && q.operatorId) filter.operatorId = q.operatorId;
  if (q.isActive) filter.isActive = q.isActive === 'true';
  if (q.search) {
    const rx = containsRegex(q.search);
    filter.$or = [{ code: rx }, { sourceCity: rx }, { destinationCity: rx }];
  }
  const [items, total] = await Promise.all([
    Route.find(filter)
      .sort({ sourceCity: 1, destinationCity: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('operatorId', 'name code')
      .populate('stops.stopId', 'name city')
      .lean(),
    Route.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

export async function getRoute(actor: Actor, id: string) {
  const route = await Route.findById(id).populate('operatorId', 'name code').populate('stops.stopId', 'name city').lean();
  if (!route) throw notFound('Route');
  assertOperatorAccess(actor, (route.operatorId as unknown as { _id: unknown })._id);
  return route;
}

export async function createRoute(actor: Actor, input: z.infer<typeof createRouteSchema>) {
  if (!(await Operator.exists({ _id: input.operatorId, isActive: true }))) {
    throw badRequest('Operator does not exist or is inactive', 'OPERATOR_NOT_FOUND');
  }
  const route = await Route.create({
    ...input,
    sourceCityKey: input.sourceCity.toLowerCase(),
    destinationCityKey: input.destinationCity.toLowerCase(),
    stops: await normaliseStops(input.stops, input.durationMinutes),
  });
  await recordAudit(actor, { action: 'ROUTE_CREATED', entityType: 'Route', entityId: route._id, metadata: { code: route.code } });
  return getRoute(actor, String(route._id));
}

export async function updateRoute(actor: Actor, id: string, input: z.infer<typeof updateRouteSchema>) {
  const route = await Route.findById(id);
  if (!route) throw notFound('Route');
  const duration = input.durationMinutes ?? route.durationMinutes;
  if (input.distanceKm !== undefined) route.distanceKm = input.distanceKm;
  if (input.durationMinutes !== undefined) route.durationMinutes = input.durationMinutes;
  if (input.isActive !== undefined) route.isActive = input.isActive;
  // Existing trips keep their own TripStops; template changes apply to new trips only.
  if (input.stops) route.set('stops', await normaliseStops(input.stops, duration));
  await route.save();
  await recordAudit(actor, { action: 'ROUTE_UPDATED', entityType: 'Route', entityId: id, metadata: { fields: Object.keys(input) } });
  return getRoute(actor, id);
}

/** Landing page: city pairs ranked by confirmed bookings, with the lowest upcoming fare. */
export async function popularRoutes(limit = 6) {
  const now = new Date();
  const [fares, demand] = await Promise.all([
    Trip.aggregate<{ _id: unknown; minFare: number; trips: number }>([
      { $match: { status: 'SCHEDULED', departureTime: { $gt: now } } },
      { $group: { _id: '$routeId', minFare: { $min: '$baseFare' }, trips: { $sum: 1 } } },
    ]),
    Booking.aggregate<{ _id: unknown; bookings: number }>([
      { $match: { status: 'CONFIRMED' } },
      { $group: { _id: '$routeId', bookings: { $sum: 1 } } },
    ]),
  ]);
  const routes = await Route.find({ _id: { $in: fares.map((f) => f._id) }, isActive: true })
    .select('sourceCity destinationCity durationMinutes distanceKm')
    .lean();
  const demandByRoute = new Map(demand.map((d) => [String(d._id), d.bookings]));
  const fareByRoute = new Map(fares.map((f) => [String(f._id), f]));

  // Several operators may run the same city pair — merge them into one card.
  const pairs = new Map<string, { sourceCity: string; destinationCity: string; durationMinutes: number; distanceKm: number; minFare: number; trips: number; bookings: number }>();
  for (const r of routes) {
    const key = `${r.sourceCity.toLowerCase()}|${r.destinationCity.toLowerCase()}`;
    const fare = fareByRoute.get(String(r._id))!;
    const current = pairs.get(key);
    const bookings = demandByRoute.get(String(r._id)) ?? 0;
    if (!current) {
      pairs.set(key, { sourceCity: r.sourceCity, destinationCity: r.destinationCity, durationMinutes: r.durationMinutes, distanceKm: r.distanceKm, minFare: fare.minFare, trips: fare.trips, bookings });
    } else {
      current.minFare = Math.min(current.minFare, fare.minFare);
      current.durationMinutes = Math.min(current.durationMinutes, r.durationMinutes);
      current.trips += fare.trips;
      current.bookings += bookings;
    }
  }
  return [...pairs.values()].sort((a, b) => b.bookings - a.bookings || b.trips - a.trips).slice(0, limit);
}

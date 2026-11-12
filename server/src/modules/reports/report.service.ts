import { z } from 'zod';
import type { Actor } from '../../types/domain';
import { forbidden } from '../../utils/errors';
import { paginationQuery, toId } from '../../utils/http';
import { istDayRange, round2 } from '../../utils/time';
import { Booking, SeatAllocation } from '../bookings/booking.model';
import { Bus } from '../buses/bus.model';
import { Cancellation } from '../cancellations/cancellation.model';
import { Operator } from '../operators/operator.model';
import { Route } from '../routes/route.model';
import { Seat } from '../seats/seat.model';
import { Trip } from '../trips/trip.model';
import { listTrips } from '../trips/trip.service';
import { User } from '../users/user.model';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');
export const rangeQuery = z.object({ from: dateOnly.optional(), to: dateOnly.optional() });
export const occupancyQuery = paginationQuery.merge(rangeQuery).extend({ order: z.enum(['asc', 'desc']).default('desc') });

const DAY_MS = 24 * 60 * 60 * 1000;

/** Aggregation pipelines do not cast, so the scope is built with real ObjectIds. */
function scopeOf(actor: Actor): Record<string, unknown> {
  if (actor.role === 'ADMIN') return {};
  if (actor.role === 'OPERATOR' && actor.operatorId) return { operatorId: toId(actor.operatorId) };
  throw forbidden();
}

function createdRange(q: z.infer<typeof rangeQuery>) {
  if (!q.from && !q.to) return {};
  return {
    createdAt: {
      ...(q.from ? { $gte: istDayRange(q.from).start } : {}),
      ...(q.to ? { $lt: istDayRange(q.to).end } : {}),
    },
  };
}

/** Seats sold vs seats offered across a set of trips. */
async function occupancyFor(tripFilter: Record<string, unknown>) {
  const trips = await Trip.find(tripFilter).select('busId').lean();
  if (trips.length === 0) return { capacity: 0, sold: 0, percent: 0 };
  const seatCounts = await Seat.aggregate<{ _id: unknown; seats: number }>([
    { $match: { busId: { $in: [...new Set(trips.map((t) => String(t.busId)))].map(toId) }, isActive: true } },
    { $group: { _id: '$busId', seats: { $sum: 1 } } },
  ]);
  const perBus = new Map(seatCounts.map((s) => [String(s._id), s.seats]));
  const capacity = trips.reduce((sum, t) => sum + (perBus.get(String(t.busId)) ?? 0), 0);
  const sold = await SeatAllocation.countDocuments({ tripId: { $in: trips.map((t) => t._id) }, status: 'ACTIVE' });
  return { capacity, sold, percent: capacity ? round2((sold / capacity) * 100) : 0 };
}

async function bookingTotals(match: Record<string, unknown>) {
  const [byStatus, refunds] = await Promise.all([
    Booking.aggregate<{ _id: string; count: number; amount: number; seats: number }>([
      { $match: { ...match, status: { $in: ['CONFIRMED', 'CANCELLED'] } } },
      { $group: { _id: '$status', count: { $sum: 1 }, amount: { $sum: '$fare.total' }, seats: { $sum: '$seatCount' } } },
    ]),
    Cancellation.aggregate<{ _id: null; refunded: number; fees: number }>([
      { $match: match },
      { $group: { _id: null, refunded: { $sum: '$refundAmount' }, fees: { $sum: '$cancellationFee' } } },
    ]),
  ]);
  const confirmed = byStatus.find((s) => s._id === 'CONFIRMED');
  const cancelled = byStatus.find((s) => s._id === 'CANCELLED');
  return {
    totalBookings: (confirmed?.count ?? 0) + (cancelled?.count ?? 0),
    confirmedBookings: confirmed?.count ?? 0,
    cancelledBookings: cancelled?.count ?? 0,
    seatsSold: confirmed?.seats ?? 0,
    // Revenue kept by the business: confirmed fares plus retained cancellation fees.
    revenue: round2((confirmed?.amount ?? 0) + (refunds[0]?.fees ?? 0)),
    refundsIssued: round2(refunds[0]?.refunded ?? 0),
    cancellationFees: round2(refunds[0]?.fees ?? 0),
  };
}

async function routeSummary(match: Record<string, unknown>, limit = 10) {
  const rows = await Booking.aggregate<{ _id: unknown; bookings: number; confirmed: number; cancelled: number; seats: number; revenue: number }>([
    { $match: { ...match, status: { $in: ['CONFIRMED', 'CANCELLED'] } } },
    {
      $group: {
        _id: '$routeId',
        bookings: { $sum: 1 },
        confirmed: { $sum: { $cond: [{ $eq: ['$status', 'CONFIRMED'] }, 1, 0] } },
        cancelled: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
        seats: { $sum: { $cond: [{ $eq: ['$status', 'CONFIRMED'] }, '$seatCount', 0] } },
        revenue: { $sum: { $cond: [{ $eq: ['$status', 'CONFIRMED'] }, '$fare.total', 0] } },
      },
    },
    { $sort: { bookings: -1 } },
    { $limit: limit },
  ]);
  const routes = await Route.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('code sourceCity destinationCity operatorId')
    .populate('operatorId', 'name')
    .lean();
  const byId = new Map(routes.map((r) => [String(r._id), r]));
  return rows.map((r) => {
    const route = byId.get(String(r._id));
    return {
      routeId: String(r._id),
      code: route?.code ?? '—',
      route: route ? `${route.sourceCity} → ${route.destinationCity}` : 'Unknown route',
      operator: (route?.operatorId as unknown as { name?: string })?.name ?? '',
      bookings: r.bookings,
      confirmed: r.confirmed,
      cancelled: r.cancelled,
      seats: r.seats,
      revenue: round2(r.revenue),
    };
  });
}

/** Everything the overview dashboard shows — all computed from live collections. */
export async function getDashboard(actor: Actor) {
  const scope = scopeOf(actor);
  const now = new Date();
  const trendStart = new Date(now.getTime() - 13 * DAY_MS);

  const [totals, scheduledTrips, totalTrips, totalBuses, occupancy, routes, trendRows, recent, extra] = await Promise.all([
    bookingTotals(scope),
    Trip.countDocuments({ ...scope, status: 'SCHEDULED', departureTime: { $gt: now } }),
    Trip.countDocuments(scope),
    Bus.countDocuments({ ...scope, isActive: true }),
    occupancyFor({
      ...scope,
      status: { $ne: 'CANCELLED' },
      departureTime: { $gte: new Date(now.getTime() - 30 * DAY_MS), $lte: new Date(now.getTime() + 30 * DAY_MS) },
    }),
    routeSummary(scope, 6),
    Booking.aggregate<{ _id: string; bookings: number; revenue: number }>([
      { $match: { ...scope, status: { $in: ['CONFIRMED', 'CANCELLED'] }, createdAt: { $gte: istDayRange(trendStart.toISOString().slice(0, 10)).start } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Asia/Kolkata' } },
          bookings: { $sum: 1 },
          revenue: { $sum: { $cond: [{ $eq: ['$status', 'CONFIRMED'] }, '$fare.total', 0] } },
        },
      },
    ]),
    Booking.find({ ...scope, status: { $in: ['CONFIRMED', 'CANCELLED'] } })
      .sort({ createdAt: -1 })
      .limit(8)
      .select('pnr status seatCount fare.total createdAt routeId userId')
      .populate('routeId', 'sourceCity destinationCity')
      .populate('userId', 'name')
      .lean(),
    actor.role === 'ADMIN'
      ? Promise.all([Operator.countDocuments({ isActive: true }), User.countDocuments({ role: 'PASSENGER' })])
      : Promise.resolve(null),
  ]);

  // Fill gaps so the chart shows a continuous 14-day axis.
  const byDay = new Map(trendRows.map((r) => [r._id, r]));
  const trend = Array.from({ length: 14 }, (_, i) => {
    const day = new Date(trendStart.getTime() + i * DAY_MS + 330 * 60_000).toISOString().slice(0, 10);
    return { date: day, bookings: byDay.get(day)?.bookings ?? 0, revenue: round2(byDay.get(day)?.revenue ?? 0) };
  });

  return {
    stats: {
      ...totals,
      scheduledTrips,
      totalTrips,
      totalBuses,
      occupancyPercent: occupancy.percent,
      seatsOffered: occupancy.capacity,
      seatsFilled: occupancy.sold,
      ...(extra ? { activeOperators: extra[0], passengers: extra[1] } : {}),
    },
    routeSummary: routes,
    trend,
    recentBookings: recent.map((b) => ({
      _id: String(b._id),
      pnr: b.pnr,
      status: b.status,
      seatCount: b.seatCount,
      total: b.fare.total,
      createdAt: b.createdAt,
      route: b.routeId,
      passenger: (b.userId as unknown as { name?: string })?.name ?? '',
    })),
  };
}

/** Per-trip seat occupancy, plus the aggregate for the selected period. */
export async function getOccupancyReport(actor: Actor, q: z.infer<typeof occupancyQuery>) {
  const scope = scopeOf(actor);
  const range =
    q.from || q.to
      ? { departureTime: { ...(q.from ? { $gte: istDayRange(q.from).start } : {}), ...(q.to ? { $lt: istDayRange(q.to).end } : {}) } }
      : {};
  const [{ items, meta }, summary] = await Promise.all([
    listTrips(actor, { page: q.page, limit: q.limit, from: q.from, to: q.to, order: q.order }),
    occupancyFor({ ...scope, ...range, status: { $ne: 'CANCELLED' } }),
  ]);
  return { items, meta, summary };
}

export async function getBookingSummary(actor: Actor, q: z.infer<typeof rangeQuery>) {
  const match = { ...scopeOf(actor), ...createdRange(q) };
  // Cancellations are filtered by when the booking was cancelled, bookings by when they were made.
  const [totals, routes] = await Promise.all([bookingTotals(match), routeSummary(match, 50)]);
  return { totals, routes };
}

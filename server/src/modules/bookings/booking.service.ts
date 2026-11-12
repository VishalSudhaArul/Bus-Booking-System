import { createHash, randomBytes } from 'crypto';
import mongoose, { Types } from 'mongoose';
import type { z } from 'zod';
import { supportsTransactions } from '../../config/db';
import { env } from '../../config/env';
import type { Actor } from '../../types/domain';
import { AppError, badRequest, conflict, forbidden, isDuplicateKeyError, notFound, unprocessable } from '../../utils/errors';
import { containsRegex, pageMeta } from '../../utils/http';
import { logger } from '../../utils/logger';
import { pnrGenerator } from '../../utils/pnr';
import { round2 } from '../../utils/time';
import { recordAudit } from '../audit/audit.service';
import { Cancellation } from '../cancellations/cancellation.model';
import { Seat } from '../seats/seat.model';
import { Trip, TripStop } from '../trips/trip.model';
import { Booking, BookingPassenger, SeatAllocation } from './booking.model';
import type { CreateBookingInput, listBookingsQuery, myBookingsQuery } from './booking.validation';

const MAX_PNR_ATTEMPTS = 5;

interface FareBreakdown {
  baseFare: number;
  seatCharges: number;
  taxPercent: number;
  taxes: number;
  total: number;
}

/** The only place a fare is ever computed. Client-supplied prices are never read. */
export function calculateFare(baseFare: number, modifiers: number[], taxPercent = env.GST_PERCENT): FareBreakdown {
  const base = round2(baseFare * modifiers.length);
  const seatCharges = round2(modifiers.reduce((sum, m) => sum + m, 0));
  const taxes = round2(((base + seatCharges) * taxPercent) / 100);
  return { baseFare: base, seatCharges, taxPercent, taxes, total: round2(base + seatCharges + taxes) };
}

/** Stable fingerprint of a booking request, used to detect a reused idempotency key. */
function hashRequest(input: CreateBookingInput): string {
  const canonical = {
    tripId: input.tripId,
    boardingStopId: input.boardingStopId,
    droppingStopId: input.droppingStopId,
    contact: input.contact,
    passengers: [...input.passengers].sort((a, b) => a.seatId.localeCompare(b.seatId)),
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

const violatedIndex = (err: unknown): 'SEAT' | 'IDEMPOTENCY' | 'PNR' | 'OTHER' => {
  const message = String((err as Error)?.message ?? '');
  if (message.includes('uniq_active_trip_seat')) return 'SEAT';
  if (message.includes('idempotencyKey')) return 'IDEMPOTENCY';
  if (message.includes('pnr')) return 'PNR';
  return 'OTHER';
};

async function seatConflict(tripId: unknown, seats: { _id: Types.ObjectId; seatNumber: string }[]) {
  const taken = await SeatAllocation.find({ tripId, seatId: { $in: seats.map((s) => s._id) }, status: 'ACTIVE' }).select('seatId').lean();
  const takenIds = new Set(taken.map((t) => String(t.seatId)));
  const lost = seats.filter((s) => takenIds.has(String(s._id)));
  const names = lost.map((s) => s.seatNumber).join(', ');
  return conflict(
    names ? `Seat ${names} was just booked by someone else. Please choose another seat.` : 'One or more seats are no longer available.',
    'SEAT_ALREADY_BOOKED',
    { seats: lost.map((s) => ({ seatId: String(s._id), seatNumber: s.seatNumber })) },
  );
}

/** A repeat of a request we have already seen: return the original outcome, never a second booking. */
async function replay(actor: Actor, existing: { _id: unknown; status: string; requestHash: string }, requestHash: string) {
  if (existing.requestHash !== requestHash) {
    throw unprocessable('This Idempotency-Key was already used for a different booking request', 'IDEMPOTENCY_KEY_REUSED');
  }
  if (existing.status === 'PENDING') {
    throw conflict('This booking is still being processed. Please retry shortly.', 'BOOKING_IN_PROGRESS');
  }
  return { booking: await getBookingDetails(actor, String(existing._id)), replayed: true };
}

export interface CreateBookingOptions {
  /** Seed script only: allows historical demo bookings on past trips. */
  allowPast?: boolean;
}

/**
 * Confirms a booking.
 *
 * Seat integrity does not depend on the checks below — they only produce good
 * error messages. The guarantee is the partial unique index on
 * SeatAllocation(tripId, seatId) for ACTIVE rows: whichever request inserts
 * first wins, every other one gets E11000 and is turned into a 409.
 */
export async function createBooking(actor: Actor, input: CreateBookingInput, idempotencyKey: string, options: CreateBookingOptions = {}) {
  const requestHash = hashRequest(input);

  const prior = await Booking.findOne({ userId: actor.id, idempotencyKey }).select('status requestHash').lean();
  if (prior) return replay(actor, prior, requestHash);

  // 1. Trip must exist and still be open for sale.
  const trip = await Trip.findById(input.tripId).lean();
  if (!trip) throw notFound('Trip');
  if (trip.status !== 'SCHEDULED' && !options.allowPast) throw conflict('This trip is no longer open for booking', 'TRIP_NOT_BOOKABLE');
  if (trip.departureTime <= new Date() && !options.allowPast) throw conflict('This trip has already departed', 'TRIP_DEPARTED');

  // 2. Every requested seat must belong to this trip's bus and be in service.
  const seatIds = input.passengers.map((p) => p.seatId);
  const seats = await Seat.find({ _id: { $in: seatIds }, busId: trip.busId }).lean();
  if (seats.length !== seatIds.length) throw badRequest('One or more selected seats do not belong to this bus', 'INVALID_SEATS');
  const outOfService = seats.filter((s) => !s.isActive);
  if (outOfService.length) {
    throw conflict(`Seat ${outOfService.map((s) => s.seatNumber).join(', ')} is not available for booking`, 'SEAT_UNAVAILABLE');
  }

  // 3. Boarding and dropping points must be real stops of this trip, in order.
  const stops = await TripStop.find({ tripId: trip._id, stopId: { $in: [input.boardingStopId, input.droppingStopId] } }).lean();
  const boarding = stops.find((s) => String(s.stopId) === input.boardingStopId && s.type === 'BOARDING');
  const dropping = stops.find((s) => String(s.stopId) === input.droppingStopId && s.type === 'DROPPING');
  if (!boarding) throw badRequest('Selected boarding point is not valid for this trip', 'INVALID_BOARDING_POINT');
  if (!dropping) throw badRequest('Selected dropping point is not valid for this trip', 'INVALID_DROPPING_POINT');
  if (boarding.sequence >= dropping.sequence) throw badRequest('Dropping point must come after the boarding point', 'INVALID_STOP_ORDER');

  // 4. Fare is recomputed from database values only.
  const seatById = new Map(seats.map((s) => [String(s._id), s]));
  const fare = calculateFare(trip.baseFare, seats.map((s) => s.priceModifier));

  const build = (pnr: string, status: 'PENDING' | 'CONFIRMED') => {
    const bookingId = new Types.ObjectId();
    return {
      bookingId,
      booking: {
        _id: bookingId,
        pnr,
        userId: actor.id,
        tripId: trip._id,
        operatorId: trip.operatorId,
        routeId: trip.routeId,
        boardingStopId: input.boardingStopId,
        droppingStopId: input.droppingStopId,
        status,
        seatCount: seats.length,
        contactEmail: input.contact.email,
        contactPhone: input.contact.phone,
        fare,
        payment: { method: 'SIMULATED', reference: `PAY-${randomBytes(6).toString('hex').toUpperCase()}`, status: 'PAID' },
        idempotencyKey,
        requestHash,
      },
      allocations: seats.map((s) => ({ tripId: trip._id, seatId: s._id, bookingId, status: 'ACTIVE' })),
      passengers: input.passengers.map((p) => {
        const seat = seatById.get(p.seatId)!;
        return { bookingId, tripId: trip._id, seatId: seat._id, seatNumber: seat.seatNumber, name: p.name, age: p.age, gender: p.gender, fare: trip.baseFare + seat.priceModifier };
      }),
    };
  };

  for (let attempt = 1; attempt <= MAX_PNR_ATTEMPTS; attempt += 1) {
    const pnr = pnrGenerator.next();
    try {
      const bookingId = supportsTransactions() ? await persistInTransaction(build, pnr) : await persistWithCompensation(build, pnr);
      await recordAudit(actor, { action: 'BOOKING_CONFIRMED', entityType: 'Booking', entityId: bookingId, metadata: { pnr, seats: seats.map((s) => s.seatNumber), total: fare.total } });
      return { booking: await getBookingDetails(actor, String(bookingId)), replayed: false };
    } catch (err) {
      if (!isDuplicateKeyError(err)) throw err;
      const index = violatedIndex(err);
      if (index === 'SEAT') throw await seatConflict(trip._id, seats);
      if (index === 'IDEMPOTENCY') {
        // The same request arrived twice at once; the other copy won the insert.
        const winner = await Booking.findOne({ userId: actor.id, idempotencyKey }).select('status requestHash').lean();
        if (winner) return replay(actor, winner, requestHash);
        throw conflict('This booking is still being processed. Please retry shortly.', 'BOOKING_IN_PROGRESS');
      }
      if (index === 'PNR' && attempt < MAX_PNR_ATTEMPTS) continue; // collision: draw another PNR
      throw err;
    }
  }
  throw new AppError(503, 'PNR_GENERATION_FAILED', 'Could not generate a booking reference. Please try again.');
}

type Builder = (pnr: string, status: 'PENDING' | 'CONFIRMED') => {
  bookingId: Types.ObjectId;
  booking: Record<string, unknown>;
  allocations: Record<string, unknown>[];
  passengers: Record<string, unknown>[];
};

/** Replica set / Atlas: booking, allocations and passengers commit together or not at all. */
async function persistInTransaction(build: Builder, pnr: string): Promise<Types.ObjectId> {
  const session = await mongoose.startSession();
  try {
    let id!: Types.ObjectId;
    await session.withTransaction(async () => {
      const docs = build(pnr, 'CONFIRMED');
      id = docs.bookingId;
      await Booking.create([docs.booking], { session });
      await SeatAllocation.insertMany(docs.allocations, { session });
      await BookingPassenger.insertMany(docs.passengers, { session });
    });
    return id;
  } finally {
    await session.endSession();
  }
}

/**
 * Standalone MongoDB (no transactions): the booking starts as PENDING and is
 * only flipped to CONFIRMED once every seat has been allocated. If any step
 * fails, everything written for this booking is removed, so a partially
 * allocated booking can never be observed as confirmed.
 */
async function persistWithCompensation(build: Builder, pnr: string): Promise<Types.ObjectId> {
  const docs = build(pnr, 'PENDING');
  await Booking.create(docs.booking); // may throw E11000 on pnr / idempotency key — nothing to undo yet
  try {
    await SeatAllocation.insertMany(docs.allocations, { ordered: true });
    await BookingPassenger.insertMany(docs.passengers, { ordered: true });
    await Booking.updateOne({ _id: docs.bookingId, status: 'PENDING' }, { $set: { status: 'CONFIRMED' } });
    return docs.bookingId;
  } catch (err) {
    await discardBooking(docs.bookingId);
    throw err;
  }
}

/** Compensation: remove every trace of a booking that never reached CONFIRMED. */
export async function discardBooking(bookingId: unknown) {
  await SeatAllocation.deleteMany({ bookingId });
  await BookingPassenger.deleteMany({ bookingId });
  await Booking.deleteOne({ _id: bookingId, status: 'PENDING' });
}

/**
 * Crash recovery for the compensation strategy. Cleans up bookings stuck in
 * PENDING (process died mid-booking) and releases seats still held by a
 * cancelled booking (process died mid-cancellation).
 */
export async function reconcileBookings(olderThanMs = 2 * 60_000) {
  const stale = await Booking.find({ status: 'PENDING', createdAt: { $lt: new Date(Date.now() - olderThanMs) } }).select('_id').lean();
  for (const b of stale) await discardBooking(b._id);

  const cancelled = await Booking.find({ status: 'CANCELLED' }).distinct('_id');
  const released = await SeatAllocation.updateMany(
    { bookingId: { $in: cancelled }, status: 'ACTIVE' },
    { $set: { status: 'RELEASED', releasedAt: new Date() } },
  );
  if (stale.length || released.modifiedCount) {
    logger.warn('Booking reconciliation repaired records', { discardedPending: stale.length, releasedSeats: released.modifiedCount });
  }
  return { discardedPending: stale.length, releasedSeats: released.modifiedCount };
}

// ── Reads ──────────────────────────────────────────────────────────────────

interface StopRef {
  _id: Types.ObjectId;
  name: string;
  city: string;
  landmark?: string;
}

export async function getBookingDetails(actor: Actor, id: string) {
  const booking = await Booking.findById(id)
    .populate<{ boardingStopId: StopRef }>('boardingStopId', 'name city landmark')
    .populate<{ droppingStopId: StopRef }>('droppingStopId', 'name city landmark')
    .populate('operatorId', 'name code contactPhone')
    .populate('routeId', 'code sourceCity destinationCity distanceKm')
    .populate('userId', 'name email')
    .lean();
  if (!booking) throw notFound('Booking');

  const ownerId = String((booking.userId as unknown as { _id: unknown })?._id ?? booking.userId);
  const operatorId = String((booking.operatorId as unknown as { _id: unknown })?._id ?? booking.operatorId);
  // A passenger probing someone else's id learns nothing: same 404 as a missing booking.
  if (actor.role === 'PASSENGER' && ownerId !== actor.id) throw notFound('Booking');
  if (actor.role === 'OPERATOR' && operatorId !== actor.operatorId) throw forbidden();

  const [trip, passengers, tripStops, cancellation] = await Promise.all([
    Trip.findById(booking.tripId).populate('busId', 'name busType isAC registrationNumber').lean(),
    BookingPassenger.find({ bookingId: booking._id }).select('name age gender seatNumber fare').lean(),
    TripStop.find({ tripId: booking.tripId, stopId: { $in: [booking.boardingStopId._id, booking.droppingStopId._id] } }).lean(),
    Cancellation.findOne({ bookingId: booking._id }).lean(),
  ]);
  const timeOf = (stopId: unknown) => tripStops.find((s) => String(s.stopId) === String(stopId))?.scheduledTime ?? null;

  return {
    _id: String(booking._id),
    pnr: booking.pnr,
    status: booking.status,
    seatCount: booking.seatCount,
    contactEmail: booking.contactEmail,
    contactPhone: booking.contactPhone,
    fare: booking.fare,
    payment: booking.payment,
    createdAt: booking.createdAt,
    cancelledAt: booking.cancelledAt ?? null,
    bookedBy: booking.userId,
    operator: booking.operatorId,
    route: booking.routeId,
    trip: trip
      ? { _id: String(trip._id), status: trip.status, departureTime: trip.departureTime, arrivalTime: trip.arrivalTime, bus: trip.busId }
      : null,
    boardingPoint: { ...booking.boardingStopId, time: timeOf(booking.boardingStopId._id) },
    droppingPoint: { ...booking.droppingStopId, time: timeOf(booking.droppingStopId._id) },
    passengers: passengers.sort((a, b) => a.seatNumber.localeCompare(b.seatNumber, undefined, { numeric: true })),
    cancellation,
  };
}

export async function getBookingByPnr(actor: Actor, pnr: string) {
  const booking = await Booking.findOne({ pnr }).select('_id').lean();
  if (!booking) throw notFound('Booking');
  return getBookingDetails(actor, String(booking._id));
}

async function summarise(filter: Record<string, unknown>, page: number, limit: number) {
  const [bookings, total] = await Promise.all([
    Booking.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-requestHash -idempotencyKey')
      .populate('operatorId', 'name')
      .populate('routeId', 'sourceCity destinationCity')
      .populate('tripId', 'departureTime arrivalTime status')
      .populate('userId', 'name email')
      .lean(),
    Booking.countDocuments(filter),
  ]);
  const passengers = await BookingPassenger.find({ bookingId: { $in: bookings.map((b) => b._id) } }).select('bookingId seatNumber name').lean();
  const byBooking = new Map<string, { seatNumber: string; name: string }[]>();
  for (const p of passengers) {
    const list = byBooking.get(String(p.bookingId)) ?? [];
    list.push({ seatNumber: p.seatNumber, name: p.name });
    byBooking.set(String(p.bookingId), list);
  }
  const items = bookings.map((b) => ({
    _id: String(b._id),
    pnr: b.pnr,
    status: b.status,
    seatCount: b.seatCount,
    total: b.fare.total,
    paymentStatus: b.payment?.status,
    contactEmail: b.contactEmail,
    contactPhone: b.contactPhone,
    createdAt: b.createdAt,
    operator: b.operatorId,
    route: b.routeId,
    trip: b.tripId,
    bookedBy: b.userId,
    seats: (byBooking.get(String(b._id)) ?? []).map((p) => p.seatNumber).sort((x, y) => x.localeCompare(y, undefined, { numeric: true })),
    leadPassenger: byBooking.get(String(b._id))?.[0]?.name ?? '',
  }));
  return { items, meta: pageMeta(page, limit, total) };
}

export async function listMyBookings(actor: Actor, q: z.infer<typeof myBookingsQuery>) {
  const filter: Record<string, unknown> = { userId: actor.id, status: q.status ?? { $in: ['CONFIRMED', 'CANCELLED'] } };
  if (q.when) {
    const now = new Date();
    const tripIds = await Booking.find({ userId: actor.id }).distinct('tripId');
    const matching = await Trip.find({ _id: { $in: tripIds }, departureTime: q.when === 'upcoming' ? { $gt: now } : { $lte: now } }).distinct('_id');
    filter.tripId = { $in: matching };
  }
  return summarise(filter, q.page, q.limit);
}

export async function listBookings(actor: Actor, q: z.infer<typeof listBookingsQuery>) {
  const filter: Record<string, unknown> = { status: q.status ?? { $in: ['CONFIRMED', 'CANCELLED'] } };
  if (actor.role === 'OPERATOR') filter.operatorId = actor.operatorId;
  else if (actor.role !== 'ADMIN') throw forbidden();
  else if (q.operatorId) filter.operatorId = q.operatorId;
  if (q.tripId) filter.tripId = q.tripId;
  if (q.search) {
    const rx = containsRegex(q.search);
    filter.$or = [{ pnr: rx }, { contactEmail: rx }, { contactPhone: rx }];
  }
  return summarise(filter, q.page, q.limit);
}

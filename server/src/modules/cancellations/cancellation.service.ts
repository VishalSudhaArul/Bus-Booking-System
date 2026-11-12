import { randomBytes } from 'crypto';
import mongoose, { type ClientSession } from 'mongoose';
import type { z } from 'zod';
import { supportsTransactions } from '../../config/db';
import { env } from '../../config/env';
import type { Actor } from '../../types/domain';
import { conflict, forbidden, isDuplicateKeyError, notFound, unprocessable } from '../../utils/errors';
import { pageMeta, type paginationQuery } from '../../utils/http';
import { hoursBetween, round2 } from '../../utils/time';
import { recordAudit } from '../audit/audit.service';
import { Booking, SeatAllocation } from '../bookings/booking.model';
import { Trip } from '../trips/trip.model';
import { Cancellation } from './cancellation.model';

export interface CancellationPolicy {
  /** Cancellation is refused when fewer than this many hours remain. */
  cutoffHours: number;
  /** Highest `minHours` first; the first tier the booking qualifies for applies. */
  tiers: { minHours: number; refundPercent: number }[];
}

export const defaultPolicy = (): CancellationPolicy => ({
  cutoffHours: env.CANCELLATION_CUTOFF_HOURS,
  tiers: env.CANCELLATION_TIERS,
});

export interface RefundQuote {
  allowed: boolean;
  reason?: string;
  hoursBeforeDeparture: number;
  refundPercent: number;
  refundAmount: number;
  cancellationFee: number;
  refundType: 'FULL' | 'PARTIAL' | 'NONE';
}

/**
 * Single source of truth for refund maths. Pure: same inputs, same answer —
 * used for the preview shown to the passenger and for the actual cancellation.
 */
export function calculateRefund(total: number, departureTime: Date, now: Date = new Date(), policy: CancellationPolicy = defaultPolicy()): RefundQuote {
  const hours = round2(hoursBetween(now, departureTime));
  const denied = (reason: string): RefundQuote => ({
    allowed: false,
    reason,
    hoursBeforeDeparture: hours,
    refundPercent: 0,
    refundAmount: 0,
    cancellationFee: total,
    refundType: 'NONE',
  });
  if (hours <= 0) return denied('This trip has already departed');
  if (hours < policy.cutoffHours) return denied(`Cancellation closes ${policy.cutoffHours} hours before departure`);

  const tiers = [...policy.tiers].sort((a, b) => b.minHours - a.minHours);
  const refundPercent = tiers.find((t) => hours >= t.minHours)?.refundPercent ?? 0;
  const refundAmount = round2((total * refundPercent) / 100);
  return {
    allowed: true,
    hoursBeforeDeparture: hours,
    refundPercent,
    refundAmount,
    cancellationFee: round2(total - refundAmount),
    refundType: refundPercent === 100 ? 'FULL' : refundPercent === 0 ? 'NONE' : 'PARTIAL',
  };
}

async function loadCancellable(actor: Actor, bookingId: string) {
  const booking = await Booking.findById(bookingId).lean();
  if (!booking) throw notFound('Booking');
  // Passengers may cancel only their own booking; admins may cancel any.
  if (actor.role === 'PASSENGER' && String(booking.userId) !== actor.id) throw notFound('Booking');
  if (actor.role === 'OPERATOR') throw forbidden('Operators cancel trips, not individual bookings');
  const trip = await Trip.findById(booking.tripId).lean();
  if (!trip) throw notFound('Trip');
  return { booking, trip };
}

/** Refund preview shown before the passenger confirms the cancellation. */
export async function getCancellationQuote(actor: Actor, bookingId: string) {
  const { booking, trip } = await loadCancellable(actor, bookingId);
  if (booking.status !== 'CONFIRMED') {
    return { ...calculateRefund(booking.fare.total, trip.departureTime), allowed: false, reason: `This booking is ${booking.status.toLowerCase()}`, total: booking.fare.total, policy: defaultPolicy() };
  }
  const quote = calculateRefund(booking.fare.total, trip.departureTime);
  const allowed = quote.allowed && trip.status === 'SCHEDULED';
  return {
    ...quote,
    allowed,
    reason: allowed ? undefined : (quote.reason ?? 'This trip is no longer open for cancellation'),
    total: booking.fare.total,
    policy: defaultPolicy(),
  };
}

interface ApplyInput {
  bookingId: unknown;
  actor: Actor;
  reason: string;
  quote: RefundQuote;
}

/**
 * Writes one cancellation. Order matters when there is no transaction:
 *  1. flip CONFIRMED → CANCELLED with a conditional update (only one caller can win);
 *  2. record the cancellation and refund;
 *  3. release the seats — last, so a seat is never resold before the
 *     cancellation has actually been recorded.
 */
async function applyCancellation({ bookingId, actor, reason, quote }: ApplyInput, session?: ClientSession) {
  const now = new Date();
  const paymentStatus = quote.refundPercent === 100 ? 'REFUNDED' : quote.refundAmount > 0 ? 'PARTIALLY_REFUNDED' : 'NOT_REFUNDED';

  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, status: 'CONFIRMED' },
    { $set: { status: 'CANCELLED', cancelledAt: now, 'payment.status': paymentStatus } },
    { new: true, session },
  );
  if (!booking) throw conflict('This booking has already been cancelled', 'ALREADY_CANCELLED');

  try {
    await Cancellation.create(
      [
        {
          bookingId: booking._id,
          userId: booking.userId,
          operatorId: booking.operatorId,
          cancelledBy: actor.id,
          cancelledByRole: actor.role,
          reason,
          hoursBeforeDeparture: quote.hoursBeforeDeparture,
          refundPercent: quote.refundPercent,
          refundAmount: quote.refundAmount,
          cancellationFee: quote.cancellationFee,
          refundStatus: quote.refundAmount > 0 ? 'PROCESSED' : 'NOT_APPLICABLE',
          refundReference: quote.refundAmount > 0 ? `RFND-${randomBytes(6).toString('hex').toUpperCase()}` : undefined,
          cancelledAt: now,
        },
      ],
      { session },
    );
  } catch (err) {
    if (!session && !isDuplicateKeyError(err)) {
      // No transaction to roll back for us: put the booking back as it was.
      await Booking.updateOne({ _id: booking._id, status: 'CANCELLED' }, { $set: { status: 'CONFIRMED', 'payment.status': 'PAID' }, $unset: { cancelledAt: 1 } });
    }
    if (isDuplicateKeyError(err)) throw conflict('This booking has already been cancelled', 'ALREADY_CANCELLED');
    throw err;
  }

  await SeatAllocation.updateMany({ bookingId: booking._id, status: 'ACTIVE' }, { $set: { status: 'RELEASED', releasedAt: now } }, { session });
  return booking;
}

async function runCancellation(input: ApplyInput) {
  if (!supportsTransactions()) return applyCancellation(input);
  const session = await mongoose.startSession();
  try {
    let result!: Awaited<ReturnType<typeof applyCancellation>>;
    await session.withTransaction(async () => {
      result = await applyCancellation(input, session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export async function cancelBooking(actor: Actor, bookingId: string, reason: string) {
  const { booking, trip } = await loadCancellable(actor, bookingId);
  if (booking.status === 'CANCELLED') throw conflict('This booking has already been cancelled', 'ALREADY_CANCELLED');
  if (booking.status !== 'CONFIRMED') throw conflict('Only confirmed bookings can be cancelled', 'NOT_CANCELLABLE');
  if (trip.status !== 'SCHEDULED') throw unprocessable('This trip is no longer open for cancellation', 'CANCELLATION_NOT_ALLOWED');

  const quote = calculateRefund(booking.fare.total, trip.departureTime);
  if (!quote.allowed) throw unprocessable(quote.reason ?? 'This booking can no longer be cancelled', 'CANCELLATION_NOT_ALLOWED');

  await runCancellation({ bookingId: booking._id, actor, reason, quote });
  await recordAudit(actor, {
    action: 'BOOKING_CANCELLED',
    entityType: 'Booking',
    entityId: booking._id,
    metadata: { pnr: booking.pnr, refundPercent: quote.refundPercent, refundAmount: quote.refundAmount },
  });
  return Cancellation.findOne({ bookingId: booking._id }).lean();
}

/** Operator/admin cancelled the whole trip: every confirmed booking is refunded in full. */
export async function cancelBookingsForTrip(actor: Actor, tripId: string): Promise<number> {
  const trip = await Trip.findById(tripId).lean();
  if (!trip) throw notFound('Trip');
  const bookings = await Booking.find({ tripId, status: 'CONFIRMED' }).select('fare pnr').lean();
  let count = 0;
  for (const b of bookings) {
    const quote: RefundQuote = {
      allowed: true,
      hoursBeforeDeparture: round2(hoursBetween(new Date(), trip.departureTime)),
      refundPercent: 100,
      refundAmount: b.fare.total,
      cancellationFee: 0,
      refundType: 'FULL',
    };
    try {
      await runCancellation({ bookingId: b._id, actor, reason: 'Trip cancelled by the operator', quote });
      count += 1;
    } catch (err) {
      // A passenger cancelling at the same moment is fine — that booking is already handled.
      if (!(err instanceof Error && 'code' in err && (err as { code: string }).code === 'ALREADY_CANCELLED')) throw err;
    }
  }
  return count;
}

export async function listCancellations(actor: Actor, q: z.infer<typeof paginationQuery>) {
  const filter: Record<string, unknown> =
    actor.role === 'ADMIN' ? {} : actor.role === 'OPERATOR' ? { operatorId: actor.operatorId } : { userId: actor.id };
  const [items, total] = await Promise.all([
    Cancellation.find(filter)
      .sort({ cancelledAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate({
        path: 'bookingId',
        select: 'pnr fare.total seatCount contactEmail routeId tripId',
        populate: [
          { path: 'routeId', select: 'sourceCity destinationCity' },
          { path: 'tripId', select: 'departureTime' },
        ],
      })
      .populate('operatorId', 'name')
      .lean(),
    Cancellation.countDocuments(filter),
  ]);
  return { items: items.map((c) => ({ ...c, booking: c.bookingId, bookingId: undefined, operator: c.operatorId, operatorId: undefined })), meta: pageMeta(q.page, q.limit, total) };
}

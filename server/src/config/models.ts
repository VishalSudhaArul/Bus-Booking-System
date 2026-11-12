import type { Model } from 'mongoose';
import { AuditLog } from '../modules/audit/audit.model';
import { RefreshToken } from '../modules/auth/refreshToken.model';
import { Booking, BookingPassenger, SeatAllocation } from '../modules/bookings/booking.model';
import { Bus } from '../modules/buses/bus.model';
import { Cancellation } from '../modules/cancellations/cancellation.model';
import { Operator } from '../modules/operators/operator.model';
import { Route } from '../modules/routes/route.model';
import { Seat } from '../modules/seats/seat.model';
import { Stop } from '../modules/stops/stop.model';
import { Trip, TripStop } from '../modules/trips/trip.model';
import { User } from '../modules/users/user.model';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const allModels: Model<any>[] = [
  User,
  RefreshToken,
  Operator,
  Bus,
  Seat,
  Stop,
  Route,
  Trip,
  TripStop,
  Booking,
  BookingPassenger,
  SeatAllocation,
  Cancellation,
  AuditLog,
];

/**
 * Creates collections and builds every declared index. Run at startup in all
 * environments: seat integrity depends on the unique indexes existing, so the
 * API must not serve traffic before they are in place. Idempotent.
 */
export async function ensureIndexes(): Promise<void> {
  for (const model of allModels) {
    await model.createCollection().catch(() => undefined); // already exists
    await model.createIndexes();
  }
}

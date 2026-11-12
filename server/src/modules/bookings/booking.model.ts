import { Schema, model } from 'mongoose';
import { ALLOCATION_STATUSES, BOOKING_STATUSES, GENDERS, PAYMENT_STATUSES } from '../../types/domain';

const bookingSchema = new Schema(
  {
    pnr: { type: String, required: true, unique: true, uppercase: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    // Snapshots of the trip's operator and route for scoped reporting.
    operatorId: { type: Schema.Types.ObjectId, ref: 'Operator', required: true },
    routeId: { type: Schema.Types.ObjectId, ref: 'Route', required: true },
    boardingStopId: { type: Schema.Types.ObjectId, ref: 'Stop', required: true },
    droppingStopId: { type: Schema.Types.ObjectId, ref: 'Stop', required: true },
    status: { type: String, enum: BOOKING_STATUSES, required: true, default: 'PENDING' },
    seatCount: { type: Number, required: true, min: 1 },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    // Fare is always computed on the server and frozen at booking time.
    fare: {
      type: new Schema(
        {
      baseFare: { type: Number, required: true, min: 0 },
      seatCharges: { type: Number, required: true, min: 0 },
      taxPercent: { type: Number, required: true, min: 0 },
      taxes: { type: Number, required: true, min: 0 },
      total: { type: Number, required: true, min: 0 },
        },
        { _id: false },
      ),
      required: true,
    },
    payment: {
      method: { type: String, default: 'SIMULATED' },
      reference: { type: String, required: true },
      status: { type: String, enum: PAYMENT_STATUSES, default: 'PAID' },
    },
    // Client-generated key; a retry with the same key returns the same booking.
    idempotencyKey: { type: String, required: true },
    // Hash of the request payload, to reject a reused key with different data.
    requestHash: { type: String, required: true },
    cancelledAt: { type: Date },
  },
  { timestamps: true },
);

bookingSchema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
bookingSchema.index({ userId: 1, createdAt: -1 });
bookingSchema.index({ tripId: 1, status: 1 });
bookingSchema.index({ operatorId: 1, createdAt: -1 });
bookingSchema.index({ status: 1, createdAt: -1 });

export const Booking = model('Booking', bookingSchema);

const bookingPassengerSchema = new Schema(
  {
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    seatId: { type: Schema.Types.ObjectId, ref: 'Seat', required: true },
    // Snapshot so the ticket still reads correctly if the bus layout is edited.
    seatNumber: { type: String, required: true },
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    age: { type: Number, required: true, min: 1, max: 120 },
    gender: { type: String, enum: GENDERS, required: true },
    fare: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);

bookingPassengerSchema.index({ bookingId: 1, seatId: 1 }, { unique: true });
bookingPassengerSchema.index({ tripId: 1 });

export const BookingPassenger = model('BookingPassenger', bookingPassengerSchema);

/**
 * The seat-integrity guard. One ACTIVE allocation may exist per (trip, seat):
 * the partial unique index makes MongoDB itself reject a second one, no matter
 * how many requests race. Released rows are kept as history.
 */
const seatAllocationSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    seatId: { type: Schema.Types.ObjectId, ref: 'Seat', required: true },
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true },
    status: { type: String, enum: ALLOCATION_STATUSES, required: true, default: 'ACTIVE' },
    releasedAt: { type: Date },
  },
  { timestamps: true },
);

seatAllocationSchema.index(
  { tripId: 1, seatId: 1 },
  { unique: true, partialFilterExpression: { status: 'ACTIVE' }, name: 'uniq_active_trip_seat' },
);
seatAllocationSchema.index({ bookingId: 1 });
seatAllocationSchema.index({ tripId: 1, status: 1 });

export const SeatAllocation = model('SeatAllocation', seatAllocationSchema);

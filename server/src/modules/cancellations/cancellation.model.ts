import { Schema, model } from 'mongoose';
import { REFUND_STATUSES, ROLES } from '../../types/domain';

const cancellationSchema = new Schema(
  {
    // Unique: a booking can be cancelled exactly once.
    bookingId: { type: Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    operatorId: { type: Schema.Types.ObjectId, ref: 'Operator', required: true, index: true },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    cancelledByRole: { type: String, enum: ROLES, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 300 },
    hoursBeforeDeparture: { type: Number, required: true },
    refundPercent: { type: Number, required: true, min: 0, max: 100 },
    refundAmount: { type: Number, required: true, min: 0 },
    cancellationFee: { type: Number, required: true, min: 0 },
    refundStatus: { type: String, enum: REFUND_STATUSES, required: true },
    refundReference: { type: String },
    status: { type: String, enum: ['COMPLETED'], default: 'COMPLETED', required: true },
    cancelledAt: { type: Date, required: true },
  },
  { timestamps: true },
);

cancellationSchema.index({ cancelledAt: -1 });

export const Cancellation = model('Cancellation', cancellationSchema);

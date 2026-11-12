import { Schema, model } from 'mongoose';
import { STOP_TYPES, TRIP_STATUSES } from '../../types/domain';

const tripSchema = new Schema(
  {
    routeId: { type: Schema.Types.ObjectId, ref: 'Route', required: true },
    busId: { type: Schema.Types.ObjectId, ref: 'Bus', required: true },
    // Copied from the route/bus (which must agree) so operator-scoped queries
    // and authorization checks need no join. Immutable after creation.
    operatorId: { type: Schema.Types.ObjectId, ref: 'Operator', required: true, immutable: true },
    departureTime: { type: Date, required: true },
    arrivalTime: { type: Date, required: true },
    // Per-seat base fare in INR; each seat may add its own priceModifier.
    baseFare: { type: Number, required: true, min: 1 },
    status: { type: String, enum: TRIP_STATUSES, default: 'SCHEDULED', required: true },
  },
  { timestamps: true },
);

tripSchema.index({ routeId: 1, departureTime: 1, status: 1 });
tripSchema.index({ operatorId: 1, departureTime: -1 });
// A bus cannot start two trips at the same instant (overlap is checked in the service).
tripSchema.index({ busId: 1, departureTime: 1 }, { unique: true });

export const Trip = model('Trip', tripSchema);

const tripStopSchema = new Schema(
  {
    tripId: { type: Schema.Types.ObjectId, ref: 'Trip', required: true },
    stopId: { type: Schema.Types.ObjectId, ref: 'Stop', required: true },
    type: { type: String, enum: STOP_TYPES, required: true },
    sequence: { type: Number, required: true, min: 1 },
    scheduledTime: { type: Date, required: true },
  },
  { timestamps: true },
);

tripStopSchema.index({ tripId: 1, sequence: 1 }, { unique: true });

export const TripStop = model('TripStop', tripStopSchema);

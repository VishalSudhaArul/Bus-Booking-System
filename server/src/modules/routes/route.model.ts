import { Schema, model } from 'mongoose';
import { STOP_TYPES } from '../../types/domain';

/**
 * A route is the reusable template (cities + ordered stops with time offsets).
 * Each Trip materialises it into dated TripStop documents.
 */
const routeStopSchema = new Schema(
  {
    stopId: { type: Schema.Types.ObjectId, ref: 'Stop', required: true },
    type: { type: String, enum: STOP_TYPES, required: true },
    sequence: { type: Number, required: true, min: 1 },
    // Minutes after the trip's departure time at which the bus is at this stop.
    offsetMinutes: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const routeSchema = new Schema(
  {
    operatorId: { type: Schema.Types.ObjectId, ref: 'Operator', required: true, index: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 16 },
    sourceCity: { type: String, required: true, trim: true, maxlength: 60 },
    destinationCity: { type: String, required: true, trim: true, maxlength: 60 },
    sourceCityKey: { type: String, required: true, lowercase: true, trim: true },
    destinationCityKey: { type: String, required: true, lowercase: true, trim: true },
    distanceKm: { type: Number, required: true, min: 1 },
    durationMinutes: { type: Number, required: true, min: 10 },
    stops: { type: [routeStopSchema], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Passenger search: "all active routes from A to B".
routeSchema.index({ sourceCityKey: 1, destinationCityKey: 1, isActive: 1 });

export const Route = model('Route', routeSchema);

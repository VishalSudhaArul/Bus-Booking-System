import { Schema, model } from 'mongoose';
import { DECKS, SEAT_POSITIONS, SEAT_TYPES } from '../../types/domain';

const seatSchema = new Schema(
  {
    busId: { type: Schema.Types.ObjectId, ref: 'Bus', required: true },
    seatNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 6 },
    deck: { type: String, enum: DECKS, default: 'LOWER', required: true },
    row: { type: Number, required: true, min: 1 },
    column: { type: Number, required: true, min: 1 },
    seatType: { type: String, enum: SEAT_TYPES, required: true },
    position: { type: String, enum: SEAT_POSITIONS, required: true },
    // Added to the trip's base fare (e.g. sleeper berth or window premium).
    priceModifier: { type: Number, default: 0, min: 0 },
    // Reserved for female passengers; enforced when a booking is created.
    ladiesOnly: { type: Boolean, default: false },
    // false = physically unavailable (damaged, crew seat); never bookable.
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

seatSchema.index({ busId: 1, seatNumber: 1 }, { unique: true });
seatSchema.index({ busId: 1, deck: 1, row: 1, column: 1 }, { unique: true });

export const Seat = model('Seat', seatSchema);

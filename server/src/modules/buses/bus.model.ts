import { Schema, model } from 'mongoose';
import { BUS_TYPES, LAYOUT_TEMPLATES } from '../../types/domain';

const busSchema = new Schema(
  {
    operatorId: { type: Schema.Types.ObjectId, ref: 'Operator', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    registrationNumber: { type: String, required: true, unique: true, uppercase: true, trim: true, maxlength: 16 },
    busType: { type: String, enum: BUS_TYPES, required: true },
    isAC: { type: Boolean, default: true },
    amenities: { type: [String], default: [] },
    // Describes the grid the Seat documents are placed on. Seats themselves
    // live in the Seat collection — the layout here is only render metadata.
    layout: {
      template: { type: String, enum: LAYOUT_TEMPLATES, required: true },
      rows: { type: Number, required: true, min: 1, max: 20 },
      // Seat columns per row; the aisle is drawn after `aisleAfterColumn`.
      columns: { type: Number, required: true, min: 2, max: 6 },
      aisleAfterColumn: { type: Number, required: true, min: 1, max: 5 },
      decks: { type: Number, required: true, min: 1, max: 2 },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

busSchema.index({ operatorId: 1, isActive: 1 });

export const Bus = model('Bus', busSchema);

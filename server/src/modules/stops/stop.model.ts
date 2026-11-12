import { Schema, model } from 'mongoose';

const stopSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    city: { type: String, required: true, trim: true, maxlength: 60 },
    // Lower-cased city used for case-insensitive lookups through an index.
    cityKey: { type: String, required: true, lowercase: true, trim: true },
    address: { type: String, trim: true, maxlength: 200 },
    landmark: { type: String, trim: true, maxlength: 120 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

stopSchema.index({ cityKey: 1, name: 1 }, { unique: true });

export const Stop = model('Stop', stopSchema);

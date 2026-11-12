import { Schema, model } from 'mongoose';

const operatorSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, match: /^[A-Z0-9]{2,8}$/ },
    contactEmail: { type: String, required: true, lowercase: true, trim: true },
    contactPhone: { type: String, required: true, trim: true },
    description: { type: String, trim: true, maxlength: 400 },
    rating: { type: Number, min: 0, max: 5, default: 4 },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

operatorSchema.index({ name: 1 });

export const Operator = model('Operator', operatorSchema);

import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';
import { ROLES } from '../../types/domain';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 15 },
    // Never selected by default, so it cannot leak through a forgotten projection.
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'PASSENGER', required: true, index: true },
    // Only set for OPERATOR accounts: the operator whose data they may access.
    operatorId: { type: Schema.Types.ObjectId, ref: 'Operator', index: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true },
);

export type IUser = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<IUser>;
export const User = model('User', userSchema);

export function toPublicUser(u: UserDoc | (IUser & { _id: unknown })) {
  return {
    _id: String(u._id),
    name: u.name,
    email: u.email,
    phone: u.phone ?? null,
    role: u.role,
    operatorId: u.operatorId ? String(u.operatorId) : null,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt ?? null,
    createdAt: u.createdAt,
  };
}

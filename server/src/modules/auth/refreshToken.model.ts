import { Schema, model } from 'mongoose';

/**
 * Refresh tokens are opaque random strings. Only an HMAC of the token is
 * stored, so a database leak does not expose usable sessions.
 */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    // All tokens descended from one login share a family; reuse of a rotated
    // token revokes the whole family.
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    userAgent: { type: String, maxlength: 256 },
  },
  { timestamps: true },
);

// TTL index: MongoDB removes expired sessions on its own.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = model('RefreshToken', refreshTokenSchema);

import bcrypt from 'bcryptjs';
import { createHmac, randomBytes, randomUUID } from 'crypto';
import { env } from '../../config/env';
import { signAccessToken } from '../../middleware/auth';
import { badRequest, conflict, isDuplicateKeyError, notFound, unauthorized } from '../../utils/errors';
import { recordAudit } from '../audit/audit.service';
import { User, toPublicUser, type UserDoc } from '../users/user.model';
import { RefreshToken } from './refreshToken.model';
import type { LoginInput, RegisterInput } from './auth.validation';

const DAY_MS = 24 * 60 * 60 * 1000;
// Two tabs (or React strict mode) can refresh at the same moment; a token
// rotated this recently is treated as a benign race, not as theft.
const ROTATION_GRACE_MS = 15_000;
// Compared against when the email is unknown, so timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('unused-placeholder-password', 4);

export const hashPassword = (plain: string) => bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);

const hashToken = (raw: string) => createHmac('sha256', env.JWT_REFRESH_SECRET).update(raw).digest('hex');

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface AuthResult {
  user: ReturnType<typeof toPublicUser>;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

async function issueSession(user: UserDoc, meta: SessionMeta, family: string = randomUUID()): Promise<AuthResult> {
  const refreshToken = randomBytes(48).toString('base64url');
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * DAY_MS);
  await RefreshToken.create({
    userId: user._id,
    tokenHash: hashToken(refreshToken),
    family,
    expiresAt: refreshExpiresAt,
    userAgent: meta.userAgent?.slice(0, 256),
  });
  const accessToken = signAccessToken({
    sub: String(user._id),
    role: user.role,
    operatorId: user.operatorId ? String(user.operatorId) : undefined,
  });
  return { user: toPublicUser(user), accessToken, refreshToken, refreshExpiresAt };
}

export async function register(input: RegisterInput, meta: SessionMeta): Promise<AuthResult> {
  if (await User.exists({ email: input.email })) {
    throw conflict('An account with this email already exists', 'EMAIL_EXISTS');
  }
  let user: UserDoc;
  try {
    user = await User.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await hashPassword(input.password),
      role: 'PASSENGER',
    });
  } catch (err) {
    // Two simultaneous registrations: the unique index is the real guard.
    if (isDuplicateKeyError(err)) throw conflict('An account with this email already exists', 'EMAIL_EXISTS');
    throw err;
  }
  await recordAudit({ id: String(user._id), role: 'PASSENGER', ip: meta.ip }, { action: 'USER_REGISTERED', entityType: 'User', entityId: user._id });
  return issueSession(user, meta);
}

export async function login(input: LoginInput, meta: SessionMeta): Promise<AuthResult> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  const matches = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !matches) throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  if (!user.isActive) throw unauthorized('This account has been deactivated', 'ACCOUNT_DISABLED');

  user.lastLoginAt = new Date();
  await user.save();
  await recordAudit({ id: String(user._id), role: user.role, ip: meta.ip }, { action: 'USER_LOGIN', entityType: 'User', entityId: user._id });
  return issueSession(user, meta);
}

/** Rotates a refresh token: the old one is revoked and a new one is issued. */
export async function refreshSession(rawToken: string | undefined, meta: SessionMeta): Promise<AuthResult> {
  if (!rawToken) throw unauthorized('Session expired. Please sign in again.', 'REFRESH_MISSING');
  const tokenHash = hashToken(rawToken);
  const now = new Date();

  // Atomic claim — only one request can rotate a given token.
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
  );

  if (!claimed) {
    const existing = await RefreshToken.findOne({ tokenHash });
    if (existing?.revokedAt && now.getTime() - existing.revokedAt.getTime() > ROTATION_GRACE_MS) {
      // A rotated token came back long after rotation: assume it was stolen
      // and end every session descended from that login.
      await RefreshToken.updateMany({ family: existing.family, revokedAt: null }, { $set: { revokedAt: now } });
      await recordAudit({ id: String(existing.userId), ip: meta.ip }, { action: 'REFRESH_TOKEN_REUSE_DETECTED', entityType: 'User', entityId: existing.userId });
    }
    throw unauthorized('Session expired. Please sign in again.', 'REFRESH_INVALID');
  }

  const user = await User.findById(claimed.userId);
  if (!user || !user.isActive) throw unauthorized('Session expired. Please sign in again.', 'REFRESH_INVALID');
  return issueSession(user, meta, claimed.family);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  await RefreshToken.updateOne({ tokenHash: hashToken(rawToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function getProfile(userId: string) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) throw unauthorized('Account not found or deactivated', 'ACCOUNT_DISABLED');
  return toPublicUser(user);
}

export async function updateProfile(userId: string, input: { name?: string; phone?: string }) {
  const user = await User.findByIdAndUpdate(userId, { $set: input }, { new: true, runValidators: true });
  if (!user) throw notFound('User');
  return toPublicUser(user);
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw notFound('User');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw badRequest('Current password is incorrect', 'INVALID_PASSWORD');
  }
  if (currentPassword === newPassword) throw badRequest('New password must differ from the current password');
  user.passwordHash = await hashPassword(newPassword);
  await user.save();
  // Changing the password signs out every other device.
  await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  await recordAudit({ id: userId, role: user.role }, { action: 'PASSWORD_CHANGED', entityType: 'User', entityId: userId });
}

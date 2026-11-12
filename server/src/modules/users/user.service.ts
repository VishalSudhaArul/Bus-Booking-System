import { z } from 'zod';
import { ROLES, type Actor } from '../../types/domain';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { containsRegex, objectId, pageMeta, searchQuery } from '../../utils/http';
import { recordAudit } from '../audit/audit.service';
import { hashPassword } from '../auth/auth.service';
import { emailSchema, nameSchema, passwordSchema, phoneSchema } from '../auth/auth.validation';
import { RefreshToken } from '../auth/refreshToken.model';
import { Operator } from '../operators/operator.model';
import { User, toPublicUser } from './user.model';

export const listUsersQuery = searchQuery.extend({
  role: z.enum(ROLES).optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

const base = {
  name: nameSchema,
  phone: phoneSchema.optional(),
  role: z.enum(ROLES),
  operatorId: objectId.nullable().optional(),
  isActive: z.boolean().optional(),
};

export const createUserSchema = z.object({ ...base, email: emailSchema, password: passwordSchema });
export const updateUserSchema = z.object(base).partial();

async function resolveOperatorLink(role: string, operatorId?: string | null) {
  if (role !== 'OPERATOR') return undefined;
  if (!operatorId) throw badRequest('An operator account must be linked to an operator', 'OPERATOR_REQUIRED');
  if (!(await Operator.exists({ _id: operatorId }))) throw badRequest('Linked operator does not exist', 'OPERATOR_NOT_FOUND');
  return operatorId;
}

export async function listUsers(q: z.infer<typeof listUsersQuery>) {
  const filter: Record<string, unknown> = {};
  if (q.role) filter.role = q.role;
  if (q.isActive) filter.isActive = q.isActive === 'true';
  if (q.search) filter.$or = [{ name: containsRegex(q.search) }, { email: containsRegex(q.search) }];
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('operatorId', 'name code'),
    User.countDocuments(filter),
  ]);
  const items = users.map((u) => {
    const operator = u.operatorId as unknown as { _id: unknown; name: string; code: string } | null;
    return {
      ...toPublicUser(u),
      operatorId: operator ? String(operator._id) : null,
      operator: operator ? { _id: String(operator._id), name: operator.name, code: operator.code } : null,
    };
  });
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

export async function createUser(actor: Actor, input: z.infer<typeof createUserSchema>) {
  if (await User.exists({ email: input.email })) throw conflict('An account with this email already exists', 'EMAIL_EXISTS');
  const operatorId = await resolveOperatorLink(input.role, input.operatorId);
  const user = await User.create({
    name: input.name,
    email: input.email,
    phone: input.phone,
    role: input.role,
    operatorId,
    isActive: input.isActive ?? true,
    passwordHash: await hashPassword(input.password),
  });
  await recordAudit(actor, { action: 'USER_CREATED', entityType: 'User', entityId: user._id, metadata: { role: user.role } });
  return toPublicUser(user);
}

export async function updateUser(actor: Actor, id: string, input: z.infer<typeof updateUserSchema>) {
  const user = await User.findById(id);
  if (!user) throw notFound('User');

  if (id === actor.id && (input.isActive === false || (input.role && input.role !== 'ADMIN'))) {
    throw badRequest('You cannot deactivate or demote your own account', 'SELF_LOCKOUT');
  }

  const nextRole = input.role ?? user.role;
  if (input.role !== undefined || input.operatorId !== undefined) {
    const link = input.operatorId === undefined ? (user.operatorId ? String(user.operatorId) : null) : input.operatorId;
    const resolved = await resolveOperatorLink(nextRole, link);
    user.set('operatorId', resolved ?? undefined);
    user.role = nextRole;
  }
  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;
  if (input.isActive !== undefined) user.isActive = input.isActive;
  await user.save();

  // Role or status changes must take effect now, not when the old session expires.
  if (input.isActive === false || input.role !== undefined || input.operatorId !== undefined) {
    await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }
  await recordAudit(actor, { action: 'USER_UPDATED', entityType: 'User', entityId: user._id, metadata: { fields: Object.keys(input) } });
  return toPublicUser(user);
}

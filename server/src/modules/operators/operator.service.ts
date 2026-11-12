import { z } from 'zod';
import type { Actor } from '../../types/domain';
import { notFound } from '../../utils/errors';
import { containsRegex, pageMeta, searchQuery } from '../../utils/http';
import { recordAudit } from '../audit/audit.service';
import { emailSchema } from '../auth/auth.validation';
import { Bus } from '../buses/bus.model';
import { Operator } from './operator.model';

export const listOperatorsQuery = searchQuery.extend({ isActive: z.enum(['true', 'false']).optional() });

export const createOperatorSchema = z.object({
  name: z.string().trim().min(2).max(80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/, 'Code must be 2-8 letters or digits'),
  contactEmail: emailSchema,
  contactPhone: z.string().trim().regex(/^[0-9+\- ]{7,15}$/, 'Enter a valid phone number'),
  description: z.string().trim().max(400).optional(),
  rating: z.number().min(0).max(5).optional(),
  isActive: z.boolean().optional(),
});
export const updateOperatorSchema = createOperatorSchema.partial();

export async function listOperators(q: z.infer<typeof listOperatorsQuery>, publicOnly: boolean) {
  const filter: Record<string, unknown> = {};
  if (publicOnly) filter.isActive = true;
  else if (q.isActive) filter.isActive = q.isActive === 'true';
  if (q.search) filter.$or = [{ name: containsRegex(q.search) }, { code: containsRegex(q.search) }];

  const [operators, total] = await Promise.all([
    Operator.find(filter)
      .select(publicOnly ? 'name code description rating' : '-__v')
      .sort({ name: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Operator.countDocuments(filter),
  ]);

  const counts = await Bus.aggregate<{ _id: unknown; count: number }>([
    { $match: { operatorId: { $in: operators.map((o) => o._id) }, isActive: true } },
    { $group: { _id: '$operatorId', count: { $sum: 1 } } },
  ]);
  const byOperator = new Map(counts.map((c) => [String(c._id), c.count]));
  const items = operators.map((o) => ({ ...o, busCount: byOperator.get(String(o._id)) ?? 0 }));
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

export async function createOperator(actor: Actor, input: z.infer<typeof createOperatorSchema>) {
  const operator = await Operator.create(input);
  await recordAudit(actor, { action: 'OPERATOR_CREATED', entityType: 'Operator', entityId: operator._id, metadata: { code: operator.code } });
  return operator.toObject();
}

export async function updateOperator(actor: Actor, id: string, input: z.infer<typeof updateOperatorSchema>) {
  const operator = await Operator.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true }).lean();
  if (!operator) throw notFound('Operator');
  await recordAudit(actor, { action: 'OPERATOR_UPDATED', entityType: 'Operator', entityId: id, metadata: { fields: Object.keys(input) } });
  return operator;
}

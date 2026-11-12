import { z } from 'zod';
import type { Actor } from '../../types/domain';
import { notFound } from '../../utils/errors';
import { containsRegex, pageMeta, searchQuery } from '../../utils/http';
import { recordAudit } from '../audit/audit.service';
import { Stop } from './stop.model';

export const listStopsQuery = searchQuery.extend({
  city: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(10),
});

export const createStopSchema = z.object({
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(60),
  address: z.string().trim().max(200).optional(),
  landmark: z.string().trim().max(120).optional(),
  isActive: z.boolean().optional(),
});
export const updateStopSchema = createStopSchema.partial();

export async function listStops(q: z.infer<typeof listStopsQuery>) {
  const filter: Record<string, unknown> = {};
  if (q.city) filter.cityKey = q.city.toLowerCase();
  if (q.search) filter.$or = [{ name: containsRegex(q.search) }, { city: containsRegex(q.search) }];
  const [items, total] = await Promise.all([
    Stop.find(filter)
      .sort({ city: 1, name: 1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .lean(),
    Stop.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

/** Distinct cities that have at least one active stop (search autocomplete). */
export async function listCities(): Promise<string[]> {
  const cities: string[] = await Stop.distinct('city', { isActive: true });
  return cities.sort((a, b) => a.localeCompare(b));
}

export async function createStop(actor: Actor, input: z.infer<typeof createStopSchema>) {
  const stop = await Stop.create({ ...input, cityKey: input.city.toLowerCase() });
  await recordAudit(actor, { action: 'STOP_CREATED', entityType: 'Stop', entityId: stop._id });
  return stop.toObject();
}

export async function updateStop(actor: Actor, id: string, input: z.infer<typeof updateStopSchema>) {
  const update: Record<string, unknown> = { ...input };
  if (input.city) update.cityKey = input.city.toLowerCase();
  const stop = await Stop.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true }).lean();
  if (!stop) throw notFound('Stop');
  await recordAudit(actor, { action: 'STOP_UPDATED', entityType: 'Stop', entityId: id });
  return stop;
}

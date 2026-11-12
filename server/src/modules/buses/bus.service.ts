import { z } from 'zod';
import { assertOperatorAccess, operatorScope } from '../../middleware/auth';
import { LAYOUT_TEMPLATES, type Actor } from '../../types/domain';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { containsRegex, objectId, pageMeta, searchQuery } from '../../utils/http';
import { recordAudit } from '../audit/audit.service';
import { SeatAllocation } from '../bookings/booking.model';
import { Operator } from '../operators/operator.model';
import { Seat } from '../seats/seat.model';
import { LAYOUT_SPECS, generateSeats, layoutMeta } from '../seats/seat.service';
import { Trip } from '../trips/trip.model';
import { Bus } from './bus.model';

export const listBusesQuery = searchQuery.extend({
  operatorId: objectId.optional(),
  isActive: z.enum(['true', 'false']).optional(),
});

export const createBusSchema = z.object({
  operatorId: objectId,
  name: z.string().trim().min(2).max(80),
  registrationNumber: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9 -]{5,16}$/, 'Enter a valid registration number'),
  isAC: z.boolean().default(true),
  amenities: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  layout: z.object({
    template: z.enum(LAYOUT_TEMPLATES),
    rows: z.number().int().min(2).max(15),
    windowPremium: z.number().min(0).max(1000).default(0),
    lowerDeckPremium: z.number().min(0).max(1000).default(0),
  }),
});

export const updateBusSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  isAC: z.boolean().optional(),
  amenities: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
  isActive: z.boolean().optional(),
});

export const updateSeatSchema = z
  .object({ isActive: z.boolean().optional(), priceModifier: z.number().min(0).max(2000).optional() })
  .refine((v) => v.isActive !== undefined || v.priceModifier !== undefined, 'Provide a field to update');

export const seatParams = z.object({ id: objectId, seatId: objectId });

export async function listBuses(actor: Actor, q: z.infer<typeof listBusesQuery>) {
  const filter: Record<string, unknown> = { ...operatorScope(actor) };
  if (actor.role === 'ADMIN' && q.operatorId) filter.operatorId = q.operatorId;
  if (q.isActive) filter.isActive = q.isActive === 'true';
  if (q.search) filter.$or = [{ name: containsRegex(q.search) }, { registrationNumber: containsRegex(q.search) }];

  const [buses, total] = await Promise.all([
    Bus.find(filter)
      .sort({ createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit)
      .populate('operatorId', 'name code')
      .lean(),
    Bus.countDocuments(filter),
  ]);
  const counts = await Seat.aggregate<{ _id: unknown; total: number; active: number }>([
    { $match: { busId: { $in: buses.map((b) => b._id) } } },
    { $group: { _id: '$busId', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
  ]);
  const byBus = new Map(counts.map((c) => [String(c._id), c]));
  const items = buses.map((b) => ({
    ...b,
    totalSeats: byBus.get(String(b._id))?.total ?? 0,
    activeSeats: byBus.get(String(b._id))?.active ?? 0,
  }));
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

export async function getBus(actor: Actor, id: string) {
  const bus = await Bus.findById(id).populate('operatorId', 'name code').lean();
  if (!bus) throw notFound('Bus');
  assertOperatorAccess(actor, (bus.operatorId as unknown as { _id: unknown })._id);
  const seats = await Seat.find({ busId: id }).sort({ deck: 1, row: 1, column: 1 }).lean();
  return { ...bus, seats };
}

export async function createBus(actor: Actor, input: z.infer<typeof createBusSchema>) {
  if (!(await Operator.exists({ _id: input.operatorId, isActive: true }))) {
    throw badRequest('Operator does not exist or is inactive', 'OPERATOR_NOT_FOUND');
  }
  const spec = LAYOUT_SPECS[input.layout.template];
  const bus = await Bus.create({
    operatorId: input.operatorId,
    name: input.name,
    registrationNumber: input.registrationNumber,
    busType: spec.seatType,
    isAC: input.isAC,
    amenities: input.amenities,
    layout: layoutMeta(input.layout),
  });
  try {
    await Seat.insertMany(generateSeats(input.layout).map((s) => ({ ...s, busId: bus._id })));
  } catch (err) {
    // A bus without its seats is useless — undo the bus rather than leave it half-built.
    await Seat.deleteMany({ busId: bus._id });
    await Bus.deleteOne({ _id: bus._id });
    throw err;
  }
  await recordAudit(actor, {
    action: 'BUS_CREATED',
    entityType: 'Bus',
    entityId: bus._id,
    metadata: { registrationNumber: bus.registrationNumber, template: input.layout.template },
  });
  return getBus(actor, String(bus._id));
}

export async function updateBus(actor: Actor, id: string, input: z.infer<typeof updateBusSchema>) {
  const bus = await Bus.findByIdAndUpdate(id, { $set: input }, { new: true, runValidators: true }).lean();
  if (!bus) throw notFound('Bus');
  await recordAudit(actor, { action: 'BUS_UPDATED', entityType: 'Bus', entityId: id, metadata: { fields: Object.keys(input) } });
  return bus;
}

/** Edit one seat of the layout: mark it (un)available or change its fare modifier. */
export async function updateSeat(actor: Actor, busId: string, seatId: string, input: z.infer<typeof updateSeatSchema>) {
  const seat = await Seat.findOne({ _id: seatId, busId });
  if (!seat) throw notFound('Seat');

  if (input.isActive === false && seat.isActive) {
    // Do not pull a seat that a passenger already holds on an upcoming trip.
    const upcoming = await Trip.find({ busId, status: 'SCHEDULED', departureTime: { $gt: new Date() } }).distinct('_id');
    const held = await SeatAllocation.exists({ seatId, tripId: { $in: upcoming }, status: 'ACTIVE' });
    if (held) throw conflict('This seat is booked on an upcoming trip and cannot be disabled', 'SEAT_IN_USE');
  }
  if (input.isActive !== undefined) seat.isActive = input.isActive;
  if (input.priceModifier !== undefined) seat.priceModifier = input.priceModifier;
  await seat.save();
  await recordAudit(actor, { action: 'SEAT_UPDATED', entityType: 'Seat', entityId: seatId, metadata: { busId, ...input } });
  return seat.toObject();
}

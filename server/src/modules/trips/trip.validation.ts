import { z } from 'zod';
import { BUS_TYPES, TRIP_STATUSES } from '../../types/domain';
import { objectId, paginationQuery } from '../../utils/http';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

const csv = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean) : []))
    .pipe(z.array(z.enum(values)));

export const searchTripsQuery = paginationQuery
  .extend({
    from: z.string().trim().min(2, 'Enter a source city').max(60),
    to: z.string().trim().min(2, 'Enter a destination city').max(60),
    date: dateOnly,
    passengers: z.coerce.number().int().min(1).max(6).default(1),
    sort: z.enum(['departure', 'arrival', 'price', 'seats', 'duration', 'rating']).default('departure'),
    order: z.enum(['asc', 'desc']).default('asc'),
    busType: csv(BUS_TYPES),
    ac: z.enum(['true', 'false']).optional(),
    departureSlot: csv(['EARLY', 'MORNING', 'AFTERNOON', 'NIGHT']),
    maxPrice: z.coerce.number().positive().optional(),
  })
  .refine((v) => v.from.toLowerCase() !== v.to.toLowerCase(), {
    message: 'Source and destination must be different',
    path: ['to'],
  });

export const listTripsQuery = paginationQuery.extend({
  status: z.enum(TRIP_STATUSES).optional(),
  routeId: objectId.optional(),
  busId: objectId.optional(),
  operatorId: objectId.optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export const createTripSchema = z.object({
  routeId: objectId,
  busId: objectId,
  departureTime: z.string().datetime({ offset: true, message: 'departureTime must be an ISO date-time' }),
  baseFare: z.number().min(1).max(20000),
  // Create the same departure on consecutive days (schedule builder).
  repeatDays: z.number().int().min(1).max(30).default(1),
});

export const updateTripSchema = z
  .object({
    baseFare: z.number().min(1).max(20000).optional(),
    departureTime: z.string().datetime({ offset: true }).optional(),
    status: z.enum(TRIP_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Provide a field to update');

export type SearchTripsQuery = z.infer<typeof searchTripsQuery>;
export type ListTripsQuery = z.infer<typeof listTripsQuery>;
export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;

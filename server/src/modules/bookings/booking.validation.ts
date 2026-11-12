import { z } from 'zod';
import { env } from '../../config/env';
import { BOOKING_STATUSES, GENDERS } from '../../types/domain';
import { objectId, paginationQuery } from '../../utils/http';
import { emailSchema, nameSchema, phoneSchema } from '../auth/auth.validation';

export const passengerSchema = z.object({
  seatId: objectId,
  name: nameSchema,
  age: z.number({ invalid_type_error: 'Age must be a number' }).int('Age must be a whole number').min(1, 'Age must be at least 1').max(120, 'Enter a valid age'),
  gender: z.enum(GENDERS, { message: 'Select a gender' }),
});

// Deliberately no fare, status, PNR or price fields: the server computes all of them.
export const createBookingSchema = z
  .object({
    tripId: objectId,
    boardingStopId: objectId,
    droppingStopId: objectId,
    contact: z.object({ email: emailSchema, phone: phoneSchema }),
    passengers: z
      .array(passengerSchema)
      .min(1, 'Select at least one seat')
      .max(env.BOOKING_MAX_SEATS, `You can book at most ${env.BOOKING_MAX_SEATS} seats at a time`),
  })
  .superRefine((v, ctx) => {
    const ids = v.passengers.map((p) => p.seatId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['passengers'], message: 'Each passenger must have a different seat' });
    }
  });

export const idempotencyKeySchema = z
  .string({ required_error: 'Idempotency-Key header is required' })
  .trim()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Idempotency-Key must be 8-64 URL-safe characters');

export const myBookingsQuery = paginationQuery.extend({
  status: z.enum(BOOKING_STATUSES).optional(),
  when: z.enum(['upcoming', 'past']).optional(),
});

export const listBookingsQuery = paginationQuery.extend({
  status: z.enum(BOOKING_STATUSES).optional(),
  search: z.string().trim().max(80).optional(),
  tripId: objectId.optional(),
  operatorId: objectId.optional(),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().min(3, 'Please tell us why you are cancelling').max(300),
});

export const pnrParams = z.object({ pnr: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,14}$/, 'Invalid PNR') });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

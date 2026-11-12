import { z } from 'zod';

export const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address').max(120);

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/\d/, 'Password must include a number');

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number');

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(80)
  .regex(/^[\p{L}][\p{L} .'-]*$/u, 'Name may only contain letters, spaces and . \' -');

// `role` is deliberately absent: public registration always creates a PASSENGER.
export const registerSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(72),
});

export const updateProfileSchema = z
  .object({ name: nameSchema.optional(), phone: phoneSchema.optional() })
  .refine((v) => v.name !== undefined || v.phone !== undefined, 'Provide at least one field to update');

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: passwordSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

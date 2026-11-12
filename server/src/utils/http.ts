import type { Request, Response } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function sendOk<T>(res: Response, data: T, meta?: PageMeta | Record<string, unknown>, status = 200) {
  return res.status(status).json({ success: true, data, ...(meta ? { meta } : {}) });
}

export function sendCreated<T>(res: Response, data: T) {
  return sendOk(res, data, undefined, 201);
}

export const objectId = z
  .string()
  .trim()
  .refine((v) => Types.ObjectId.isValid(v) && /^[a-f\d]{24}$/i.test(v), 'must be a valid id');

export const idParams = z.object({ id: objectId });

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const searchQuery = paginationQuery.extend({
  search: z.string().trim().max(80).optional(),
});

export function pageMeta(page: number, limit: number, total: number): PageMeta {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" regex built from user input, safely escaped. */
export function containsRegex(input: string): RegExp {
  return new RegExp(escapeRegex(input), 'i');
}

/** Typed access to data already parsed by the `validate` middleware. */
export const query = <T>(req: Request) => req.query as unknown as T;
export const params = <T>(req: Request) => req.params as unknown as T;

export const toId = (id: string | Types.ObjectId) => new Types.ObjectId(String(id));

import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { AppError, isDuplicateKeyError } from '../utils/errors';
import { logger } from '../utils/logger';

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.originalUrl.split('?')[0]} not found` },
  });
}

 
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const fail = (status: number, code: string, message: string, details?: unknown) =>
    res.status(status).json({ success: false, error: { code, message, ...(details !== undefined ? { details } : {}) } });

  if (err instanceof AppError) return fail(err.status, err.code, err.message, err.details);

  if (err instanceof ZodError) {
    return fail(
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  }

  if (err instanceof mongoose.Error.ValidationError) {
    return fail(
      400,
      'VALIDATION_ERROR',
      'Request validation failed',
      Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    );
  }

  if (err instanceof mongoose.Error.CastError) return fail(400, 'INVALID_ID', `Invalid value for ${err.path}`);

  if (isDuplicateKeyError(err)) {
    const fields = Object.keys((err as { keyPattern?: Record<string, unknown> }).keyPattern ?? {});
    return fail(409, 'DUPLICATE', `A record with the same ${fields.join(', ') || 'unique value'} already exists`, { fields });
  }

  const e = err as { type?: string; status?: number; message?: string };
  if (e?.type === 'entity.parse.failed') return fail(400, 'INVALID_JSON', 'Request body is not valid JSON');
  if (e?.type === 'entity.too.large') return fail(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');

  logger.error('Unhandled error', {
    id: req.requestId,
    path: req.originalUrl.split('?')[0],
    reason: e?.message,
    stack: err instanceof Error ? err.stack : undefined,
  });
  return fail(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
}

import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/** Recursively drops keys that could be interpreted as MongoDB operators. */
export function stripMongoOperators<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach((v) => stripMongoOperators(v));
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('.')) delete obj[key];
      else stripMongoOperators(obj[key]);
    }
  }
  return value;
}

/**
 * NoSQL-injection guard. Bodies and params are scrubbed in place; query strings
 * are parsed by Express 5's "simple" parser (flat strings only) and then
 * type-checked by Zod, so operator objects cannot be smuggled through them.
 */
export function mongoSanitize(req: Request, _res: Response, next: NextFunction) {
  if (req.body) stripMongoOperators(req.body);
  if (req.params) stripMongoOperators(req.params);
  next();
}

/** Logs method, path, status and latency. Never logs bodies, headers or query strings. */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    logger.info('request', {
      id: req.requestId,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Math.round(ms),
      user: req.user?.id,
    });
  });
  next();
}

const limiter = (max: number, windowMs: number, message: string) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (_req, res) => {
      res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message } });
    },
  });

export const apiLimiter = limiter(env.RATE_LIMIT_MAX, env.RATE_LIMIT_WINDOW_MS, 'Too many requests. Please slow down.');
export const authLimiter = limiter(
  env.AUTH_RATE_LIMIT_MAX,
  env.RATE_LIMIT_WINDOW_MS,
  'Too many authentication attempts. Please try again later.',
);
export const bookingLimiter = limiter(30, 60_000, 'Too many booking attempts. Please wait a moment.');

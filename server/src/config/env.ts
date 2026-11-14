import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const bool = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : ['true', '1', 'yes'].includes(v.toLowerCase())));

const tierSchema = z.object({
  minHours: z.number().min(0),
  refundPercent: z.number().min(0).max(100),
});

const DEFAULT_TIERS = [
  { minHours: 48, refundPercent: 100 },
  { minHours: 24, refundPercent: 75 },
  { minHours: 12, refundPercent: 50 },
  { minHours: 0, refundPercent: 0 },
];

const tiers = z
  .string()
  .optional()
  .transform((v, ctx) => {
    if (!v) return DEFAULT_TIERS;
    try {
      const parsed = z.array(tierSchema).min(1).parse(JSON.parse(v));
      return [...parsed].sort((a, b) => b.minHours - a.minHours);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'must be a JSON array of {minHours, refundPercent}' });
      return z.NEVER;
    }
  });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().default(''),
  // Database to use; applied even when the URI has no /database path.
  MONGODB_DB_NAME: z.string().regex(/^[A-Za-z0-9_-]{1,38}$/, 'letters, digits, _ or - only').default('busnest'),
  MONGODB_TRANSACTIONS: z.enum(['auto', 'on', 'off']).default('auto'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'must be at least 32 characters'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().positive().default(7),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default(''),
  COOKIE_SECURE: bool(false),
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(600),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  BOOKING_MAX_SEATS: z.coerce.number().int().min(1).max(10).default(6),
  GST_PERCENT: z.coerce.number().min(0).max(28).default(5),
  CANCELLATION_CUTOFF_HOURS: z.coerce.number().min(0).default(2),
  CANCELLATION_TIERS: tiers,
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  // Report variable names and reasons only — never the values.
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
  console.error(
    ['Invalid environment configuration (server/.env):', ...lines, 'See server/.env.example for the expected variables.'].join('\n'),
  );
  process.exit(1);
}

const data = parsed.data;

if (data.JWT_SECRET === data.JWT_REFRESH_SECRET) {
  console.error('Invalid environment configuration: JWT_SECRET and JWT_REFRESH_SECRET must differ.');
  process.exit(1);
}

export const env = {
  ...data,
  isProduction: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test',
  corsOrigins: [data.CLIENT_URL, ...data.CORS_ORIGINS.split(',')]
    .map((o) => o.trim().replace(/\/$/, ''))
    .filter(Boolean),
};

export type Env = typeof env;

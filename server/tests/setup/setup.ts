import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import { afterAll, beforeAll } from 'vitest';

// Must be set before any application module (and therefore config/env) loads.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-access-secret-0123456789-abcdefghijklmnop';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789-abcdefghijklmno';
process.env.BCRYPT_SALT_ROUNDS = '4';
process.env.MONGODB_TRANSACTIONS = 'auto';
process.env.CANCELLATION_CUTOFF_HOURS = '2';
process.env.CANCELLATION_TIERS = JSON.stringify([
  { minHours: 48, refundPercent: 100 },
  { minHours: 24, refundPercent: 75 },
  { minHours: 12, refundPercent: 50 },
  { minHours: 0, refundPercent: 0 },
]);
process.env.GST_PERCENT = '5';
process.env.BOOKING_MAX_SEATS = '6';

beforeAll(async () => {
  const { connectDatabase } = await import('../../src/config/db');
  const { ensureIndexes } = await import('../../src/config/models');
  // Each test file gets its own database, so files cannot affect one another.
  await connectDatabase({ uri: process.env.MONGO_TEST_URI, dbName: `test_${randomUUID().slice(0, 8)}`, maxAttempts: 1 });
  await ensureIndexes();
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});

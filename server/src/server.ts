import type { Server } from 'http';
import { createApp } from './app';
import { connectDatabase, disconnectDatabase, supportsTransactions } from './config/db';
import { env } from './config/env';
import { ensureIndexes } from './config/models';
import { reconcileBookings } from './modules/bookings/booking.service';
import { logger } from './utils/logger';

const RECONCILE_INTERVAL_MS = 5 * 60_000;

async function main() {
  try {
    await connectDatabase();
    await ensureIndexes();
    await reconcileBookings();
  } catch (err) {
    logger.error('Startup failed', { reason: (err as Error).message });
    process.exit(1);
  }

  const app = createApp();
  const server: Server = app.listen(env.PORT, () => {
    logger.info(`BusNest API listening on port ${env.PORT}`, { env: env.NODE_ENV, docs: '/api/docs' });
  });

  // Only needed for the non-transactional strategy, but harmless otherwise.
  const timer = setInterval(() => {
    reconcileBookings().catch((err) => logger.error('Reconciliation failed', { reason: (err as Error).message }));
  }, RECONCILE_INTERVAL_MS);
  timer.unref();

  if (!supportsTransactions()) {
    logger.warn('Transactions unavailable on this MongoDB deployment — using atomic allocation with compensation');
  }

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    clearInterval(timer);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error('Unhandled rejection', { reason: String(reason) }));
}

void main();

import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

mongoose.set('strictQuery', true);

let transactionsSupported = false;
let listenersAttached = false;

/** Whether multi-document transactions may be used on the connected deployment. */
export function supportsTransactions(): boolean {
  return transactionsSupported;
}

/** Test hook / explicit override. */
export function setTransactionSupport(value: boolean): void {
  transactionsSupported = value;
}

/**
 * Transactions need a replica set or a sharded cluster. We verify the topology
 * instead of assuming it (Atlas clusters are replica sets; a local standalone
 * mongod is not).
 */
export async function detectTransactionSupport(): Promise<boolean> {
  if (env.MONGODB_TRANSACTIONS === 'on') return true;
  if (env.MONGODB_TRANSACTIONS === 'off') return false;
  try {
    const db = mongoose.connection.db;
    if (!db) return false;
    const hello = await db.admin().command({ hello: 1 });
    return Boolean(hello.setName) || hello.msg === 'isdbgrid';
  } catch (err) {
    logger.warn('Could not detect transaction support; falling back to compensation strategy', {
      reason: (err as Error).message,
    });
    return false;
  }
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  const conn = mongoose.connection;
  conn.on('disconnected', () => logger.warn('MongoDB disconnected — the driver will keep retrying'));
  conn.on('reconnected', () => logger.info('MongoDB reconnected'));
  conn.on('error', (err) => logger.error('MongoDB connection error', { reason: sanitize(err.message) }));
}

/** Strip credentials from anything that may echo the connection string. */
function sanitize(message: string): string {
  return message.replace(/\/\/[^@/\s]+@/g, '//<credentials>@');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ConnectOptions {
  uri?: string;
  dbName?: string;
  maxAttempts?: number;
}

export async function connectDatabase(options: ConnectOptions = {}): Promise<void> {
  const uri = options.uri ?? env.MONGODB_URI;
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Paste your MongoDB Atlas connection string into server/.env (MONGODB_URI=...) and restart.',
    );
  }
  attachListeners();

  const maxAttempts = options.maxAttempts ?? 5;
  for (let attempt = 1; ; attempt += 1) {
    try {
      await mongoose.connect(uri, {
        dbName: options.dbName ?? env.MONGODB_DB_NAME,
        serverSelectionTimeoutMS: 10_000,
        maxPoolSize: 20,
        autoIndex: !env.isProduction,
      });
      break;
    } catch (err) {
      const reason = sanitize((err as Error).message);
      // Wrong credentials will not fix themselves — fail fast with a clear hint.
      if (/auth/i.test(reason)) {
        throw new Error(
          `MongoDB rejected the credentials (${reason}). Check the database user's name and password in Atlas → Database Access, and URL-encode special characters in the password.`,
        );
      }
      if (attempt >= maxAttempts) {
        throw new Error(`Could not connect to MongoDB after ${attempt} attempts: ${reason}`);
      }
      const delay = Math.min(1000 * 2 ** (attempt - 1), 15_000);
      logger.warn(`MongoDB connection attempt ${attempt} failed; retrying in ${delay}ms`, { reason });
      await sleep(delay);
    }
  }

  transactionsSupported = await detectTransactionSupport();
  logger.info('MongoDB connected', {
    database: mongoose.connection.name,
    transactions: transactionsSupported ? 'enabled' : 'unavailable (compensation strategy active)',
  });
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Round-trips a `ping` to the server. Unlike readyState, this proves the
 * database is answering right now. Never throws; returns no connection details.
 */
export async function pingDatabase(timeoutMs = 2000): Promise<{ ok: boolean; latencyMs: number | null }> {
  const db = mongoose.connection.db;
  if (mongoose.connection.readyState !== 1 || !db) return { ok: false, latencyMs: null };
  const started = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('ping timeout')), timeoutMs);
    });
    const reply = await Promise.race([db.admin().command({ ping: 1 }), timeout]);
    return { ok: reply?.ok === 1, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, latencyMs: null };
  } finally {
    clearTimeout(timer);
  }
}

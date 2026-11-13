/**
 * Zero-setup demo: starts a throwaway in-memory MongoDB replica set (so
 * transactions work exactly as on Atlas), seeds it, and runs the API.
 * Data is lost when the process stops. For real use, set MONGODB_URI.
 *
 *   npm run dev:memory
 */
import path from 'path';

// Reuse the binary the test suite already downloaded, whatever the cwd is.
process.env.MONGOMS_DOWNLOAD_DIR ??= path.resolve(__dirname, '../node_modules/.cache/mongodb-memory-server');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MongoMemoryReplSet } = require('mongodb-memory-server') as typeof import('mongodb-memory-server');

async function main() {
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGODB_URI = replSet.getUri('busnest');
  console.info('In-memory MongoDB replica set started (data is not persisted).');

  const { connectDatabase } = await import('../src/config/db');
  const { seedDatabase } = await import('./seed');
  await connectDatabase();
  await seedDatabase();
  // server.ts connects again (no-op on an open connection) and starts listening.
  await import('../src/server');

  const stop = async () => {
    await replSet.stop();
    process.exit(0);
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch((err) => {
  console.error('dev:memory failed:', (err as Error).message);
  process.exit(1);
});

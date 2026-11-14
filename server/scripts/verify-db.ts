/**
 * Read-only database verification. Never prints the connection string and
 * never writes: it connects with the application's own configuration, pings
 * the server, runs read queries and checks that every index declared in the
 * Mongoose models exists on the live database.
 *
 *   npm run db:verify      (exit code 0 = all checks passed)
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase, supportsTransactions } from '../src/config/db';
import { env } from '../src/config/env';
import { allModels } from '../src/config/models';

let failures = 0;
const check = (label: string, ok: boolean, detail = '') => {
  if (!ok) failures += 1;
  console.info(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

/** Describes the URI's shape without revealing host, user or password. */
function describeUri(uri: string) {
  const scheme = uri.split('://')[0];
  const credentials = /^mongodb(\+srv)?:\/\/[^/@\s]+:[^/@\s]+@/.test(uri);
  const atlasHost = /@[^/?]+\.mongodb\.net(\/|\?|$)/.test(uri);
  const placeholder = /[<>]/.test(uri);
  return { scheme, credentials, atlasHost, placeholder };
}

const keyOf = (key: object) => JSON.stringify(key);

async function main() {
  const uri = env.MONGODB_URI;
  check('MONGODB_URI is set', uri.length > 0);
  if (!uri) return;
  const shape = describeUri(uri);
  check('URI has the MongoDB Atlas format', ['mongodb+srv', 'mongodb'].includes(shape.scheme) && shape.credentials && shape.atlasHost && !shape.placeholder, `scheme ${shape.scheme}, credentials ${shape.credentials ? 'present' : 'missing'}, Atlas host ${shape.atlasHost ? 'yes' : 'no'}`);

  const started = Date.now();
  await connectDatabase({ maxAttempts: 2 });
  check('connected to MongoDB', true, `${Date.now() - started} ms`);
  check('mongoose readyState = 1', mongoose.connection.readyState === 1, `readyState ${mongoose.connection.readyState}`);
  check('database name', mongoose.connection.name === env.MONGODB_DB_NAME, `"${mongoose.connection.name}"`);

  const db = mongoose.connection.db!;
  const ping = await db.admin().command({ ping: 1 });
  check('server ping', ping.ok === 1);
  check('multi-document transactions available', supportsTransactions(), supportsTransactions() ? 'replica set' : 'standalone — compensation strategy in use');

  // Read queries against every collection.
  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const model of allModels) {
    const name = model.collection.collectionName;
    if (!existing.has(name)) {
      check(`collection ${name} exists`, false, 'missing — run npm run db:init');
      continue;
    }
    const count = await model.estimatedDocumentCount();
    const sample = await model.findOne().select('_id').lean();
    check(`collection ${name} readable`, true, `${count} documents${sample ? '' : ' (empty)'}`);

    // Every index the schema declares must exist with the same key and options.
    const live = await model.collection.indexes();
    const missing: string[] = [];
    for (const [fields, options] of model.schema.indexes() as [Record<string, unknown>, Record<string, unknown>][]) {
      const match = live.find((ix) => keyOf(ix.key) === keyOf(fields));
      const sameUnique = !!match && !!match.unique === !!options.unique;
      const samePartial = !!match && keyOf(match.partialFilterExpression ?? {}) === keyOf(options.partialFilterExpression ?? {});
      const sameTtl = !!match && (options.expireAfterSeconds === undefined || match.expireAfterSeconds === options.expireAfterSeconds);
      if (!(match && sameUnique && samePartial && sameTtl)) missing.push(keyOf(fields));
    }
    check(`indexes on ${name}`, missing.length === 0, missing.length ? `missing/mismatched: ${missing.join(' ')}` : `${model.schema.indexes().length} declared, all present`);
  }

  // The one index seat integrity depends on, checked explicitly.
  const seatIndex = (await mongoose.connection.collection('seatallocations').indexes()).find((ix) => ix.name === 'uniq_active_trip_seat');
  check(
    'seat-integrity index uniq_active_trip_seat',
    !!seatIndex && seatIndex.unique === true && keyOf(seatIndex.partialFilterExpression ?? {}) === keyOf({ status: 'ACTIVE' }),
    seatIndex ? 'unique, partial { status: "ACTIVE" }' : 'missing',
  );

  // Integrity of the stored data.
  const dupes = await mongoose.connection
    .collection('seatallocations')
    .aggregate([{ $match: { status: 'ACTIVE' } }, { $group: { _id: { t: '$tripId', s: '$seatId' }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $count: 'n' }])
    .toArray();
  check('no seat actively allocated twice', (dupes[0]?.n ?? 0) === 0);
  const pending = await mongoose.connection.collection('bookings').countDocuments({ status: 'PENDING' });
  check('no bookings stuck in PENDING', pending === 0, `${pending}`);
}

main()
  .catch((err) => {
    failures += 1;
    // connectDatabase already strips credentials from driver messages.
    console.error(`FAIL  ${(err as Error).message}`);
  })
  .finally(async () => {
    await disconnectDatabase().catch(() => undefined);
    console.info(failures ? `\n${failures} check(s) failed` : '\nAll database checks passed');
    process.exitCode = failures ? 1 : 0;
  });

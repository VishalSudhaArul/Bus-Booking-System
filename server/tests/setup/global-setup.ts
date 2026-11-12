import { MongoMemoryReplSet } from 'mongodb-memory-server';

let replSet: MongoMemoryReplSet | undefined;

/**
 * One in-memory, single-node replica set for the whole run. A replica set (not
 * a standalone) is required so the tests exercise real multi-document
 * transactions — the same mode MongoDB Atlas runs in.
 */
export async function setup() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  process.env.MONGO_TEST_URI = replSet.getUri();
}

export async function teardown() {
  await replSet?.stop();
}

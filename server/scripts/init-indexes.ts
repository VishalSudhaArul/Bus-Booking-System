 
/**
 * Creates every collection and index declared by the Mongoose models and
 * prints them. The API also does this on startup; this script exists so the
 * database can be prepared (or inspected) without starting the server.
 */
import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase, supportsTransactions } from '../src/config/db';
import { allModels, ensureIndexes } from '../src/config/models';

async function main() {
  await connectDatabase();
  await ensureIndexes();
  console.info(`Database "${mongoose.connection.name}" — transactions ${supportsTransactions() ? 'supported' : 'NOT supported'}`);
  for (const model of allModels) {
    const indexes = await model.collection.indexes();
    console.info(`\n${model.collection.collectionName}`);
    for (const ix of indexes) {
      const flags = [ix.unique ? 'unique' : '', ix.partialFilterExpression ? `partial ${JSON.stringify(ix.partialFilterExpression)}` : '', ix.expireAfterSeconds !== undefined ? 'ttl' : '']
        .filter(Boolean)
        .join(', ');
      console.info(`  ${ix.name}  ${JSON.stringify(ix.key)}${flags ? `  [${flags}]` : ''}`);
    }
  }
}

main()
  .catch((err) => {
    console.error('Index initialisation failed:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());

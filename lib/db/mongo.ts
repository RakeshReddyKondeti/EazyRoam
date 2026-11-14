// MongoDB Atlas: one shared client, indexes created once. Owner: B.
import { type Db, MongoClient } from "mongodb";

type G = { __eazyroamMongo?: Promise<Db> };
const g = globalThis as G; // survives dev hot reloads

export const hasMongo = () => Boolean(process.env.MONGODB_URI);

async function connect(): Promise<Db> {
  const client = new MongoClient(process.env.MONGODB_URI!, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || "eazyroam");
  await Promise.all([
    db.collection("cache").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("places").createIndex({ geo: "2dsphere" }),
    db.collection("reports").createIndex({ placeId: 1, at: -1 }),
    db.collection("reports").createIndex({ at: 1 }, { expireAfterSeconds: 30 * 24 * 3600 }),
  ]);
  return db;
}

/** The Atlas database. Only call when hasMongo() is true. */
export function getDb(): Promise<Db> {
  g.__eazyroamMongo ??= connect().catch((e) => {
    g.__eazyroamMongo = undefined; // retry on the next call
    throw e;
  });
  return g.__eazyroamMongo;
}

// cached(): every API response goes through here. Atlas with a TTL index, or memory without MONGODB_URI. Owner: B.
import type { Cached } from "../contracts";
import { getDb, hasMongo } from "./mongo";

const mem = new Map<string, { value: unknown; expiresAt: number }>();
const inflight = new Map<string, Promise<unknown>>();

type CacheDoc = { _id: string; value: unknown; expiresAt: Date };

export const cached: Cached = async <T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> => {
  const hit = mem.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  // Collapse identical concurrent calls into one API request.
  if (inflight.has(key)) return inflight.get(key) as Promise<T>;
  const run = (async () => {
    if (hasMongo()) {
      try {
        const doc = await (await getDb()).collection<CacheDoc>("cache").findOne({ _id: key });
        if (doc && doc.expiresAt.getTime() > Date.now()) {
          mem.set(key, { value: doc.value, expiresAt: doc.expiresAt.getTime() });
          return doc.value as T;
        }
      } catch {
        // Atlas down: fall through to the API
      }
    }
    const value = await fn();
    const expiresAt = Date.now() + ttlSec * 1000;
    mem.set(key, { value, expiresAt });
    if (hasMongo()) {
      getDb()
        .then((db) =>
          db.collection<CacheDoc>("cache").updateOne({ _id: key }, { $set: { value, expiresAt: new Date(expiresAt) } }, { upsert: true }),
        )
        .catch(() => {});
    }
    return value;
  })();
  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
};

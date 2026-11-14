// Tiger Data (TimescaleDB): time-series of accessibility events → station reliability. Owner: B.
import { Pool } from "pg";
import type { GetReliability, RecordEvent } from "../contracts";

type G = { __eazyroamTiger?: Promise<Pool> };
const g = globalThis as G;

export const hasTiger = () => Boolean(process.env.TIGER_DATABASE_URL);

async function init(): Promise<Pool> {
  const pool = new Pool({ connectionString: process.env.TIGER_DATABASE_URL, max: 4, connectionTimeoutMillis: 5000 });
  await pool.query(
    `CREATE TABLE IF NOT EXISTS events (at timestamptz NOT NULL, kind text NOT NULL, subject text NOT NULL)`,
  );
  try {
    await pool.query(`SELECT create_hypertable('events', 'at', if_not_exists => TRUE)`);
  } catch {
    // TimescaleDB extension missing: a plain table still works
  }
  await pool.query(`CREATE INDEX IF NOT EXISTS events_subject_at ON events (subject, at DESC)`);
  return pool;
}

function pool(): Promise<Pool> {
  g.__eazyroamTiger ??= init().catch((e) => {
    g.__eazyroamTiger = undefined;
    throw e;
  });
  return g.__eazyroamTiger;
}

/** Store one event (e.g. kind "elevatorOut", subject = stop name). No-op without TIGER_DATABASE_URL. */
export const recordEvent: RecordEvent = async ({ kind, subject, at }) => {
  if (!hasTiger()) return;
  await (await pool()).query(`INSERT INTO events (at, kind, subject) VALUES ($1, $2, $3)`, [at, kind, subject]);
};

/** 1 − (days with an elevator outage in the last 30 days ÷ 30), per stop name. {} without Tiger. */
export const getReliability: GetReliability = async (stopNames) => {
  if (!hasTiger() || !stopNames.length) return {};
  const { rows } = await (await pool()).query<{ subject: string; days: string }>(
    `SELECT subject, count(DISTINCT date_trunc('day', at)) AS days
       FROM events
      WHERE kind = 'elevatorOut' AND subject = ANY($1) AND at > now() - interval '30 days'
      GROUP BY subject`,
    [stopNames],
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[r.subject] = Math.max(0, Math.min(1, 1 - Number(r.days) / 30));
  return out;
};

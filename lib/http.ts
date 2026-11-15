// Shared fetch helpers for every API client (A, B, C).

/** Thrown when an API key is not configured; routes turn it into a clear 503. */
export class MissingKeyError extends Error {
  constructor(public envVar: string) {
    super(`${envVar} is not set. Add it to .env.local (see .env.example).`);
    this.name = "MissingKeyError";
  }
}

/** A problem with what the user asked for (not a server fault); routes return it as a 400 with this message. */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}

export function requireKey(envVar: string): string {
  const v = process.env[envVar];
  if (!v) throw new MissingKeyError(envVar);
  return v;
}

export const hasKey = (envVar: string) => Boolean(process.env[envVar]);

/** Generic client name for public APIs that ask for one (no personal details). */
export const USER_AGENT = "EazyRoam/0.1 (accessible trip planner; hackathon project)";

/** fetch + timeout + JSON + readable errors. */
export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 8000): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

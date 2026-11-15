import { MissingKeyError, UserError } from "@/lib/http";
import { errText, log } from "@/lib/log";

/** 503 for a missing key (says which), 400 for bad input, 502 for an upstream failure. */
export function errorResponse(e: unknown): Response {
  if (e instanceof MissingKeyError) {
    log("api", `503: ${e.envVar} not set`);
    return Response.json({ error: e.message, missing: e.envVar }, { status: 503 });
  }
  if (e instanceof BadRequest || e instanceof UserError) {
    log("api", `400: ${e.message}`);
    return Response.json({ error: e.message }, { status: 400 });
  }
  log("api", `502: ${errText(e)}`);
  console.error(e);
  const msg = e instanceof Error ? e.message : String(e);
  return Response.json({ error: `Something went wrong while planning: ${msg}` }, { status: 502 });
}

export class BadRequest extends Error {}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new BadRequest("Request body must be JSON.");
  }
}

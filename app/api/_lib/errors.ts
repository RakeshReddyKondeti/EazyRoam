import { MissingKeyError } from "@/lib/http";

/** 503 for a missing key (says which), 400 for bad input, 502 for an upstream failure. */
export function errorResponse(e: unknown): Response {
  if (e instanceof MissingKeyError) return Response.json({ error: e.message, missing: e.envVar }, { status: 503 });
  if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
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

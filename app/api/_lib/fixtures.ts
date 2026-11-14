// Fixture switch for the API routes (PLAN.md §4). Dev and test only.
// With USE_FIXTURES=1 the routes return JSON from /fixtures instead of calling real code.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const fixturesOn = () => process.env.USE_FIXTURES === "1";

/**
 * Return the first fixture that exists, in order. Lets C's draft stand in until the owner's
 * file lands, e.g. ["plan.sample.json" (A), "plan.c-draft.json" (C)].
 * Returns 503 if none exist yet.
 */
export async function fixtureResponse(files: string[], owner: string): Promise<Response> {
  for (const file of files) {
    try {
      const raw = await readFile(path.join(process.cwd(), "fixtures", file), "utf8");
      return Response.json(JSON.parse(raw));
    } catch {
      // try the next one
    }
  }
  return Response.json(
    { error: `fixtures/${files[0]} not found yet (owner: ${owner}, see PLAN.md §4)` },
    { status: 503 },
  );
}

/** Real code path not wired yet: returned until the contract functions land. */
export const notWired = (what: string) =>
  Response.json({ error: `${what} is not wired yet. Set USE_FIXTURES=1 for now.` }, { status: 501 });

// Fixture switch for the API routes (PLAN.md §4). Dev and test only.
// With USE_FIXTURES=1 the routes return JSON from /fixtures instead of calling real code.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const fixturesOn = () => process.env.USE_FIXTURES === "1";

/** Return the first fixture that exists, in order. 503 if none exist yet. */
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

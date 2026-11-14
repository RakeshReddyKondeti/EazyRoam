// Fixture switch for the API routes (PLAN.md §4). Dev and test only.
// With USE_FIXTURES=1 the routes return JSON from /fixtures instead of calling real code.
import { readFile } from "node:fs/promises";
import path from "node:path";

export const fixturesOn = () => process.env.USE_FIXTURES === "1";

/** Read a fixture by file name. Returns a 503 Response if the owner hasn't committed it yet. */
export async function fixtureResponse(file: string, owner: string): Promise<Response> {
  try {
    const raw = await readFile(path.join(process.cwd(), "fixtures", file), "utf8");
    return Response.json(JSON.parse(raw));
  } catch {
    return Response.json(
      { error: `fixtures/${file} not found yet (owner: ${owner}, see PLAN.md §4)` },
      { status: 503 },
    );
  }
}

/** Real code path not wired yet: returned until the contract functions land. */
export const notWired = (what: string) =>
  Response.json({ error: `${what} is not wired yet. Set USE_FIXTURES=1 for now.` }, { status: 501 });

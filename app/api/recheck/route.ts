// POST /api/recheck  { plan, now } -> { plan, changes: string[], checkedAt }
// Re-checks one planned day against fresh data before (or during) the day. recheckDay (A).
import { realDeps } from "@/lib/deps";
import { recheckDay } from "@/lib/planner";
import type { Plan } from "@/lib/types";
import { BadRequest, errorResponse, readJson } from "../_lib/errors";
import { fixturesOn } from "../_lib/fixtures";

export async function POST(req: Request) {
  try {
    const b = await readJson<{ plan?: Plan; now?: string }>(req);
    if (!b.plan?.stops || !b.plan.request) throw new BadRequest("Send { plan, now }.");
    const now = b.now && !Number.isNaN(Date.parse(b.now)) ? b.now : new Date().toISOString();
    // Fixture mode has no live data to compare against: report "nothing changed".
    if (fixturesOn()) return Response.json({ plan: b.plan, changes: [], checkedAt: now });
    const { plan, changes } = await recheckDay(b.plan, now, realDeps);
    return Response.json({ plan, changes, checkedAt: now });
  } catch (e) {
    return errorResponse(e);
  }
}

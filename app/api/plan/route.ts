// POST /api/plan  { text, needs, origin, home } -> Plan
// Real path (PLAN.md §3): parseRequest (C, lib/ai) -> makePlan (A, lib/planner).
import { fixtureResponse, notWired, fixturesOn } from "../_lib/fixtures";

export async function POST() {
  if (fixturesOn()) return fixtureResponse(["plan.sample.json"], "A");
  return notWired("POST /api/plan");
}

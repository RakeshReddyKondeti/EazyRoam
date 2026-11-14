// POST /api/replan  { plan, event, now } -> Plan
// Real path (PLAN.md §3): replan (A) + explainChange (C) + addReport/recordEvent (B).
import { fixtureResponse, notWired, fixturesOn } from "../_lib/fixtures";

export async function POST() {
  if (fixturesOn()) return fixtureResponse(["plan.sample.json"], "A");
  return notWired("POST /api/replan");
}

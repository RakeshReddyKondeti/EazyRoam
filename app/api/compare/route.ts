// POST /api/compare  { request } -> Plan  ("normal map app" plan plus its problems)
// Real path (PLAN.md §3): comparePlan (A).
import { fixtureResponse, notWired, fixturesOn } from "../_lib/fixtures";

export async function POST() {
  if (fixturesOn()) return fixtureResponse(["plan.compare.json"], "A");
  return notWired("POST /api/compare");
}

// POST /api/compare  { request } -> Plan  ("normal map app" plan plus its problems). comparePlan (A).
import { realDeps } from "@/lib/deps";
import { comparePlan } from "@/lib/planner";
import type { Request as PlanRequest } from "@/lib/types";
import { BadRequest, errorResponse, readJson } from "../_lib/errors";
import { fixtureResponse, fixturesOn } from "../_lib/fixtures";

export async function POST(req: Request) {
  if (fixturesOn()) return fixtureResponse(["plan.compare.json"], "A");
  try {
    const b = await readJson<{ request?: PlanRequest }>(req);
    if (!b.request?.wants?.length) throw new BadRequest("Send { request } from a plan.");
    return Response.json(await comparePlan(b.request, realDeps));
  } catch (e) {
    return errorResponse(e);
  }
}

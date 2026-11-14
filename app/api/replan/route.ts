// POST /api/replan  { plan, event, now } -> Plan
// replan (A) + explainChange (C) + addReport / recordEvent (B).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { explainChange } from "@/lib/ai";
import { addReport } from "@/lib/db/reports";
import { recordEvent } from "@/lib/db/tiger";
import { realDeps } from "@/lib/deps";
import { replan } from "@/lib/planner";
import type { Event, Plan } from "@/lib/types";
import { BadRequest, errorResponse, readJson } from "../_lib/errors";
import { fixturesOn } from "../_lib/fixtures";

type Body = { plan?: Plan; event?: Event; now?: string };
const KINDS = new Set(["rampBlocked", "elevatorOut", "late", "addStop"]);

/** Reports help the next person; they never block the re-plan. */
async function remember(e: Event) {
  const at = new Date();
  const jobs: Promise<unknown>[] = [];
  if (e.type === "rampBlocked")
    jobs.push(addReport({ placeId: e.placeId, kind: e.type }), recordEvent({ kind: e.type, subject: e.placeId, at }));
  if (e.type === "elevatorOut")
    jobs.push(addReport({ stopName: e.stopName, kind: e.type }), recordEvent({ kind: e.type, subject: e.stopName, at }));
  await Promise.allSettled(jobs);
}

export async function POST(req: Request) {
  try {
    const b = await readJson<Body>(req);
    if (!b.plan?.stops || !b.event || !KINDS.has(b.event.type)) throw new BadRequest("Send { plan, event }.");
    const now = b.now ?? new Date().toISOString();

    if (fixturesOn()) {
      const file = path.join(process.cwd(), "fixtures", "plan.sample.json");
      const sample = JSON.parse(await readFile(file, "utf8")) as Plan;
      return Response.json({ ...sample, explanation: `Fixture mode: “${b.event.type}” received; showing the sample plan.` });
    }

    const [next] = await Promise.all([replan(b.plan, b.event, now, realDeps), remember(b.event)]);
    next.explanation = await explainChange(b.plan, next, b.event);
    return Response.json(next);
  } catch (e) {
    return errorResponse(e);
  }
}

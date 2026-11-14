// POST /api/plan  { text, needs, origin? | startAddress?, home?, date, offset } -> Plan
// parseRequest (C) -> makePlan (A), with geocode (B) when only an address is given.
import { parseRequest } from "@/lib/ai";
import { geocode } from "@/lib/data/places";
import { realDeps } from "@/lib/deps";
import { makePlan } from "@/lib/planner";
import type { LatLng, Needs } from "@/lib/types";
import { BadRequest, errorResponse, readJson } from "../_lib/errors";
import { fixtureResponse, fixturesOn } from "../_lib/fixtures";

type Body = {
  text?: string;
  needs?: Needs;
  origin?: LatLng;
  startAddress?: string;
  home?: LatLng;
  date?: string; // YYYY-MM-DD, the user's local date
  offset?: string; // "-05:00"
};

const DEFAULT_NEEDS: Needs = { noSteps: true, gentleSlopes: true, restroom: false };

export async function POST(req: Request) {
  if (fixturesOn()) return fixtureResponse(["plan.sample.json"], "A");
  try {
    const b = await readJson<Body>(req);
    if (!b.text?.trim()) throw new BadRequest("Tell us your plans for today.");
    if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !b.offset || !/^[+-]\d{2}:\d{2}$/.test(b.offset))
      throw new BadRequest("Missing date/offset.");
    let origin = b.origin;
    if (!origin) {
      if (!b.startAddress?.trim()) throw new BadRequest("Where are you starting from? Share your location or type an address.");
      origin = await geocode(b.startAddress);
    }
    const start = { lat: origin.lat, lng: origin.lng };
    const request = await parseRequest(b.text, b.needs ?? DEFAULT_NEEDS, start, b.home ?? start, { date: b.date, offset: b.offset });
    return Response.json(await makePlan(request, realDeps));
  } catch (e) {
    return errorResponse(e);
  }
}

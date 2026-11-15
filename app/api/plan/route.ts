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
  home?: LatLng; // where the day ends (omit = back to the start)
  endAddress?: string; // typed end address (used when `home` is not given)
  leaveAt?: string; // "HH:MM" from the Leave at field
  doneBy?: string; // "HH:MM" from the Done by field
  date?: string; // YYYY-MM-DD, the user's local date
  offset?: string; // "-05:00"
  now?: string; // the user's current local time, ISO with offset
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
    let startLabel = "Your location";
    if (!origin) {
      if (!b.startAddress?.trim()) throw new BadRequest("Where are you starting from? Share your location or type an address.");
      const g = await geocode(b.startAddress);
      origin = g;
      startLabel = g.label;
    }
    const start = { lat: origin.lat, lng: origin.lng };
    let end: LatLng = start;
    let endLabel: string | undefined;
    if (b.home) {
      end = { lat: b.home.lat, lng: b.home.lng };
      endLabel = "Your location";
    } else if (b.endAddress?.trim()) {
      const g = await geocode(b.endAddress);
      end = { lat: g.lat, lng: g.lng };
      endLabel = g.label;
    }
    const now = b.now && !Number.isNaN(Date.parse(b.now)) ? b.now : undefined;
    const request = await parseRequest(b.text, b.needs ?? DEFAULT_NEEDS, start, end, {
      date: b.date,
      offset: b.offset,
      now,
      leaveAt: b.leaveAt,
      doneBy: b.doneBy,
    });
    const plan = await makePlan({ ...request, startLabel, endLabel }, realDeps);
    if (request.note) plan.explanation = [request.note, plan.explanation].filter(Boolean).join(" ");
    return Response.json(plan);
  } catch (e) {
    return errorResponse(e);
  }
}

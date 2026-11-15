// POST /api/trip  { places, days, origin? | startAddress?, needs, date, offset } -> Trip. planTrip (A).
import { geocode } from "@/lib/data/places";
import { realDeps } from "@/lib/deps";
import { planTrip } from "@/lib/planner";
import { addDays } from "@/lib/planner/geo";
import type { LatLng, Needs } from "@/lib/types";
import { BadRequest, errorResponse, readJson } from "../_lib/errors";
import { fixtureResponse, fixturesOn } from "../_lib/fixtures";

type Body = { places?: string[]; days?: number; origin?: LatLng; startAddress?: string; needs?: Needs; date?: string; offset?: string; now?: string };

export async function POST(req: Request) {
  if (fixturesOn()) return fixtureResponse(["trip.sample.json"], "A");
  try {
    const b = await readJson<Body>(req);
    const places = (b.places ?? []).map((p) => p.trim()).filter(Boolean).slice(0, 20);
    if (!places.length) throw new BadRequest("Add at least one place to visit.");
    if (![1, 3, 7].includes(b.days ?? 0)) throw new BadRequest("Trip length must be 1, 3 or 7 days.");
    if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !b.offset || !/^[+-]\d{2}:\d{2}$/.test(b.offset))
      throw new BadRequest("Missing date/offset.");
    let origin = b.origin;
    let startLabel = "Your location";
    if (!origin) {
      if (!b.startAddress?.trim()) throw new BadRequest("Where are you staying? Share your location or type an address.");
      const g = await geocode(b.startAddress);
      origin = g;
      startLabel = g.label;
    }
    const needs = b.needs ?? { noSteps: true, gentleSlopes: true, restroom: false };
    // Days start at 10:00; if that has passed today, the trip starts tomorrow.
    const date = b.now && Date.parse(b.now) > Date.parse(`${b.date}T10:00:00${b.offset}`) ? addDays(b.date, 1) : b.date;
    const trip = await planTrip(
      { places, days: b.days!, origin: { lat: origin.lat, lng: origin.lng }, startLabel, needs, date, offset: b.offset },
      realDeps,
    );
    return Response.json(trip);
  } catch (e) {
    return errorResponse(e);
  }
}

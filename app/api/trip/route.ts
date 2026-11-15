// POST /api/trip  { places, days, origin? | startAddress?, needs, date, offset, now, startDate? } -> Trip. planTrip (A).
// `date` is today in the viewer's zone; `startDate` is the trip's first day (today up to a year ahead).
import { geocode } from "@/lib/data/places";
import { realDeps } from "@/lib/deps";
import { planTrip } from "@/lib/planner";
import { addDays } from "@/lib/planner/geo";
import type { LatLng, Needs } from "@/lib/types";
import { BadRequest, errorResponse, readJson } from "../_lib/errors";
import { fixtureResponse, fixturesOn } from "../_lib/fixtures";

const MAX_TRIP_DAYS = 14;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

type Body = { places?: string[]; days?: number; origin?: LatLng; startAddress?: string; needs?: Needs; date?: string; offset?: string; now?: string; startDate?: string; dayStart?: string; dayEnd?: string };

export async function POST(req: Request) {
  if (fixturesOn()) return fixtureResponse(["trip.sample.json"], "A");
  try {
    const b = await readJson<Body>(req);
    const places = (b.places ?? []).map((p) => p.trim()).filter(Boolean).slice(0, 20);
    if (!places.length) throw new BadRequest("Add at least one place to visit.");
    if (!Number.isInteger(b.days) || b.days! < 1 || b.days! > MAX_TRIP_DAYS) throw new BadRequest(`Trip length must be 1 to ${MAX_TRIP_DAYS} days.`);
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
    if (b.startDate && (!ISO_DATE.test(b.startDate) || b.startDate < b.date || b.startDate > addDays(b.date, 365)))
      throw new BadRequest("Pick a first day between today and a year from now.");
    const dayStart = b.dayStart ?? "10:00";
    const dayEnd = b.dayEnd ?? "20:00";
    if (!HHMM.test(dayStart) || !HHMM.test(dayEnd)) throw new BadRequest("Times must look like 09:30.");
    if (dayEnd <= dayStart) throw new BadRequest("“Back by” has to be later than the start time.");
    // A trip starting today after the day's start time starts tomorrow.
    const first = b.startDate ?? b.date;
    const date = first === b.date && b.now && Date.parse(b.now) > Date.parse(`${b.date}T${dayStart}:00${b.offset}`) ? addDays(b.date, 1) : first;
    const trip = await planTrip(
      { places, days: b.days!, origin: { lat: origin.lat, lng: origin.lng }, startLabel, needs, date, offset: b.offset, dayStart, dayEnd },
      realDeps,
    );
    const checkedAt = b.now ?? new Date().toISOString();
    return Response.json({ ...trip, dayPlans: trip.dayPlans.map((d) => ({ ...d, checkedAt })) });
  } catch (e) {
    return errorResponse(e);
  }
}

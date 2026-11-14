// Google Places API (New): candidates with hours + accessibility, merged with OSM and user reports. Owner: B.
import type { FindCandidates, Geocode } from "../contracts";
import { cached } from "../db/cache";
import { getReports } from "../db/reports";
import { fetchJson, requireKey } from "../http";
import { toOffsetIso } from "../planner/geo";
import type { Access, Hours, Place } from "../types";
import { mergeAccess, osmLookup } from "./osm";

type GTime = { day?: number; hour?: number; minute?: number };
export type GPlace = {
  id?: string;
  displayName?: { text?: string };
  location?: { latitude?: number; longitude?: number };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  utcOffsetMinutes?: number;
  primaryTypeDisplayName?: { text?: string };
  regularOpeningHours?: { periods?: { open?: GTime; close?: GTime }[] };
  accessibilityOptions?: {
    wheelchairAccessibleEntrance?: boolean;
    wheelchairAccessibleRestroom?: boolean;
    wheelchairAccessibleSeating?: boolean;
    wheelchairAccessibleParking?: boolean;
  };
};

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.utcOffsetMinutes",
  "places.primaryTypeDisplayName",
  "places.regularOpeningHours",
  "places.accessibilityOptions",
].join(",");

const bool = (b?: boolean): Access => (b === true ? "yes" : b === false ? "no" : "unknown");

/** -300 -> "-05:00" */
export function offsetString(min: number): string {
  const s = min < 0 ? "-" : "+";
  const a = Math.abs(min);
  return `${s}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** Opening windows that touch `date` (YYYY-MM-DD, place-local), as ISO with the place's offset. */
export function hoursFor(periods: { open?: GTime; close?: GTime }[] | undefined, date: string, offsetMin: number): Hours {
  if (!periods?.length) return [];
  const off = offsetString(offsetMin);
  const dayStart = Date.parse(`${date}T00:00:00${off}`);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sunday, same as Google
  const DAY = 86400000;
  // Always open: a single period opening Sunday 00:00 with no close.
  if (periods.length === 1 && !periods[0].close && (periods[0].open?.hour ?? 0) === 0)
    return [{ open: toOffsetIso(dayStart, off), close: toOffsetIso(dayStart + DAY - 60000, off) }];

  const out: Hours = [];
  for (const p of periods) {
    if (!p.open || !p.close) continue;
    const at = (t: GTime, dayDelta: number) => dayStart + dayDelta * DAY + ((t.hour ?? 0) * 60 + (t.minute ?? 0)) * 60000;
    const span = ((p.close.day ?? 0) - (p.open.day ?? 0) + 7) % 7; // days the period crosses
    for (const delta of [0, -1]) {
      // delta 0: opens today; delta -1: opened yesterday and runs past midnight
      if (((p.open.day ?? 0) - weekday + 7) % 7 !== (delta + 7) % 7) continue;
      const open = at(p.open, delta);
      const close = at(p.close, delta + span) + (span === 0 && at(p.close, 0) <= at(p.open, 0) ? DAY : 0);
      if (close <= dayStart || open >= dayStart + DAY) continue;
      out.push({ open: toOffsetIso(Math.max(open, dayStart), off), close: toOffsetIso(close, off) });
    }
  }
  return out.sort((a, b) => Date.parse(a.open) - Date.parse(b.open));
}

/** One Google place -> our Place (before OSM and reports). Exported for tests. */
export function mapPlace(g: GPlace, category: string, date: string): Place {
  const a = g.accessibilityOptions ?? {};
  const access = {
    entrance: bool(a.wheelchairAccessibleEntrance),
    restroom: bool(a.wheelchairAccessibleRestroom),
    seating: bool(a.wheelchairAccessibleSeating),
    parking: bool(a.wheelchairAccessibleParking),
  };
  return {
    id: g.id ?? "",
    name: g.displayName?.text ?? "Unnamed place",
    category,
    location: { lat: g.location?.latitude ?? 0, lng: g.location?.longitude ?? 0 },
    address: g.formattedAddress ?? "",
    phone: g.nationalPhoneNumber,
    hours: hoursFor(g.regularOpeningHours?.periods, date, g.utcOffsetMinutes ?? 0),
    access,
    overall: access.entrance,
    sources: ["google"],
  };
}

async function searchText(textQuery: string, near: { lat: number; lng: number } | null, pageSize: number, fields: string) {
  const key = requireKey("GOOGLE_MAPS_API_KEY");
  const body: Record<string, unknown> = { textQuery, pageSize };
  if (near) body.locationBias = { circle: { center: { latitude: near.lat, longitude: near.lng }, radius: 15000 } };
  return fetchJson<{ places?: GPlace[] }>("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": fields },
    body: JSON.stringify(body),
  });
}

export const findCandidates: FindCandidates = async (want, near, _needs, date) => {
  const q = want.query?.trim() || want.category;
  const r3 = (n: number) => n.toFixed(3);
  const raw = await cached(`places:${q.toLowerCase()}@${r3(near.lat)},${r3(near.lng)}`, 6 * 3600, async () =>
    (await searchText(q, near, 6, FIELDS)).places ?? [],
  );
  const places = raw.filter((g) => g.id && g.location).map((g) => mapPlace(g, want.category, date));

  const [osm, reports] = await Promise.all([osmLookup(places, cached), getReports(places.map((p) => p.id)).catch(() => ({}))]);
  for (const p of places) {
    const o = osm[p.id];
    if (o && o !== "unknown") {
      p.access.entrance = mergeAccess(p.access.entrance, o);
      p.sources.push("osm");
    }
    p.overall = p.access.entrance;
    if ((reports as Record<string, string[]>)[p.id]?.includes("rampBlocked")) {
      p.overall = "no";
      p.access.entrance = "no";
      p.sources.push("report");
    }
  }
  return places;
};

export const geocode: Geocode = async (q) => {
  const raw = await cached(`geocode:${q.toLowerCase().trim()}`, 7 * 24 * 3600, async () =>
    (await searchText(q, null, 1, "places.location,places.formattedAddress,places.displayName")).places ?? [],
  );
  const g = raw[0];
  if (!g?.location) throw new Error(`Couldn’t find “${q}”`);
  return { lat: g.location.latitude ?? 0, lng: g.location.longitude ?? 0, label: g.formattedAddress ?? g.displayName?.text ?? q };
};

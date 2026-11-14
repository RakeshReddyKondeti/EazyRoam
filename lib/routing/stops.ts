// Transitland v2: wheelchair_boarding for a transit stop (GTFS). Owner: A.
import type { Cached } from "../contracts";
import { fetchJson, hasKey, requireKey } from "../http";
import { meters } from "../planner/geo";
import type { Access, LatLng } from "../types";

type TlStop = {
  stop_name?: string;
  wheelchair_boarding?: number | null;
  geometry?: { coordinates?: [number, number] };
  parent?: { wheelchair_boarding?: number | null } | null;
};

export const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\b(station|stop|st|street|ave|avenue|and)\b/g, " ").replace(/\s+/g, " ").trim();

/** GTFS wheelchair_boarding: 1 = yes, 2 = no, 0/missing = unknown. */
export const gtfsAccess = (v?: number | null): Access => (v === 1 ? "yes" : v === 2 ? "no" : "unknown");

/** Pick the stop that matches by name, else the nearest one. Exported for tests. */
export function pickStop(stops: TlStop[], name: string, at: LatLng): Access {
  if (!stops.length) return "unknown";
  const n = norm(name);
  const dist = (s: TlStop) => {
    const c = s.geometry?.coordinates;
    return c ? meters(at, { lat: c[1], lng: c[0] }) : Infinity;
  };
  const byName = stops.filter((s) => {
    const m = norm(s.stop_name ?? "");
    return m && n && (m.includes(n) || n.includes(m));
  });
  const best = (byName.length ? byName : stops).slice().sort((a, b) => dist(a) - dist(b))[0];
  const own = gtfsAccess(best.wheelchair_boarding);
  return own === "unknown" ? gtfsAccess(best.parent?.wheelchair_boarding) : own;
}

/** Is this stop wheelchair-boardable? "unknown" when there is no key or no data. */
export async function stopAccess(name: string, at: LatLng, cached: Cached): Promise<Access> {
  if (!hasKey("TRANSITLAND_API_KEY")) return "unknown";
  const key = requireKey("TRANSITLAND_API_KEY");
  const cacheKey = `tl:${at.lat.toFixed(4)},${at.lng.toFixed(4)}:${norm(name)}`;
  try {
    return await cached(cacheKey, 7 * 24 * 3600, async () => {
      const url = `https://transit.land/api/v2/rest/stops?lat=${at.lat}&lon=${at.lng}&radius=80&limit=20`;
      const data = await fetchJson<{ stops?: TlStop[] }>(url, { headers: { apikey: key } });
      return pickStop(data.stops ?? [], name, at);
    });
  } catch {
    return "unknown"; // never let a lookup failure become a false "yes"
  }
}

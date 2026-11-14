// OpenStreetMap wheelchair=* tags via Overpass, one query per batch of places. Owner: B.
import type { Cached } from "../contracts";
import { USER_AGENT, fetchJson } from "../http";
import { meters } from "../planner/geo";
import { norm } from "../routing/stops";
import type { Access, LatLng } from "../types";

type OsmEl = { lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

export const osmAccess = (v?: string): Access =>
  v === "yes" || v === "designated" ? "yes" : v === "limited" ? "limited" : v === "no" ? "no" : "unknown";

/** Match OSM elements to one place: same name within 60 m, else anything within 25 m. Exported for tests. */
export function matchOsm(els: OsmEl[], name: string, at: LatLng): Access {
  const n = norm(name);
  const withDist = els
    .map((e) => {
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      return lat == null || lon == null ? null : { e, d: meters(at, { lat, lng: lon }) };
    })
    .filter((x): x is { e: OsmEl; d: number } => x !== null)
    .sort((a, b) => a.d - b.d);
  const named = withDist.find(({ e, d }) => {
    const m = norm(e.tags?.name ?? "");
    return d <= 60 && m && n && (m.includes(n) || n.includes(m));
  });
  const hit = named ?? withDist.find(({ d }) => d <= 25);
  return osmAccess(hit?.e.tags?.wheelchair);
}

/** OSM access per place id. Failures return {} (Google data still stands). */
export async function osmLookup(
  places: { id: string; name: string; location: LatLng }[],
  cached: Cached,
): Promise<Record<string, Access>> {
  if (!places.length) return {};
  const key = `osm:${places.map((p) => p.id).sort().join(",")}`;
  try {
    return await cached(key, 7 * 24 * 3600, async () => {
      const around = places
        .map((p) => `nwr(around:60,${p.location.lat},${p.location.lng})[wheelchair][name];`)
        .join("");
      const q = `[out:json][timeout:15];(${around});out tags center;`;
      const data = await fetchJson<{ elements?: OsmEl[] }>(
        "https://overpass-api.de/api/interpreter",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "User-Agent": USER_AGENT,
          },
          body: `data=${encodeURIComponent(q)}`,
        },
        8000, // best-effort: the public Overpass server can take 30 s+ when busy; Google data stands without it
      );
      const out: Record<string, Access> = {};
      for (const p of places) out[p.id] = matchOsm(data.elements ?? [], p.name, p.location);
      return out;
    });
  } catch {
    return {};
  }
}

/** Google's known value wins, OSM fills unknowns, a yes/no conflict becomes "limited". */
export function mergeAccess(google: Access, osm: Access | undefined): Access {
  if (!osm || osm === "unknown") return google;
  if (google === "unknown") return osm;
  if ((google === "yes" && osm === "no") || (google === "no" && osm === "yes")) return "limited";
  return google;
}

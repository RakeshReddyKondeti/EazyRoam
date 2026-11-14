// Google Routes API, TRANSIT mode, with alternatives. Owner: A.
import type { Cached } from "../contracts";
import { fetchJson, requireKey } from "../http";
import type { LatLng } from "../types";

export type TransitStopRef = { name: string; location: LatLng };
export type Segment =
  | { kind: "walk"; minutes: number; from: LatLng; to: LatLng }
  | {
      kind: "transit";
      minutes: number;
      vehicle: "bus" | "rail";
      line: string;
      board: TransitStopRef;
      alight: TransitStopRef;
    };
export type TransitRoute = { minutes: number; polyline: string; segments: Segment[] };

type GLatLng = { latLng?: { latitude: number; longitude: number } };
type GStep = {
  travelMode?: "WALK" | "TRANSIT";
  staticDuration?: string;
  startLocation?: GLatLng;
  endLocation?: GLatLng;
  transitDetails?: {
    stopDetails?: {
      departureStop?: { name?: string; location?: GLatLng };
      arrivalStop?: { name?: string; location?: GLatLng };
    };
    transitLine?: { nameShort?: string; name?: string; vehicle?: { type?: string } };
  };
};
type GRoute = { duration?: string; polyline?: { encodedPolyline?: string }; legs?: { steps?: GStep[] }[] };

const FIELD_MASK = [
  "routes.duration",
  "routes.polyline.encodedPolyline",
  "routes.legs.steps.travelMode",
  "routes.legs.steps.staticDuration",
  "routes.legs.steps.startLocation",
  "routes.legs.steps.endLocation",
  "routes.legs.steps.transitDetails",
].join(",");

const BUS_TYPES = new Set(["BUS", "INTERCITY_BUS", "TROLLEYBUS", "SHARE_TAXI"]);
const secs = (d?: string) => Number((d ?? "0s").replace("s", "")) || 0;
const mins = (d?: string) => Math.max(1, Math.round(secs(d) / 60));
const ll = (g?: GLatLng): LatLng => ({ lat: g?.latLng?.latitude ?? 0, lng: g?.latLng?.longitude ?? 0 });

/** Map one Google route to our segments. Exported for tests. */
export function mapRoute(r: GRoute): TransitRoute {
  const segments: Segment[] = [];
  for (const step of r.legs?.flatMap((l) => l.steps ?? []) ?? []) {
    const td = step.transitDetails;
    if (step.travelMode === "TRANSIT" && td) {
      const type = td.transitLine?.vehicle?.type ?? "BUS";
      segments.push({
        kind: "transit",
        minutes: mins(step.staticDuration),
        vehicle: BUS_TYPES.has(type) ? "bus" : "rail",
        line: td.transitLine?.nameShort || td.transitLine?.name || "",
        board: { name: td.stopDetails?.departureStop?.name ?? "Stop", location: ll(td.stopDetails?.departureStop?.location) },
        alight: { name: td.stopDetails?.arrivalStop?.name ?? "Stop", location: ll(td.stopDetails?.arrivalStop?.location) },
      });
    } else {
      // Merge consecutive walking steps into one segment.
      const prev = segments[segments.length - 1];
      const m = secs(step.staticDuration) / 60;
      if (prev?.kind === "walk") {
        prev.minutes += m;
        prev.to = ll(step.endLocation);
      } else segments.push({ kind: "walk", minutes: m, from: ll(step.startLocation), to: ll(step.endLocation) });
    }
  }
  for (const s of segments) if (s.kind === "walk") s.minutes = Math.max(1, Math.round(s.minutes));
  return { minutes: mins(r.duration), polyline: r.polyline?.encodedPolyline ?? "", segments };
}

/** Transit alternatives from a to b leaving at departAt (moved to now if in the past). */
export async function transitRoutes(a: LatLng, b: LatLng, departAt: string, cached: Cached): Promise<TransitRoute[]> {
  const key = requireKey("GOOGLE_MAPS_API_KEY");
  const depart = new Date(Math.max(Date.parse(departAt), Date.now() + 60000));
  depart.setUTCMinutes(Math.ceil(depart.getUTCMinutes() / 10) * 10, 0, 0); // 10-min buckets share cache
  const r5 = (n: number) => n.toFixed(5);
  const cacheKey = `routes:${r5(a.lat)},${r5(a.lng)}>${r5(b.lat)},${r5(b.lng)}@${depart.toISOString()}`;

  return cached(cacheKey, 30 * 60, async () => {
    const body = {
      origin: { location: { latLng: { latitude: a.lat, longitude: a.lng } } },
      destination: { location: { latLng: { latitude: b.lat, longitude: b.lng } } },
      travelMode: "TRANSIT",
      departureTime: depart.toISOString(),
      computeAlternativeRoutes: true,
      transitPreferences: { routingPreference: "LESS_WALKING" },
    };
    const data = await fetchJson<{ routes?: GRoute[] }>("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELD_MASK },
      body: JSON.stringify(body),
    });
    return (data.routes ?? []).map(mapRoute);
  });
}

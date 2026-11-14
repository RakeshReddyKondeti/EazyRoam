// OpenRouteService wheelchair profile: sidewalk routing aware of slope, kerbs, surface. Owner: A.
import type { Cached } from "../contracts";
import { fetchJson, requireKey } from "../http";
import type { LatLng, Needs } from "../types";

export type RollRoute = { minutes: number; meters: number; polyline: string };

type OrsResponse = { routes?: { summary?: { distance?: number; duration?: number }; geometry?: string }[] };

export async function rollRoute(a: LatLng, b: LatLng, needs: Needs, cached: Cached): Promise<RollRoute> {
  const key = requireKey("ORS_API_KEY");
  const r5 = (n: number) => n.toFixed(5);
  const cacheKey = `ors:${r5(a.lat)},${r5(a.lng)}>${r5(b.lat)},${r5(b.lng)}:${needs.gentleSlopes ? "g" : "n"}`;

  return cached(cacheKey, 7 * 24 * 3600, async () => {
    const body = {
      coordinates: [
        [a.lng, a.lat],
        [b.lng, b.lat],
      ],
      // ORS wheelchair restrictions: incline in %, sloped kerb height in metres.
      options: {
        profile_params: {
          restrictions: {
            maximum_incline: needs.gentleSlopes ? 6 : 10,
            maximum_sloped_kerb: needs.noSteps ? 0.03 : 0.06,
          },
        },
      },
    };
    const data = await fetchJson<OrsResponse>("https://api.openrouteservice.org/v2/directions/wheelchair", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: key },
      body: JSON.stringify(body),
    });
    const route = data.routes?.[0];
    if (!route) throw new Error("No step-free sidewalk route found");
    return {
      minutes: Math.max(1, Math.round((route.summary?.duration ?? 0) / 60)),
      meters: Math.round(route.summary?.distance ?? 0),
      polyline: route.geometry ?? "",
    };
  });
}

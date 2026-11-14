// Live elevator outages. MBTA v3 today; other agencies return none. Owner: B.
import type { GetElevatorOutages } from "../contracts";
import { cached } from "../db/cache";
import { fetchJson } from "../http";
import { norm } from "../routing/stops";
import type { Stop } from "../types";

// Rough MBTA service area (Massachusetts east of the Connecticut River valley).
const MBTA_BOX = { s: 41.2, n: 43.0, w: -71.95, e: -69.8 };
const inMbta = (s: Stop) =>
  s.location.lat >= MBTA_BOX.s && s.location.lat <= MBTA_BOX.n && s.location.lng >= MBTA_BOX.w && s.location.lng <= MBTA_BOX.e;

type MbtaAlert = { attributes?: { effect?: string; informed_entity?: { stop?: string }[] } };
type MbtaStop = { id: string; attributes?: { name?: string } };

const headers = () => (process.env.MBTA_API_KEY ? { "x-api-key": process.env.MBTA_API_KEY } : undefined);

/** Station names with an elevator closed right now (MBTA). */
export async function mbtaElevatorClosures(): Promise<string[]> {
  return cached("mbta:elevator-closures", 5 * 60, async () => {
    const alerts = await fetchJson<{ data?: MbtaAlert[] }>(
      "https://api-v3.mbta.com/alerts?filter[activity]=USING_WHEELCHAIR&filter[datetime]=NOW",
      { headers: headers() },
    );
    const ids = new Set<string>();
    for (const a of alerts.data ?? [])
      if (a.attributes?.effect === "ELEVATOR_CLOSURE")
        for (const e of a.attributes.informed_entity ?? []) if (e.stop) ids.add(e.stop);
    if (!ids.size) return [];
    const stops = await fetchJson<{ data?: MbtaStop[] }>(
      `https://api-v3.mbta.com/stops?filter[id]=${[...ids].map(encodeURIComponent).join(",")}`,
      { headers: headers() },
    );
    return [...new Set((stops.data ?? []).map((s) => s.attributes?.name).filter((n): n is string => Boolean(n)))];
  });
}

/** Which of these stops have a closed elevator (by normalised name). Exported for tests. */
export function matchOutages(stops: Stop[], closedNames: string[]): Set<string> {
  const closed = closedNames.map(norm).filter(Boolean);
  const out = new Set<string>();
  for (const s of stops) {
    const n = norm(s.name);
    if (n && closed.some((c) => c === n || n.includes(c) || c.includes(n))) out.add(s.name);
  }
  return out;
}

export const getElevatorOutages: GetElevatorOutages = async (stops) => {
  const mbta = stops.filter(inMbta);
  if (!mbta.length) return new Set();
  try {
    return matchOutages(mbta, await mbtaElevatorClosures());
  } catch {
    return new Set(); // feed down: no live data, never a false outage
  }
};

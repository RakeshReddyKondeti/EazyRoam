// planTrip(): Vacation mode. Find each named place, leave out inaccessible ones,
// group the rest into days by geography, then plan each day with the same solver as Today. Owner: A.
import type { PlanTrip } from "../contracts";
import type { LatLng, Place, Trip } from "../types";
import { addDays, meters } from "./geo";
import { solve } from "./solve";

const DAY_START = "10:00";
const DAY_END = "20:00";

export { addDays } from "./geo";

const centroid = (ps: { location: LatLng }[]): LatLng => ({
  lat: ps.reduce((s, p) => s + p.location.lat, 0) / ps.length,
  lng: ps.reduce((s, p) => s + p.location.lng, 0) / ps.length,
});

/**
 * Split places into `k` geographic groups of at most `cap` (k-means, farthest-point start, then rebalance).
 * Deterministic. Exported for tests.
 */
export function clusterDays<T extends { location: LatLng }>(places: T[], k: number, cap: number): T[][] {
  if (k <= 1 || places.length <= 1) return places.length ? [places] : [];
  k = Math.min(k, places.length);
  const centers: LatLng[] = [places[0].location];
  while (centers.length < k) {
    const far = places.reduce((best, p) => {
      const d = Math.min(...centers.map((c) => meters(c, p.location)));
      return d > best.d ? { p, d } : best;
    }, { p: places[0], d: -1 });
    centers.push(far.p.location);
  }
  let groups: T[][] = [];
  for (let iter = 0; iter < 12; iter++) {
    groups = centers.map(() => []);
    for (const p of places) {
      const i = centers.reduce((bi, c, ci) => (meters(c, p.location) < meters(centers[bi], p.location) ? ci : bi), 0);
      groups[i].push(p);
    }
    groups.forEach((g, i) => g.length && (centers[i] = centroid(g)));
  }
  // Rebalance: move the farthest member of an over-full day to the nearest day with room.
  for (let guard = 0; guard < places.length * k; guard++) {
    const over = groups.findIndex((g) => g.length > cap);
    if (over < 0) break;
    const g = groups[over];
    const c = centers[over];
    g.sort((a, b) => meters(c, a.location) - meters(c, b.location));
    const p = g.pop()!;
    const target = groups
      .map((gg, i) => ({ i, d: meters(centers[i], p.location), room: gg.length < cap }))
      .filter((x) => x.i !== over && x.room)
      .sort((a, b) => a.d - b.d)[0];
    if (!target) {
      g.push(p);
      break;
    }
    groups[target.i].push(p);
  }
  return groups.filter((g) => g.length);
}

/** Longer trips spread out: up to 4 stops a day for short trips, 3 for 4–6 days, 2 for a week or more. */
export const stopsPerDay = (days: number) => (days >= 7 ? 2 : days >= 4 ? 3 : 4);

/** "1-day trip", "5-day trip", "1-week trip", "2-week trip". */
export const tripTitle = (days: number) => (days % 7 === 0 ? `${days / 7}-week trip` : `${days}-day trip`);

export const planTrip: PlanTrip = async (input, deps) => {
  const { places: names, days, origin, needs, date, offset, startLabel } = input;

  // 1. Find each place (top search result near where they're staying).
  const found = await Promise.all(
    names.map(async (name) => ({ name, place: (await deps.findCandidates({ category: "place", query: name }, origin, needs, date))[0] })),
  );
  const notFound = found.filter((f) => !f.place).map((f) => f.name);
  const byId = new Map<string, { name: string; place: Place }>();
  for (const f of found) if (f.place && !byId.has(f.place.id)) byId.set(f.place.id, { name: f.name, place: { ...f.place, category: f.place.kind ?? "Place" } });

  // 2. Leave out what is confirmed not accessible; keep unknowns (marked "call ahead" by the solver).
  const all = [...byId.values()];
  const leftOut = all.filter((x) => x.place.overall === "no").map((x) => ({ place: x.place, reason: "Entrance is not wheelchair accessible" }));
  const usable = all.filter((x) => x.place.overall !== "no");

  // 3. Days: fewer stops per day on a longer trip.
  const cap = stopsPerDay(days);
  const k = Math.min(days, Math.max(1, Math.ceil(usable.length / cap)));
  const groups = clusterDays(usable.map((x) => ({ ...x, location: x.place.location })), k, days === 1 ? usable.length : cap);

  // 4. Plan each day with the normal solver; hours are re-read for that day's date.
  // Each stop is pinned to the place the user picked, so re-planning (+ / −, Start at, events)
  // works on trip days exactly like on Today.
  const dayPlans = await Promise.all(
    groups.map(async (g, i) => {
      const day = addDays(date, i);
      const plan = await solve(
        {
          wants: g.map((x) => ({ category: x.place.category, query: x.name, placeId: x.place.id })),
          start: `${day}T${DAY_START}:00${offset}`,
          end: `${day}T${DAY_END}:00${offset}`,
          origin,
          home: origin,
          needs,
          startLabel,
        },
        deps,
      );
      return { date: day, plan };
    }),
  );

  const title = tripTitle(days);
  const trip: Trip = { id: crypto.randomUUID(), title, input, dayPlans, leftOut, notFound, freeDays: Math.max(0, days - dayPlans.length) };
  return trip;
};

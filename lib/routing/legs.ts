// buildLeg(): one accessible (or, for Compare, fastest) leg between two points. Owner: A.
import type { BuildLeg, Deps, Endpoint, LegOpts } from "../contracts";
import { hasKey } from "../http";
import { log } from "../log";
import { ROLL_LIMIT_M, addMin, meters, rollMinutes } from "../planner/geo";
import type { LatLng, Leg, LegStep, Needs, Stop } from "../types";
import { rollRoute } from "./roll";
import { stopAccess } from "./stops";
import { type TransitRoute, transitRoutes } from "./transit";

const loc = (e: Endpoint): LatLng => ("location" in e ? e.location : { lat: e.lat, lng: e.lng });

/** A leg is unusable for a wheelchair user if any stop is not step-free or its elevator is out. */
export const legProblems = (leg: Leg) =>
  leg.stops.filter((s) => s.wheelchair === "no" || s.elevatorOut).length +
  leg.issues.filter((i) => i.startsWith("No step-free")).length;

async function rollLeg(from: Endpoint, to: Endpoint, departAt: string, needs: Needs, deps: Deps): Promise<Leg> {
  const a = loc(from);
  const b = loc(to);
  let minutes = rollMinutes(a, b);
  let polyline = "";
  const issues: string[] = [];
  if (hasKey("ORS_API_KEY")) {
    try {
      const r = await rollRoute(a, b, needs, deps.cached);
      minutes = r.minutes;
      polyline = r.polyline;
    } catch {
      issues.push("No step-free sidewalk route found");
    }
  } else issues.push("Sidewalk route not checked");
  return {
    fromId: from.id,
    toId: to.id,
    mode: "roll",
    departAt,
    arriveAt: addMin(departAt, minutes),
    minutes,
    polyline,
    stops: [],
    issues,
    steps: [{ kind: "roll", minutes }],
  };
}

/** Roll → ride → roll, in order. A roll's `to` is the stop it leads to (none = the destination). Exported for tests. */
export function stepsOf(route: TransitRoute): LegStep[] {
  const steps: LegStep[] = [];
  route.segments.forEach((s, i) => {
    if (s.kind === "walk") {
      const next = route.segments.slice(i + 1).find((n) => n.kind === "transit");
      steps.push({ kind: "roll", minutes: s.minutes, to: next?.kind === "transit" ? next.board.name : undefined });
    } else steps.push({ kind: s.vehicle, minutes: s.minutes, line: s.line || undefined, from: s.board.name, to: s.alight.name });
  });
  return steps;
}

/** Turn one Google transit route into a Leg with every stop checked. */
async function annotate(
  route: TransitRoute,
  from: Endpoint,
  to: Endpoint,
  departAt: string,
  needs: Needs,
  deps: Deps,
  opts: LegOpts,
): Promise<Leg> {
  const stops: Stop[] = [];
  let rail = false;
  for (const seg of route.segments) {
    if (seg.kind !== "transit") continue;
    rail ||= seg.vehicle === "rail";
    for (const ref of [seg.board, seg.alight]) {
      if (stops[stops.length - 1]?.name === ref.name) continue; // transfer at the same stop
      stops.push({ name: ref.name, location: ref.location, wheelchair: "unknown" });
    }
  }
  const [access, outages, reliability] = await Promise.all([
    Promise.all(stops.map((s) => stopAccess(s.name, s.location, deps.cached))),
    deps.getElevatorOutages(stops).catch(() => new Set<string>()),
    deps.getReliability(stops.map((s) => s.name)).catch(() => ({}) as Record<string, number>),
  ]);
  const blocked = new Set(opts.blockedStops ?? []);
  stops.forEach((s, i) => {
    s.wheelchair = access[i];
    if (outages.has(s.name) || blocked.has(s.name)) s.elevatorOut = true;
    if (reliability[s.name] != null) s.reliability = reliability[s.name];
  });

  const issues: string[] = [];
  for (const s of stops) if (s.reliability != null && s.reliability < 0.8) issues.push(`${s.name}: elevator often out`);

  // Accessible mode: the walking parts must be step-free too (checked with ORS when we have a key).
  if (opts.accessible !== false && hasKey("ORS_API_KEY")) {
    const walks = route.segments.filter((s) => s.kind === "walk" && s.minutes >= 3).slice(0, 2);
    for (const w of walks) {
      if (w.kind !== "walk") continue;
      try {
        await rollRoute(w.from, w.to, needs, deps.cached);
      } catch {
        issues.push("No step-free path to the stop");
      }
    }
  }

  return {
    fromId: from.id,
    toId: to.id,
    mode: stops.length ? (rail ? "rail" : "bus") : "roll",
    departAt,
    arriveAt: addMin(departAt, route.minutes),
    minutes: route.minutes,
    polyline: route.polyline,
    stops,
    issues,
    steps: stepsOf(route),
  };
}

export const buildLeg: BuildLeg = async (from, to, departAt, needs, deps, opts = {}) => {
  const a = loc(from);
  const b = loc(to);
  if (meters(a, b) * 1.3 <= ROLL_LIMIT_M) return rollLeg(from, to, departAt, needs, deps);

  const routes = await transitRoutes(a, b, departAt, deps.cached);
  log("routes", `${from.id.slice(0, 12)} → ${to.id.slice(0, 12)}: ${routes.length} transit option(s)`);
  if (!routes.length) {
    // No transit: roll if it's still a reasonable distance, otherwise say so.
    const leg = await rollLeg(from, to, departAt, needs, deps);
    if (leg.minutes > 45) leg.issues.push("No transit route found");
    return leg;
  }

  if (opts.accessible === false) return annotate(routes[0], from, to, departAt, needs, deps, opts);

  // Accessible: first alternative with no problems, else the one with the fewest.
  let best: Leg | null = null;
  for (const r of routes.slice(0, 3)) {
    const leg = await annotate(r, from, to, departAt, needs, deps, opts);
    if (legProblems(leg) === 0) return leg;
    if (!best || legProblems(leg) < legProblems(best)) best = leg;
  }
  return best!;
};

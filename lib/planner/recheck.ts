// recheckDay(): re-run a planned day against fresh data (hours for that date, elevator outages,
// reports, routes) and say in plain words what changed. The user's choices stay: every stop is
// pinned to its place, so only times, routes and access can move. Owner: A.
import type { Deps } from "../contracts";
import type { Leg, Plan } from "../types";
import { before, diffMin } from "./geo";
import { replan } from "./events";
import { solve } from "./solve";

const SHIFT_MIN = 15; // smaller time moves aren't worth a line
const MAX_LINES = 6;

/** "2:15 PM" from the wall clock in the ISO string (the place's own time zone). */
export function clock(iso: string): string {
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
}

const rides = (l?: Leg) =>
  (l?.steps ?? []).filter((s) => s.kind !== "roll").map((s) => `${s.kind === "bus" ? "bus" : "train"}${s.line ? ` ${s.line}` : ""}`);
const howTo = (l?: Leg) => (l ? (rides(l).join(" then ") || (l.mode === "roll" ? "roll" : l.mode)) : "");

/** Plain-language differences between the old and the re-checked day. Pure; exported for tests. */
export function planChanges(prev: Plan, next: Plan): string[] {
  const out: string[] = [];
  const name = (id: string) => next.places[id]?.name ?? prev.places[id]?.name ?? "A stop";
  const nextStops = new Map(next.stops.map((s) => [s.placeId, s]));
  const prevStops = new Map(prev.stops.map((s) => [s.placeId, s]));
  const legTo = (p: Plan, id: string) => p.legs.find((l) => l.toId === id);

  for (const s of prev.stops)
    if (!nextStops.has(s.placeId)) out.push(`${name(s.placeId)} can’t be planned for this day any more. It may be closed, or someone reported it isn’t accessible.`);
  for (const s of next.stops) if (!prevStops.has(s.placeId)) out.push(`${name(s.placeId)} was added.`);

  for (const s of next.stops) {
    const p = prevStops.get(s.placeId);
    if (!p) continue;
    const n = name(s.placeId);
    const fresh = s.reasons.filter((r) => !p.reasons.includes(r) && !/^Planned for/.test(r));
    if (s.status !== p.status && s.status === "bad") out.push(`${n}: ${s.reasons[0] ?? "now has a problem"}.`);
    else if (s.status !== p.status && s.status === "ok") out.push(`${n} is now confirmed step-free.`);
    else if (fresh.length) out.push(`${n}: ${fresh[0]}.`);
    const moved = diffMin(p.arrive, s.arrive);
    if (Math.abs(moved) >= SHIFT_MIN) out.push(`${n} is now at ${clock(s.arrive)} (was ${clock(p.arrive)}).`);

    const a = legTo(prev, s.placeId);
    const b = legTo(next, s.placeId);
    if (a && b && howTo(a) !== howTo(b)) out.push(`Getting to ${n}: ${howTo(b)} instead of ${howTo(a)}.`);
    const newIssues = (b?.issues ?? []).filter((i) => !(a?.issues ?? []).includes(i));
    if (newIssues.length) out.push(`Getting to ${n}: ${newIssues[0]}.`);
  }

  const back = (p: Plan) => p.legs.find((l) => l.toId === "home");
  const ba = back(prev);
  const bb = back(next);
  if (ba && bb && howTo(ba) !== howTo(bb)) out.push(`Getting back: ${howTo(bb)} instead of ${howTo(ba)}.`);
  if (Math.abs(diffMin(prev.endAt, next.endAt)) >= SHIFT_MIN) out.push(`You’d be back at ${clock(next.endAt)} (was ${clock(prev.endAt)}).`);

  return [...new Set(out)].slice(0, MAX_LINES);
}

/**
 * Re-check a day. Before it starts: plan it again from scratch with the same pinned stops.
 * Once it has started: keep the finished part and re-plan the rest from now.
 */
export async function recheckDay(plan: Plan, now: string, deps: Deps): Promise<{ plan: Plan; changes: string[] }> {
  const next = before(now, plan.request.start)
    ? await solve(plan.request, deps, { constraints: plan.constraints })
    : await replan(plan, { type: "late", minutes: 0 }, now, deps);
  return { plan: next, changes: planChanges(plan, next) };
}

// The live day as a few big moments: get to a place (all its rides and rolls in one card),
// stay there, … get back. Inside a journey the current step is worked out from GPS or the clock,
// so the user taps once per place, not once per two-minute step. Pure helpers, exported for tests.
import { meters } from "@/lib/planner/geo";
import type { LatLng, Leg, LegStep, Plan } from "@/lib/types";
import { legSteps } from "./LegRow";

export type Part = { step: LegStep; start: string; end: string; target?: LatLng };
export type LiveItem =
  | { kind: "go"; leg: Leg; parts: Part[]; toName: string; target: LatLng; start: string; end: string }
  | { kind: "stay"; placeId: string; name: string; arrive: string; depart: string; location: LatLng }
  | { kind: "end"; at: string; name: string; location: LatLng };

const addMinIso = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60000).toISOString();

export function liveItems(plan: Plan, endName: string): LiveItem[] {
  const items: LiveItem[] = [];
  const legTo = (id: string) => plan.legs.find((l) => l.toId === id);
  const pushLeg = (toId: string, toName: string, dest: LatLng) => {
    const leg = legTo(toId);
    if (!leg) return;
    const steps = legSteps(leg);
    let t = leg.departAt;
    const parts = steps.map((step, i): Part => {
      const last = i === steps.length - 1;
      const end = last ? leg.arriveAt : addMinIso(t, step.minutes);
      // Where this step ends: the stop you roll to / get off at, or the destination itself.
      const stop = step.to ? leg.stops.find((s) => s.name === step.to) : undefined;
      const part = { step, start: t, end, target: last ? dest : stop?.location };
      t = end;
      return part;
    });
    items.push({ kind: "go", leg, parts, toName, target: dest, start: leg.departAt, end: leg.arriveAt });
  };
  for (const s of plan.stops) {
    const p = plan.places[s.placeId];
    if (!p) continue;
    pushLeg(s.placeId, p.name, p.location);
    items.push({ kind: "stay", placeId: s.placeId, name: p.name, arrive: s.arrive, depart: s.depart, location: p.location });
  }
  pushLeg("home", endName, plan.request.home);
  items.push({ kind: "end", at: plan.endAt, name: endName, location: plan.request.home });
  return items;
}

/** Where to pick up: the journey to the first stop not yet visited (or the way back once all are). */
export function startIndex(items: LiveItem[], visited: Set<string>): number {
  const next = items.findIndex((it) => it.kind === "stay" && !visited.has(it.placeId));
  const i = next >= 0 ? next : items.length - 1;
  return i > 0 && items[i - 1].kind === "go" ? i - 1 : i;
}

/** The sentence for one step. */
export function moveText(step: LegStep, toName: string): string {
  if (step.kind === "roll") return `Roll ${step.minutes} min to ${step.to ?? toName}`;
  const what = `${step.kind === "bus" ? "bus" : "train"}${step.line ? ` ${step.line}` : ""}`;
  return `Take the ${what}${step.from ? ` from ${step.from}` : ""}${step.to ? ` to ${step.to}` : ""}`;
}

/** "Bus B43, then roll 4 min" — the whole journey in a few words. */
export function journeySummary(parts: Part[]): string {
  return parts
    .map(({ step }) => (step.kind === "roll" ? `roll ${step.minutes} min` : `${step.kind === "bus" ? "bus" : "train"}${step.line ? ` ${step.line}` : ""}`))
    .join(", then ")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Scheduled end of an item: when you should be moving on. */
export const itemEnd = (it: LiveItem) => (it.kind === "go" ? it.end : it.kind === "stay" ? it.depart : it.at);

/** Minutes behind schedule at `now` (0 if on time). */
export const minutesBehind = (it: LiveItem, now: number) => Math.max(0, Math.round((now - Date.parse(itemEnd(it))) / 60000));

/** Close enough to say "you're here": 60 m, or the GPS accuracy if that's worse (capped). */
export function isNear(me: LatLng & { accuracy?: number }, target?: LatLng, radius = 60): boolean {
  if (!target) return false;
  return meters(me, target) <= Math.min(Math.max(150, radius), Math.max(radius, me.accuracy ?? 0));
}

/**
 * Which step of a journey you're on, without taps. `reached` = steps GPS has seen you finish
 * (you were at their end point). Without GPS, on the day itself, the clock decides.
 */
export function activePart(parts: Part[], reached: number, now: number, useClock: boolean): number {
  let byClock = 0;
  if (useClock) {
    const i = parts.findIndex((p) => now < Date.parse(p.end));
    byClock = i < 0 ? parts.length - 1 : i;
  }
  return Math.min(parts.length - 1, Math.max(reached, byClock));
}

/** Steps whose end point you're at right now; GPS progress only moves forward. */
export function reachedParts(parts: Part[], me: LatLng & { accuracy?: number }, already: number): number {
  let r = already;
  parts.forEach((p, i) => {
    if (i >= r && i < parts.length - 1 && isNear(me, p.target)) r = i + 1;
  });
  return r;
}

/** On a ride, nearing the stop to get off at (about one stop away). */
export const nearingStop = (part: Part | undefined, me: LatLng | null) =>
  Boolean(part && me && part.step.kind !== "roll" && part.target && meters(me, part.target) <= 400);

/** The next moment you have to do something, so you can put the phone away until then. */
export function nextAction(parts: Part[], active: number, toName: string): { text: string; at: string } {
  const p = parts[active];
  if (!p) return { text: `Arrive at ${toName}`, at: "" };
  if (p.step.kind === "roll") {
    const ride = parts[active + 1];
    return ride && ride.step.kind !== "roll"
      ? { text: `Board the ${ride.step.kind === "bus" ? "bus" : "train"}${ride.step.line ? ` ${ride.step.line}` : ""}${ride.step.from ? ` at ${ride.step.from}` : ""}`, at: ride.start }
      : { text: `Arrive at ${toName}`, at: p.end };
  }
  return { text: `Get off at ${p.step.to ?? "your stop"}`, at: p.end };
}

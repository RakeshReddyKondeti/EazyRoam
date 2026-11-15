// makePlan(): choose one place per want and the order, then schedule real legs. Owner: A.
import type { BuildLeg, Deps, Endpoint, MakePlan } from "../contracts";
import { buildLeg as realBuildLeg, legProblems } from "../routing/legs";
import type { Leg, Place, Plan, PlanStop, Request, Want } from "../types";
import { addMin, before, diffMin, maxIso, roughMinutes, visitMinutes } from "./geo";

export type SolveOpts = {
  constraints?: Plan["constraints"];
  /** false = "normal map app" (Compare): top result per want, user's order, fastest legs. */
  accessible?: boolean;
  /** Already-visited part of the day, kept as is (replan). */
  prefix?: { stops: PlanStop[]; legs: Leg[]; places: Record<string, Place> };
  /** When and where the remaining day starts (replan). Defaults: req.start, req.origin. */
  startAt?: string;
  from?: Endpoint;
};

const TOP_PLANS = 3;
const CANDIDATES_PER_WANT = 3;
const MAX_PERMUTE = 5;

const fmt = (iso: string) => {
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
};

/** Opening window that contains `t`, or the next one after it. null = closed for the rest of the day. */
export function windowFor(place: Place, t: string): { open: string; close: string } | "unlisted" | null {
  if (!place.hours.length) return "unlisted";
  const sorted = [...place.hours].sort((a, b) => Date.parse(a.open) - Date.parse(b.open));
  return sorted.find((w) => before(t, w.close)) ?? null;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

function product<T>(lists: T[][]): T[][] {
  return lists.reduce<T[][]>((acc, l) => acc.flatMap((a) => l.map((x) => [...a, x])), [[]]);
}

type Visit = { arrive: string; depart: string; reasons: string[]; late: boolean };

/** Arrival at `t`: wait for opening, check the visit fits before closing. */
function visit(place: Place, t: string): Visit {
  const len = visitMinutes(`${place.category} ${place.kind ?? ""}`);
  const w = windowFor(place, t);
  if (w === "unlisted") return { arrive: t, depart: addMin(t, len), reasons: ["Opening hours not listed"], late: false };
  if (!w) return { arrive: t, depart: addMin(t, len), reasons: ["Closed by the time you arrive"], late: true };
  const arrive = maxIso(t, w.open);
  const depart = addMin(arrive, len);
  const reasons: string[] = [];
  if (before(t, w.open)) reasons.push(`Opens at ${fmt(w.open)}`);
  const late = before(w.close, depart);
  if (late) reasons.push(`Closes at ${fmt(w.close)}, ${diffMin(arrive, w.close)} min after you arrive`);
  return { arrive, depart, reasons, late };
}

function accessStatus(p: Place, req: Request, accessible: boolean): { status: PlanStop["status"]; reasons: string[] } {
  if (p.overall === "no") return { status: "bad", reasons: ["Not wheelchair accessible"] };
  if (req.needs.restroom && p.access.restroom === "no")
    return { status: accessible ? "unknown" : "bad", reasons: ["Restroom is not accessible"] };
  if (p.overall === "unknown")
    return { status: "unknown", reasons: [accessible ? "No accessibility data for this place." : "Accessibility not checked"] };
  if (p.overall === "limited") return { status: "unknown", reasons: ["Partly accessible"] };
  return { status: "ok", reasons: [] };
}

type Choice = { order: Want[]; places: Place[] };

/** Rank choices by rough travel time + hours before spending any routing calls. */
function roughScore(c: Choice, startAt: string, from: Endpoint, req: Request): number {
  let t = startAt;
  let pos = "location" in from ? from.location : from;
  let score = 0;
  for (const p of c.places) {
    const travel = roughMinutes(pos, p.location);
    const v = visit(p, addMin(t, travel));
    score += travel + diffMin(addMin(t, travel), v.arrive) * 0.5 + (v.late ? 500 : 0);
    if (p.overall !== "yes") score += 30;
    t = v.depart;
    pos = p.location;
  }
  const end = addMin(t, roughMinutes(pos, req.home));
  if (before(req.end, end)) score += 300;
  return score;
}

export async function solve(req: Request, deps: Deps, o: SolveOpts = {}): Promise<Plan> {
  const accessible = o.accessible !== false;
  const excluded = new Set(o.constraints?.excludedPlaceIds ?? []);
  const blockedStops = o.constraints?.blockedStops ?? [];
  const build: BuildLeg = deps.buildLeg ?? realBuildLeg;
  const startAt = o.startAt ?? req.start;
  const from: Endpoint = o.from ?? { id: "home", ...req.origin };
  const homeEnd: Endpoint = { id: "home", ...req.home };
  const date = startAt.slice(0, 10);

  // 1. Candidates per want.
  const raw = await Promise.all(req.wants.map((w) => deps.findCandidates(w, req.origin, req.needs, date)));
  const missing: string[] = [];
  const pools: Place[][] = [];
  const wants: Want[] = [];
  raw.forEach((list, i) => {
    const usable = accessible
      ? list.filter((p) => p.overall !== "no" && !excluded.has(p.id)).slice(0, CANDIDATES_PER_WANT)
      : list.slice(0, 1);
    if (usable.length) {
      pools.push(usable);
      wants.push(req.wants[i]);
    } else missing.push(req.wants[i].category);
  });

  // 2. Every venue choice × order (user's order only for Compare or long lists), ranked roughly.
  const idx = wants.map((_, i) => i);
  const orders = !accessible || idx.length > MAX_PERMUTE ? [idx] : permutations(idx);
  const choices: Choice[] = [];
  for (const order of orders)
    for (const pick of product(order.map((i) => pools[i])))
      if (new Set(pick.map((p) => p.id)).size === pick.length) choices.push({ order: order.map((i) => wants[i]), places: pick });
  const ranked = choices
    .map((c) => ({ c, s: roughScore(c, startAt, from, req) }))
    .sort((a, b) => a.s - b.s)
    .slice(0, accessible ? TOP_PLANS : 1);

  // 3. Real legs for the best few, memoised within this call.
  const memo = new Map<string, Promise<Leg>>();
  const leg = (a: Endpoint, b: Endpoint, at: string) => {
    const k = `${a.id}>${b.id}@${at.slice(0, 15)}`; // 10-minute bucket
    if (!memo.has(k)) memo.set(k, build(a, b, at, req.needs, deps, { accessible, blockedStops }));
    return memo.get(k)!.then((l) => ({ ...l, departAt: at, arriveAt: addMin(at, l.minutes) }));
  };

  const prefix = o.prefix ?? { stops: [], legs: [], places: {} };
  const plans = await Promise.all(
    ranked.map(async ({ c }) => {
      const stops: PlanStop[] = [...prefix.stops];
      const legs: Leg[] = [...prefix.legs];
      const places: Record<string, Place> = { ...prefix.places };
      let t = startAt;
      let pos = from;
      let unknowns = 0;
      let problems = 0;
      for (const p of c.places) {
        const l = await leg(pos, p, t);
        legs.push(l);
        problems += legProblems(l);
        const v = visit(p, l.arriveAt);
        const a = accessStatus(p, req, accessible);
        let status = a.status;
        if (v.late) status = "bad";
        if (status === "bad") problems++;
        if (status === "unknown") unknowns++;
        const backup =
          status !== "ok" && accessible
            ? pools[wants.indexOf(c.order[c.places.indexOf(p)])]?.find(
                (q) => q.id !== p.id && q.overall === "yes" && !c.places.some((x) => x.id === q.id),
              )
            : undefined;
        places[p.id] = p;
        if (backup) places[backup.id] = backup;
        stops.push({ placeId: p.id, arrive: v.arrive, depart: v.depart, status, reasons: [...a.reasons, ...v.reasons], backupId: backup?.id });
        t = v.depart;
        pos = p;
      }
      const last = await leg(pos, homeEnd, t);
      legs.push(last);
      problems += legProblems(last);
      const endAt = last.arriveAt;
      if (before(req.end, endAt)) problems++;
      const minutes = diffMin(startAt, endAt);
      const plan: Plan = {
        id: crypto.randomUUID(),
        request: req,
        places,
        stops,
        legs,
        endAt,
        problems,
        constraints: { excludedPlaceIds: [...excluded], blockedStops },
      };
      if (missing.length) plan.explanation = `Couldn’t find an accessible ${missing.join(" or ")} nearby.`;
      if (before(req.end, endAt)) plan.explanation = [plan.explanation, `You’d be home at ${fmt(endAt)}, after ${fmt(req.end)}.`].filter(Boolean).join(" ");
      return { plan, score: minutes + 30 * unknowns + 200 * problems };
    }),
  );

  if (!plans.length) {
    return {
      id: crypto.randomUUID(),
      request: req,
      places: prefix.places,
      stops: prefix.stops,
      legs: prefix.legs,
      endAt: startAt,
      problems: missing.length,
      explanation: `Couldn’t find an accessible ${missing.join(" or ")} nearby.`,
      constraints: { excludedPlaceIds: [...excluded], blockedStops },
    };
  }
  plans.sort((a, b) => a.score - b.score);
  return plans[0].plan;
}

export const makePlan: MakePlan = (req, deps, constraints) => solve(req, deps, { constraints });

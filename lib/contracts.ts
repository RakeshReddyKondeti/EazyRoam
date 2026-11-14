// Shared contract: PLAN.md §3. Who implements what, as TypeScript types.
// A: lib/planner + lib/routing · B: lib/data + lib/db · C: lib/ai
import type { Event, LatLng, Leg, Needs, Place, Plan, Request, Stop, Want } from "./types";

// ---- B implements (lib/data, lib/db) ----
/** Ranked candidates for one want (relevance order, NOT filtered by access). Hours are for `date`. */
export type FindCandidates = (want: Want, near: LatLng, needs: Needs, date: string) => Promise<Place[]>;
/** Names of stops whose elevator is out right now. */
export type GetElevatorOutages = (stops: Stop[]) => Promise<Set<string>>;
/** Cache wrapper (Atlas, or in-memory without MONGODB_URI). */
export type Cached = <T>(key: string, ttlSec: number, fn: () => Promise<T>) => Promise<T>;
export type Report = { placeId?: string; stopName?: string; kind: string };
export type AddReport = (r: Report) => Promise<void>;
/** Report kinds per place id from the last 24 hours. */
export type GetReports = (placeIds: string[]) => Promise<Record<string, string[]>>;
export type RecordEvent = (e: { kind: string; subject: string; at: Date }) => Promise<void>;
/** 0..1 per stop name; missing = no history. */
export type GetReliability = (stopNames: string[]) => Promise<Record<string, number>>;
export type Geocode = (q: string) => Promise<LatLng & { label: string }>;

// ---- A implements (lib/planner, lib/routing) ----
export type LegOpts = {
  /** false = "normal map app": take the fastest route, still annotate problems. Default true. */
  accessible?: boolean;
  /** Stop names the user reported as unusable (elevator out). */
  blockedStops?: string[];
};
export type Endpoint = Place | (LatLng & { id: string });
export type BuildLeg = (
  from: Endpoint,
  to: Endpoint,
  departAt: string,
  needs: Needs,
  deps: Deps,
  opts?: LegOpts,
) => Promise<Leg>;
export type MakePlan = (req: Request, deps: Deps, constraints?: Plan["constraints"]) => Promise<Plan>;
export type Replan = (plan: Plan, event: Event, now: string, deps: Deps) => Promise<Plan>;
export type ComparePlan = (req: Request, deps: Deps) => Promise<Plan>;

// ---- C implements (lib/ai) ----
export type ParseCtx = { date: string; offset: string }; // "2026-11-14", "-05:00"
export type ParseRequest = (
  text: string,
  needs: Needs,
  origin: LatLng,
  home: LatLng,
  ctx: ParseCtx,
) => Promise<Request>;
export type ExplainChange = (before: Plan, after: Plan, event: Event) => Promise<string>;

/** The B functions A needs, injected so tests can pass fakes. `buildLeg` overrides real routing. */
export type Deps = {
  findCandidates: FindCandidates;
  getElevatorOutages: GetElevatorOutages;
  getReliability: GetReliability;
  getReports: GetReports;
  cached: Cached;
  buildLeg?: BuildLeg;
};

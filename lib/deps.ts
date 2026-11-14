// The real Deps the API routes pass to the planner (PLAN.md §3).
import type { Deps } from "./contracts";
import { getElevatorOutages } from "./data/outages";
import { findCandidates } from "./data/places";
import { cached } from "./db/cache";
import { getReports } from "./db/reports";
import { getReliability } from "./db/tiger";

export const realDeps: Deps = {
  findCandidates,
  getElevatorOutages,
  getReliability: (names) => getReliability(names).catch(() => ({})),
  getReports,
  cached,
};

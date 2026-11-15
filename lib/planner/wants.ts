// Pure helpers shared by the planner and the UI (no server imports).
import type { Plan, Want } from "../types";

/** Index of the want a planned place came from: the pinned place first, else the first want of its category. */
export function wantFor(plan: Plan, wants: Want[], placeId: string): number {
  const pinned = wants.findIndex((w) => w.placeId === placeId);
  if (pinned >= 0) return pinned;
  const cat = plan.places[placeId]?.category;
  return wants.findIndex((w) => !w.placeId && w.category === cat);
}

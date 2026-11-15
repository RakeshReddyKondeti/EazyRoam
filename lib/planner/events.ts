// replan(): apply one change and re-solve the rest of the day from `now`. Owner: A.
import type { Replan } from "../contracts";
import type { Place, Want } from "../types";
import { addMin, before, maxIso } from "./geo";
import { solve } from "./solve";
import { wantFor } from "./wants";

export { wantFor };

export const replan: Replan = async (plan, event, now, deps) => {
  const excluded = new Set(plan.constraints?.excludedPlaceIds ?? []);
  const blocked = new Set(plan.constraints?.blockedStops ?? []);
  let wants: Want[] = [...plan.request.wants];
  let start = plan.request.start;
  let end = plan.request.end;

  switch (event.type) {
    case "rampBlocked":
      excluded.add(event.placeId);
      break;
    case "elevatorOut":
      blocked.add(event.stopName);
      break;
    case "late":
      start = addMin(maxIso(plan.request.start, now), event.minutes);
      break;
    case "addStop":
      wants = [...wants, { category: event.category, query: event.category }];
      break;
    case "setDay": {
      // Same date and offset, new wall-clock times.
      const at = (iso: string, hm?: string) => (hm && /^\d{2}:\d{2}$/.test(hm) ? `${iso.slice(0, 11)}${hm}:00${iso.slice(19)}` : iso);
      start = at(plan.request.start, event.start);
      end = at(plan.request.end, event.end);
      break;
    }
    case "setStay":
    case "setTime": {
      const i = wantFor(plan, wants, event.placeId);
      if (i < 0) break;
      const w = { ...wants[i], placeId: event.placeId }; // keep the venue the user adjusted
      if (event.type === "setStay") w.minutes = Math.max(5, Math.min(600, Math.round(event.minutes)));
      else if (event.at) w.at = event.at;
      else delete w.at;
      wants = wants.map((x, j) => (j === i ? w : x));
      break;
    }
  }

  // Stops already finished stay as they are; their wants are done. On a live day the user says
  // which stops they've visited (the leading run of them); otherwise the schedule decides.
  const visited = event.type === "late" && event.done ? new Set(event.done) : null;
  const firstNotDone = visited ? plan.stops.findIndex((s) => !visited.has(s.placeId)) : -1;
  const doneStops = visited
    ? plan.stops.slice(0, firstNotDone < 0 ? plan.stops.length : firstNotDone)
    : plan.stops.filter((s) => !before(now, s.depart));
  const doneIds = new Set(doneStops.map((s) => s.placeId));
  const remaining = [...wants];
  for (const s of doneStops) {
    const cat = plan.places[s.placeId]?.category;
    const i = remaining.findIndex((w) => w.category === cat);
    if (i >= 0) remaining.splice(i, 1);
  }
  const doneLegs = plan.legs.filter((l) => doneIds.has(l.toId));
  const donePlaces: Record<string, Place> = {};
  for (const id of doneIds) if (plan.places[id]) donePlaces[id] = plan.places[id];

  const last = doneStops[doneStops.length - 1];
  const lastPlace = last ? plan.places[last.placeId] : undefined;
  const request = { ...plan.request, wants, start, end };
  const startAt = last
    ? event.type === "late"
      ? addMin(maxIso(last.depart, now), event.minutes)
      : maxIso(last.depart, now)
    : event.type === "late"
      ? start
      : maxIso(start, now);

  // "Re-plan from where I am": the rest of the day starts at the user's location, now.
  const here = event.type === "late" && event.from ? { id: "here", ...event.from } : undefined;

  return solve({ ...request, wants: remaining }, deps, {
    constraints: { excludedPlaceIds: [...excluded], blockedStops: [...blocked] },
    prefix: { stops: doneStops, legs: doneLegs, places: donePlaces },
    startAt: here ? addMin(now, event.type === "late" ? event.minutes : 0) : startAt,
    from: here ?? lastPlace,
  }).then((p) => ({ ...p, request }));
};

// replan(): apply one change and re-solve the rest of the day from `now`. Owner: A.
import type { Replan } from "../contracts";
import type { Place, Want } from "../types";
import { addMin, before, maxIso } from "./geo";
import { solve } from "./solve";

export const replan: Replan = async (plan, event, now, deps) => {
  const excluded = new Set(plan.constraints?.excludedPlaceIds ?? []);
  const blocked = new Set(plan.constraints?.blockedStops ?? []);
  let wants: Want[] = [...plan.request.wants];
  let start = plan.request.start;

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
  }

  // Stops already finished stay as they are; their wants are done.
  const doneStops = plan.stops.filter((s) => !before(now, s.depart));
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
  const request = { ...plan.request, wants, start };
  const startAt = last
    ? event.type === "late"
      ? addMin(maxIso(last.depart, now), event.minutes)
      : maxIso(last.depart, now)
    : event.type === "late"
      ? start
      : maxIso(start, now);

  return solve({ ...request, wants: remaining }, deps, {
    constraints: { excludedPlaceIds: [...excluded], blockedStops: [...blocked] },
    prefix: { stops: doneStops, legs: doneLegs, places: donePlaces },
    startAt,
    from: lastPlace,
  }).then((p) => ({ ...p, request }));
};

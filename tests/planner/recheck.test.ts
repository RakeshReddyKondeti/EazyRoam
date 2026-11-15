import { describe, expect, it } from "vitest";
import { makePlan, planChanges, recheckDay, replan } from "@/lib/planner";
import { queryDeparture } from "@/lib/routing/transit";
import type { Place } from "@/lib/types";
import { PLACES, REQUEST, at, fakeDeps } from "./fakes";

const request = { ...REQUEST, wants: [{ category: "lunch" }, { category: "museum" }] };
const before = at("08:00");

describe("recheckDay (a trip planned weeks ago, checked again before the day)", () => {
  it("nothing changed → no lines, same stops", async () => {
    const plan = await makePlan(request, fakeDeps());
    const r = await recheckDay(plan, before, fakeDeps());
    expect(r.changes).toEqual([]);
    expect(r.plan.stops.map((s) => s.placeId)).toEqual(plan.stops.map((s) => s.placeId));
  });

  it("the museum now closes early → says so in plain words", async () => {
    const plan = await makePlan(request, fakeDeps());
    const early: Place = { ...PLACES.museum[0], hours: [{ open: at("10:00"), close: at("12:30") }] };
    const deps = fakeDeps({ findCandidates: async (w) => (w.category === "museum" ? [early] : (PLACES[w.category] ?? [])) });
    const r = await recheckDay(plan, before, deps);
    expect(r.changes.join(" ")).toMatch(/art-museum: (Closes at 12:30 PM|Closed by the time you arrive)/);
  });

  it("a place reported inaccessible since → it can't be planned any more", async () => {
    const plan = await makePlan(request, fakeDeps());
    const deps = fakeDeps({ findCandidates: async (w) => (w.category === "museum" ? [{ ...PLACES.museum[0], overall: "no" as const }] : (PLACES[w.category] ?? [])) });
    const r = await recheckDay(plan, before, deps);
    expect(r.plan.stops.some((s) => s.placeId === "art-museum")).toBe(false);
    expect(r.changes.some((c) => /art-museum can’t be planned/.test(c))).toBe(true);
  });

  it("a new elevator outage on the route is listed", async () => {
    const plan = await makePlan(request, fakeDeps());
    const next = await replan(plan, { type: "elevatorOut", stopName: "Pulaski Park" }, before, fakeDeps());
    const lines = planChanges(plan, next);
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(new Set(lines).size).toBe(lines.length);
  });
});

describe("live day: re-plan from where I am", () => {
  it("keeps visited stops and starts the rest from the user's location, now", async () => {
    const plan = await makePlan(request, fakeDeps());
    const first = plan.stops[0].placeId;
    const now = at("13:00");
    const here = { lat: 42.32, lng: -72.63 };
    const next = await replan(plan, { type: "late", minutes: 0, done: [first], from: here }, now, fakeDeps());
    expect(next.stops[0]).toEqual(plan.stops[0]); // visited stop kept as is
    const leg = next.legs.find((l) => l.fromId === "here");
    expect(leg).toBeTruthy();
    expect(Date.parse(leg!.departAt)).toBe(Date.parse(now));
  });

  it("nothing visited yet but the schedule has passed → nothing is treated as done", async () => {
    const plan = await makePlan(request, fakeDeps());
    const next = await replan(plan, { type: "late", minutes: 0, done: [] }, at("16:30"), fakeDeps());
    expect(next.legs[0].fromId).toBe("home");
    expect(Date.parse(next.legs[0].departAt)).toBeGreaterThanOrEqual(Date.parse(at("16:30")));
  });
});

describe("queryDeparture for trips planned far ahead", () => {
  it("asks for the same weekday and time within the next two weeks", () => {
    const now = Date.parse("2026-11-14T19:30:00-05:00");
    const d = queryDeparture("2026-12-19T11:00:00-05:00", now); // a Saturday five weeks out
    expect(d.getTime() - now).toBeLessThanOrEqual(14 * 86400000);
    expect(d.getTime()).toBeGreaterThan(now);
    expect(d.getUTCDay()).toBe(6);
    expect(d.toISOString().slice(11, 16)).toBe("16:00");
  });
});

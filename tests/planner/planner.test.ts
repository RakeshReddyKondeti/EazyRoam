import { describe, expect, it } from "vitest";
import { comparePlan, makePlan, replan } from "@/lib/planner";
import { before } from "@/lib/planner/geo";
import { PLACES, REQUEST, at, fakeDeps } from "./fakes";

const ids = (p: { stops: { placeId: string }[] }) => p.stops.map((s) => s.placeId);

describe("makePlan", () => {
  it("never picks a place that is not accessible", async () => {
    const plan = await makePlan(REQUEST, fakeDeps());
    expect(ids(plan)).not.toContain("steps-bistro");
    expect(ids(plan)).toContain("flat-cafe");
    for (const s of plan.stops) expect(plan.places[s.placeId].overall).not.toBe("no");
  });

  it("respects opening hours and the end time", async () => {
    const plan = await makePlan(REQUEST, fakeDeps());
    for (const s of plan.stops) {
      const p = plan.places[s.placeId];
      expect(before(s.arrive, p.hours[0].open)).toBe(false);
      expect(before(p.hours[0].close, s.depart)).toBe(false);
      expect(s.status).not.toBe("bad");
    }
    expect(before(REQUEST.end, plan.endAt)).toBe(false);
    expect(plan.problems).toBe(0);
  });

  it("orders stops so a museum that closes early still fits", async () => {
    const closesEarly = { ...PLACES.museum[0], hours: [{ open: at("10:00"), close: at("14:30") }] };
    const plan = await makePlan(REQUEST, fakeDeps({ findCandidates: async (w) => (w.category === "museum" ? [closesEarly] : PLACES[w.category]) }));
    expect(ids(plan)[0]).toBe("art-museum");
    expect(plan.stops.every((s) => s.status !== "bad")).toBe(true);
  });

  it("prefers known-accessible places and gives an unknown one a backup", async () => {
    const onlyUnknown = await makePlan(
      { ...REQUEST, wants: [{ category: "gift shop" }] },
      fakeDeps({ findCandidates: async () => [PLACES["gift shop"][0]] }),
    );
    expect(onlyUnknown.stops[0].status).toBe("unknown");
    expect(onlyUnknown.stops[0].reasons.join(" ")).toMatch(/No accessibility data/);

    const both = await makePlan({ ...REQUEST, wants: [{ category: "gift shop" }] }, fakeDeps());
    expect(ids(both)).toEqual(["ramp-gifts"]);
  });
});

describe("replan", () => {
  const now = at("09:00");

  it("ramp blocked: swaps that place out", async () => {
    const plan = await makePlan(REQUEST, fakeDeps());
    const next = await replan(plan, { type: "rampBlocked", placeId: "flat-cafe" }, now, fakeDeps());
    expect(ids(next)).not.toContain("flat-cafe");
    expect(next.constraints?.excludedPlaceIds).toContain("flat-cafe");
    // Only the inaccessible bistro is left for lunch, so lunch is dropped and explained.
    expect(next.explanation).toMatch(/lunch/);
  });

  it("elevator out: the stop is marked and remembered", async () => {
    const plan = await makePlan(REQUEST, fakeDeps());
    const next = await replan(plan, { type: "elevatorOut", stopName: "Pulaski Park" }, now, fakeDeps());
    expect(next.constraints?.blockedStops).toContain("Pulaski Park");
    expect(next.legs.some((l) => l.stops.some((s) => s.name === "Pulaski Park" && s.elevatorOut))).toBe(true);
  });

  it("running late: leaves later", async () => {
    const plan = await makePlan(REQUEST, fakeDeps());
    const next = await replan(plan, { type: "late", minutes: 30 }, now, fakeDeps());
    expect(next.legs[0].departAt).toBe(at("11:30"));
  });

  it("add a stop: the new category is planned", async () => {
    const plan = await makePlan(REQUEST, fakeDeps());
    const next = await replan(plan, { type: "addStop", category: "pharmacy" }, now, fakeDeps());
    expect(ids(next)).toContain("corner-pharmacy");
    expect(next.request.wants.map((w) => w.category)).toContain("pharmacy");
  });

  it("keeps stops that are already done", async () => {
    const plan = await makePlan(REQUEST, fakeDeps());
    const first = plan.stops[0];
    const next = await replan(plan, { type: "addStop", category: "pharmacy" }, first.depart, fakeDeps());
    expect(next.stops[0]).toEqual(first);
  });
});

describe("comparePlan", () => {
  it("takes the top result in the user's order and counts the problems", async () => {
    const plan = await comparePlan(REQUEST, fakeDeps());
    expect(ids(plan)[0]).toBe("steps-bistro");
    expect(plan.stops[0].status).toBe("bad");
    expect(plan.problems).toBeGreaterThan(0);
  });
});

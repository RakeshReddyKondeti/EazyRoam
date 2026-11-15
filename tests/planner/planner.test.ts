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

describe("stay length, times and order from the request", () => {
  it("uses the minutes the user asked for", async () => {
    const plan = await makePlan({ ...REQUEST, wants: [{ category: "museum", minutes: 45 }] }, fakeDeps());
    const s = plan.stops[0];
    expect((Date.parse(s.depart) - Date.parse(s.arrive)) / 60000).toBe(45);
  });

  it("doesn't arrive before a stop's 'at' time", async () => {
    const plan = await makePlan({ ...REQUEST, wants: [{ category: "lunch", at: "14:00" }] }, fakeDeps());
    expect(plan.stops[0].arrive).toBe(at("14:00"));
    expect(plan.stops[0].reasons.join(" ")).toMatch(/Planned for 2:00 PM/);
  });

  it("keeps the user's order when inOrder is set", async () => {
    const wants = [{ category: "gift shop" }, { category: "lunch" }, { category: "museum" }];
    const free = await makePlan({ ...REQUEST, wants }, fakeDeps());
    const fixed = await makePlan({ ...REQUEST, wants, inOrder: true }, fakeDeps());
    expect(fixed.stops.map((s) => fixed.places[s.placeId].category)).toEqual(["gift shop", "lunch", "museum"]);
    expect(free.stops.length).toBe(3);
  });
});

describe("movie defaults and set times", () => {
  it("a movie gets a full-length stay, not 45 minutes", async () => {
    const { visitMinutes } = await import("@/lib/planner/geo");
    expect(visitMinutes("movie")).toBe(150);
    expect(visitMinutes("movie Movie theater")).toBe(150);
    expect(visitMinutes("concert")).toBe(180);
  });
  it("flags arriving after a timed stop has started", async () => {
    const plan = await makePlan({ ...REQUEST, start: at("11:00"), wants: [{ category: "museum", at: "11:05", timed: true }] }, fakeDeps());
    expect(plan.stops[0].status).toBe("bad");
    expect(plan.stops[0].reasons.join(" ")).toMatch(/after it starts at 11:05 AM/);
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

  it("+ / −: setStay changes only that stop's length and keeps the place", async () => {
    const plan = await makePlan(REQUEST, fakeDeps());
    const museum = plan.stops.find((s) => s.placeId === "art-museum")!;
    const next = await replan(plan, { type: "setStay", placeId: "art-museum", minutes: 60 }, now, fakeDeps());
    const m = next.stops.find((s) => s.placeId === "art-museum")!;
    expect((Date.parse(m.depart) - Date.parse(m.arrive)) / 60000).toBe(60);
    expect((Date.parse(museum.depart) - Date.parse(museum.arrive)) / 60000).not.toBe(60);
    expect(next.request.wants.find((w) => w.placeId === "art-museum")?.minutes).toBe(60);
  });

  it("Start at: setTime pins a stop's start, and null clears it", async () => {
    const plan = await makePlan({ ...REQUEST, wants: [{ category: "lunch" }] }, fakeDeps());
    const pinned = await replan(plan, { type: "setTime", placeId: "flat-cafe", at: "15:00" }, now, fakeDeps());
    expect(pinned.stops.find((s) => s.placeId === "flat-cafe")?.arrive).toBe(at("15:00"));
    const cleared = await replan(pinned, { type: "setTime", placeId: "flat-cafe", at: null }, now, fakeDeps());
    expect(cleared.request.wants.find((w) => w.placeId === "flat-cafe")?.at).toBeUndefined();
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

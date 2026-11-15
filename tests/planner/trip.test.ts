import { describe, expect, it } from "vitest";
import type { Place } from "@/lib/types";
import { addDays, clusterDays, planTrip, stopsPerDay, tripTitle } from "@/lib/planner/trip";
import { PLACES, fakeDeps } from "./fakes";

const byName: Record<string, Place> = {
  "Art Museum": PLACES.museum[0],
  "Flat Cafe": PLACES.lunch[1],
  "Steps Bistro": PLACES.lunch[0],
  "Mystery Gifts": PLACES["gift shop"][0],
  "Corner Pharmacy": PLACES.pharmacy[0],
};
const deps = fakeDeps({ findCandidates: async (w) => (byName[w.query ?? ""] ? [{ ...byName[w.query ?? ""], kind: "Shop" }] : []) });
const input = {
  places: Object.keys(byName).concat("Nowhere Special"),
  days: 3,
  origin: { lat: 42.3868, lng: -72.5301 },
  needs: { noSteps: true, gentleSlopes: true, restroom: false },
  date: "2026-11-14",
  offset: "-05:00",
};

describe("planTrip", () => {
  it("leaves out inaccessible places and lists names it couldn't find", async () => {
    const trip = await planTrip(input, deps);
    expect(trip.leftOut.map((x) => x.place.id)).toEqual(["steps-bistro"]);
    expect(trip.notFound).toEqual(["Nowhere Special"]);
    const planned = trip.dayPlans.flatMap((d) => d.plan.stops.map((s) => s.placeId));
    expect(planned.sort()).toEqual(["art-museum", "corner-pharmacy", "flat-cafe", "mystery-gifts"]);
  });

  it("dates each day and counts free days", async () => {
    const trip = await planTrip(input, deps);
    expect(trip.title).toBe("3-day trip");
    trip.dayPlans.forEach((d, i) => expect(d.date).toBe(addDays("2026-11-14", i)));
    expect(trip.freeDays).toBe(3 - trip.dayPlans.length);
  });
});

describe("clusterDays", () => {
  const pt = (lat: number, lng: number) => ({ location: { lat, lng } });
  it("keeps nearby places together and respects the cap", () => {
    const boston = [pt(42.36, -71.06), pt(42.361, -71.061), pt(42.359, -71.058)];
    const noho = [pt(42.319, -72.631), pt(42.318, -72.638)];
    const groups = clusterDays([...boston, ...noho], 2, 4);
    expect(groups.map((g) => g.length).sort()).toEqual([2, 3]);
    expect(clusterDays([...boston, ...noho], 2, 2).every((g) => g.length <= 3)).toBe(true);
  });
  it("addDays crosses month ends", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
  });
});

describe("flexible trip length", () => {
  it("titles any length", () => {
    expect(tripTitle(1)).toBe("1-day trip");
    expect(tripTitle(5)).toBe("5-day trip");
    expect(tripTitle(7)).toBe("1-week trip");
    expect(tripTitle(14)).toBe("2-week trip");
  });
  it("spreads stops thinner on longer trips", () => {
    expect([1, 3, 4, 6, 7, 14].map(stopsPerDay)).toEqual([4, 4, 3, 3, 2, 2]);
  });
  it("plans a 5-day trip", async () => {
    const trip = await planTrip({ ...input, days: 5 }, deps);
    expect(trip.title).toBe("5-day trip");
    expect(trip.dayPlans.length + trip.freeDays).toBe(5);
    expect(trip.dayPlans.every((d) => d.plan.stops.length <= 3)).toBe(true);
  });
});

describe("adjusting a trip day", () => {
  it("+ / − on a Vacation stop re-plans that day and keeps the picked place", async () => {
    const { replan } = await import("@/lib/planner");
    const trip = await planTrip(input, deps);
    const day = trip.dayPlans.find((d) => d.plan.stops.some((s) => s.placeId === "art-museum"))!;
    expect(day.plan.request.wants.find((w) => w.placeId === "art-museum")).toBeTruthy();
    const next = await replan(day.plan, { type: "setStay", placeId: "art-museum", minutes: 45 }, "2026-11-13T09:00:00-05:00", deps);
    const m = next.stops.find((s) => s.placeId === "art-museum")!;
    expect((Date.parse(m.depart) - Date.parse(m.arrive)) / 60000).toBe(45);
    expect(next.stops.map((s) => s.placeId).sort()).toEqual(day.plan.stops.map((s) => s.placeId).sort());
  });
});

describe("day times", () => {
  it("each day uses the trip's leave and back-by times", async () => {
    const trip = await planTrip({ ...input, dayStart: "11:30", dayEnd: "17:00" }, deps);
    for (const d of trip.dayPlans) {
      expect(d.plan.request.start).toBe(`${d.date}T11:30:00-05:00`);
      expect(d.plan.request.end).toBe(`${d.date}T17:00:00-05:00`);
    }
  });

  it("one day's times can change on their own (setDay)", async () => {
    const { replan } = await import("@/lib/planner");
    const trip = await planTrip(input, deps);
    const d = trip.dayPlans[0];
    const next = await replan(d.plan, { type: "setDay", start: "12:00", end: "18:30" }, "2026-11-13T09:00:00-05:00", deps);
    expect(next.request.start).toBe(`${d.date}T12:00:00-05:00`);
    expect(next.request.end).toBe(`${d.date}T18:30:00-05:00`);
    expect(Date.parse(next.legs[0].departAt)).toBeGreaterThanOrEqual(Date.parse(next.request.start));
  });
});

describe("compare a trip day", () => {
  it("the normal-app plan also includes the inaccessible places EazyRoam left out", async () => {
    const { compareRequest } = await import("@/lib/planner/compareTrip");
    const trip = await planTrip(input, deps);
    const all = trip.dayPlans.flatMap((_, i) => compareRequest(trip, i).wants.map((w) => w.placeId));
    expect(all).toContain("steps-bistro"); // left out by EazyRoam, planned by the normal app
    expect(all.filter((id) => id === "steps-bistro")).toHaveLength(1); // on exactly one day
  });
});

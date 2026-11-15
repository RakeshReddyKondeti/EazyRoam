import { describe, expect, it } from "vitest";
import { activePart, isNear, journeySummary, liveItems, minutesBehind, moveText, nearingStop, nextAction, reachedParts, startIndex, type Part } from "@/components/live";
import { makePlan } from "@/lib/planner";
import { REQUEST, at, fakeDeps } from "../planner/fakes";

const request = { ...REQUEST, wants: [{ category: "lunch" }, { category: "museum" }] };

// A journey like the one that was annoying step by step: roll 2, bus 5, roll 2, bus 2, roll 1.
const P = (kind: Part["step"]["kind"], minutes: number, start: string, end: string, lat: number, extra = {}): Part => ({
  step: { kind, minutes, ...extra },
  start: at(start),
  end: at(end),
  target: { lat, lng: -72.6 },
});
const parts: Part[] = [
  P("roll", 2, "11:00", "11:02", 42.30, { to: "Main St" }),
  P("bus", 5, "11:02", "11:07", 42.31, { line: "B43", from: "Main St", to: "Park Ave" }),
  P("roll", 2, "11:07", "11:09", 42.32, { to: "Elm St" }),
  P("bus", 2, "11:09", "11:11", 42.33, { line: "30", from: "Elm St", to: "Oak St" }),
  P("roll", 1, "11:11", "11:12", 42.34),
];

describe("live day: one card per journey", () => {
  it("is travel, stay, travel, stay, travel back, done — not one card per step", async () => {
    const plan = await makePlan(request, fakeDeps());
    const items = liveItems(plan, "Hotel");
    expect(items.map((i) => i.kind)).toEqual(["go", "stay", "go", "stay", "go", "end"]);
    const first = items[0];
    expect(first.kind === "go" && first.target).toEqual(plan.places[plan.stops[0].placeId].location);
  });

  it("picks up at the journey to the first stop not yet visited", async () => {
    const plan = await makePlan(request, fakeDeps());
    const items = liveItems(plan, "Hotel");
    expect(startIndex(items, new Set())).toBe(0);
    expect(startIndex(items, new Set([plan.stops[0].placeId]))).toBe(2);
    expect(items[startIndex(items, new Set(plan.stops.map((s) => s.placeId)))].kind).toBe("go");
  });

  it("moves through the steps by itself: by the clock without GPS, by GPS with it", () => {
    expect(activePart(parts, 0, Date.parse(at("11:03")), true)).toBe(1); // on the bus
    expect(activePart(parts, 0, Date.parse(at("11:10")), true)).toBe(3);
    expect(activePart(parts, 0, Date.parse(at("11:10")), false)).toBe(0); // GPS mode, nothing seen yet
    const r = reachedParts(parts, { lat: 42.31, lng: -72.6, accuracy: 10 }, 0); // at Park Ave
    expect(r).toBe(2);
    expect(reachedParts(parts, { lat: 42.30, lng: -72.6, accuracy: 10 }, r)).toBe(2); // never goes back
  });

  it("tells you the next thing you actually have to do", () => {
    expect(nextAction(parts, 0, "Museum")).toEqual({ text: "Board the bus B43 at Main St", at: at("11:02") });
    expect(nextAction(parts, 1, "Museum")).toEqual({ text: "Get off at Park Ave", at: at("11:07") });
    expect(nextAction(parts, 4, "Museum")).toEqual({ text: "Arrive at Museum", at: at("11:12") });
    expect(journeySummary(parts)).toBe("Roll 2 min, then bus B43, then roll 2 min, then bus 30, then roll 1 min");
  });

  it("says get off soon near the stop, knows when you're behind and when you've arrived", () => {
    expect(nearingStop(parts[1], { lat: 42.3085, lng: -72.6 })).toBe(true); // ~170 m before Park Ave
    expect(nearingStop(parts[1], { lat: 42.30, lng: -72.6 })).toBe(false);
    expect(nearingStop(parts[0], { lat: 42.30, lng: -72.6 })).toBe(false); // rolling: nothing to get off
    expect(moveText({ kind: "bus", minutes: 12, line: "22", from: "Main St", to: "Park Ave" }, "Museum")).toBe("Take the bus 22 from Main St to Park Ave");
    const stay = { kind: "stay" as const, placeId: "x", name: "X", arrive: at("12:00"), depart: at("13:00"), location: { lat: 0, lng: 0 } };
    expect(minutesBehind(stay, Date.parse(at("13:20")))).toBe(20);
    expect(isNear({ lat: 42.3172, lng: -72.6386, accuracy: 10 }, { lat: 42.3175, lng: -72.6386 })).toBe(true);
    expect(isNear({ lat: 42.3172, lng: -72.6386, accuracy: 10 }, { lat: 42.32, lng: -72.6386 })).toBe(false);
  });
});

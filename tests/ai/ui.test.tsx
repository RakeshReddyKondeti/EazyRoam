import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { problemList } from "@/components/CompareView";
import { DayList, changedIds, legKey } from "@/components/DayList";
import { LegRow, legSteps, stopChip } from "@/components/LegRow";
import { PlaceCard } from "@/components/PlaceCard";
import { decodePolyline } from "@/components/polyline";
import type { Plan } from "@/lib/types";
import compare from "@/fixtures/plan.compare.json";
import sample from "@/fixtures/plan.sample.json";

const mine = sample as unknown as Plan;
const normal = compare as unknown as Plan;

describe("decodePolyline", () => {
  it("decodes Google's documented example", () => {
    const pts = decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(pts.map(([lng, lat]) => [+lat.toFixed(3), +lng.toFixed(3)])).toEqual([
      [38.5, -120.2],
      [40.7, -120.95],
      [43.252, -126.453],
    ]);
  });
});

describe("Compare problem list", () => {
  it("lists every problem in the normal plan", () => {
    const p = problemList(normal);
    expect(p.join(" | ")).toMatch(/Draft Bistro With Steps: Not wheelchair accessible/);
    expect(p.join(" | ")).toMatch(/Pulaski Park: not step-free/);
    expect(p.join(" | ")).toMatch(/Main St: elevator out/);
    expect(p.join(" | ")).toMatch(/Closes at 4:00 PM/);
  });
  it("only flags the unchecked gift shop in EazyRoam's sample plan", () => {
    expect(problemList(mine)).toEqual(["Draft Gift Shop: accessibility not checked"]);
  });
});

describe("changedIds", () => {
  it("marks new stops and changed legs after a re-plan", () => {
    const next: Plan = {
      ...mine,
      stops: mine.stops.map((s) => (s.placeId === "gift-1" ? { ...s, placeId: "gift-2" } : s)),
      legs: mine.legs.map((l) => ({ ...l, fromId: l.fromId === "gift-1" ? "gift-2" : l.fromId, toId: l.toId === "gift-1" ? "gift-2" : l.toId })),
    };
    const ids = changedIds(mine, next);
    expect(ids.has("gift-2")).toBe(true);
    expect(ids.has(legKey("lunch-1", "gift-2"))).toBe(true);
    expect(ids.has("museum-1")).toBe(false);
  });
});

describe("PlaceCard", () => {
  it("never shows an unknown place as confirmed, and offers the call-ahead number", () => {
    const html = renderToStaticMarkup(<PlaceCard place={mine.places["gift-1"]} stop={mine.stops[1]} index={1} backup={mine.places["gift-2"]} />);
    expect(html).toContain("Accessibility not confirmed.");
    expect(html).toContain("Call (413) 555-0147 before you go.");
    expect(html).toContain("Backup: <b>Draft Backup Gift Shop</b>");
  });
});

describe("LegRow", () => {
  it("spells out roll → bus → roll with each stop's access, never a false step-free", () => {
    const leg = {
      ...mine.legs[0],
      stops: [
        { name: "Mission St & 3rd St", location: { lat: 0, lng: 0 }, wheelchair: "unknown" as const },
        { name: "Toll Plaza", location: { lat: 0, lng: 0 }, wheelchair: "yes" as const },
      ],
      steps: [
        { kind: "roll" as const, minutes: 4, to: "Mission St & 3rd St" },
        { kind: "bus" as const, minutes: 38, line: "101", from: "Mission St & 3rd St", to: "Toll Plaza" },
        { kind: "roll" as const, minutes: 3 },
      ],
    };
    const html = renderToStaticMarkup(<LegRow leg={leg} toName="Draft Lunch Café" />);
    expect(html).toContain("Roll 4 min to <b>Mission St &amp; 3rd St</b>");
    expect(html).toContain("Take the bus 101 for 38 min. Board at <b>Mission St &amp; 3rd St</b>");
    expect(html).toMatch(/Mission St &amp; 3rd St<\/b> <span class="achip none">Access unknown/);
    expect(html).toMatch(/Toll Plaza<\/b> <span class="achip ok">Step-free/);
    expect(html).toContain("Roll 3 min to <b>Draft Lunch Café</b>");
  });

  it("builds steps for legs without them, and chips for every stop state", () => {
    expect(legSteps({ ...mine.legs[1], steps: undefined })).toEqual([{ kind: "roll", minutes: 10 }]);
    expect(stopChip({ name: "x", location: { lat: 0, lng: 0 }, wheelchair: "yes", elevatorOut: true }).text).toBe("Elevator out");
    expect(stopChip({ name: "x", location: { lat: 0, lng: 0 }, wheelchair: "no" }).tone).toBe("bad");
    expect(stopChip(undefined).text).toBe("Access unknown");
  });
});

describe("DayList start and end rows", () => {
  it("shows Start and Home with the start address on a round trip", () => {
    const html = renderToStaticMarkup(<DayList plan={mine} startLabel="Start" endLabel="Home" />);
    expect(html).toContain("Start<small>UMass Amherst, Amherst, MA (sample)</small>");
    expect(html).toContain("Home<small>UMass Amherst, Amherst, MA (sample)</small>");
  });
  it("shows End with the end address when the day ends elsewhere", () => {
    const plan = { ...mine, request: { ...mine.request, endLabel: "Amherst Town Hall" } };
    const html = renderToStaticMarkup(<DayList plan={plan} startLabel="Start" endLabel="Home" />);
    expect(html).toContain("End<small>Amherst Town Hall</small>");
    expect(html).toContain("Roll 4 min to <b>Amherst Town Hall</b>");
  });
});

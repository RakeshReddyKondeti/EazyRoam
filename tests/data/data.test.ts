import { describe, expect, it } from "vitest";
import { matchOutages } from "@/lib/data/outages";
import { matchOsm, mergeAccess } from "@/lib/data/osm";
import { type GPlace, hoursFor, mapPlace, offsetString } from "@/lib/data/places";
import type { Stop } from "@/lib/types";
import recorded from "@/fixtures/places.google.sample.json";

const SAT = "2026-11-14"; // a Saturday

describe("Places (New) → Place", () => {
  const [museum, cafe] = (recorded as { places: GPlace[] }).places;

  it("maps name, location, phone and accessibility booleans", () => {
    const p = mapPlace(museum, "museum", SAT);
    expect(p).toMatchObject({ name: "Sample Museum", category: "museum", location: { lat: 42.3172, lng: -72.6386 }, phone: "(413) 555-0100" });
    expect(p.access).toEqual({ entrance: "yes", restroom: "yes", seating: "unknown", parking: "no" });
    expect(p.overall).toBe("yes");
  });

  it("missing accessibility data is unknown, never yes", () => {
    const p = mapPlace(cafe, "lunch", SAT);
    expect(p.access.entrance).toBe("unknown");
    expect(p.overall).toBe("unknown");
  });

  it("converts today's opening hours to ISO in the place's offset", () => {
    expect(mapPlace(museum, "museum", SAT).hours).toEqual([
      { open: "2026-11-14T10:00:00-05:00", close: "2026-11-14T16:00:00-05:00" },
    ]);
  });
});

describe("hoursFor", () => {
  it("handles past-midnight periods from yesterday and into tomorrow", () => {
    const h = hoursFor(
      [
        { open: { day: 5, hour: 18 }, close: { day: 6, hour: 2 } }, // Fri 18:00 – Sat 02:00
        { open: { day: 6, hour: 18 }, close: { day: 0, hour: 2 } }, // Sat 18:00 – Sun 02:00
      ],
      SAT,
      -300,
    );
    expect(h).toEqual([
      { open: "2026-11-14T00:00:00-05:00", close: "2026-11-14T02:00:00-05:00" },
      { open: "2026-11-14T18:00:00-05:00", close: "2026-11-15T02:00:00-05:00" },
    ]);
  });
  it("open 24 hours and no hours", () => {
    expect(hoursFor([{ open: { day: 0, hour: 0, minute: 0 } }], SAT, -300)).toHaveLength(1);
    expect(hoursFor(undefined, SAT, -300)).toEqual([]);
  });
  it("formats offsets", () => {
    expect(offsetString(-300)).toBe("-05:00");
    expect(offsetString(330)).toBe("+05:30");
  });
});

describe("access merge rules", () => {
  it("Google wins, OSM fills unknowns, a conflict is limited", () => {
    expect(mergeAccess("yes", "limited")).toBe("yes");
    expect(mergeAccess("unknown", "no")).toBe("no");
    expect(mergeAccess("yes", "no")).toBe("limited");
    expect(mergeAccess("no", undefined)).toBe("no");
  });
  it("matches OSM by name, else only very close", () => {
    const at = { lat: 42.3172, lng: -72.6386 };
    const els = [
      { lat: 42.3173, lon: -72.6387, tags: { name: "Other Shop", wheelchair: "no" } },
      { lat: 42.3176, lon: -72.6390, tags: { name: "Sample Museum", wheelchair: "yes" } },
    ];
    expect(matchOsm(els, "Sample Museum", at)).toBe("yes");
    expect(matchOsm(els, "Unlisted Place", at)).toBe("no"); // nearest within 25 m
    expect(matchOsm([], "x", at)).toBe("unknown");
  });
});

describe("elevator outages", () => {
  const stop = (name: string): Stop => ({ name, location: { lat: 42.356, lng: -71.062 }, wheelchair: "yes" });
  it("matches station names loosely", () => {
    const out = matchOutages([stop("Park Street"), stop("Downtown Crossing"), stop("Haymarket")], ["Park Street", "Downtown Crossing Station"]);
    expect([...out].sort()).toEqual(["Downtown Crossing", "Park Street"]);
  });
});

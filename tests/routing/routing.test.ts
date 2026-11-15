import { describe, expect, it } from "vitest";
import { pickStop } from "@/lib/routing/stops";
import { stepsOf } from "@/lib/routing/legs";
import { mapRoute, queryDeparture } from "@/lib/routing/transit";

describe("mapRoute (Google Routes → segments)", () => {
  it("maps walk + transit steps and merges consecutive walks", () => {
    const route = mapRoute({
      duration: "2700s",
      polyline: { encodedPolyline: "abc" },
      legs: [
        {
          steps: [
            { travelMode: "WALK", staticDuration: "120s", startLocation: { latLng: { latitude: 1, longitude: 1 } }, endLocation: { latLng: { latitude: 1.1, longitude: 1 } } },
            { travelMode: "WALK", staticDuration: "60s", endLocation: { latLng: { latitude: 1.2, longitude: 1 } } },
            {
              travelMode: "TRANSIT",
              staticDuration: "2400s",
              transitDetails: {
                stopDetails: {
                  departureStop: { name: "Haigis Mall", location: { latLng: { latitude: 42.38, longitude: -72.53 } } },
                  arrivalStop: { name: "Pulaski Park", location: { latLng: { latitude: 42.32, longitude: -72.63 } } },
                },
                transitLine: { nameShort: "B43", vehicle: { type: "BUS" } },
              },
            },
          ],
        },
      ],
    });
    expect(route.minutes).toBe(45);
    expect(route.polyline).toBe("abc");
    expect(route.segments).toHaveLength(2);
    expect(route.segments[0]).toMatchObject({ kind: "walk", minutes: 3, to: { lat: 1.2, lng: 1 } });
    expect(route.segments[1]).toMatchObject({ kind: "transit", vehicle: "bus", line: "B43", board: { name: "Haigis Mall" } });
  });

  it("treats subway and rail as rail", () => {
    const r = mapRoute({
      legs: [{ steps: [{ travelMode: "TRANSIT", transitDetails: { transitLine: { vehicle: { type: "SUBWAY" } } } }] }],
    });
    expect(r.segments[0]).toMatchObject({ kind: "transit", vehicle: "rail" });
  });
});

describe("pickStop (Transitland → access)", () => {
  const at = { lat: 42.3189, lng: -72.6311 };
  it("prefers a name match over a nearer stop", () => {
    const access = pickStop(
      [
        { stop_name: "Main St", wheelchair_boarding: 2, geometry: { coordinates: [-72.6311, 42.3189] } },
        { stop_name: "Pulaski Park", wheelchair_boarding: 1, geometry: { coordinates: [-72.6316, 42.3192] } },
      ],
      "Pulaski Park",
      at,
    );
    expect(access).toBe("yes");
  });
  it("inherits from the parent station and defaults to unknown", () => {
    expect(pickStop([{ stop_name: "X", wheelchair_boarding: 0, parent: { wheelchair_boarding: 2 } }], "X", at)).toBe("no");
    expect(pickStop([], "X", at)).toBe("unknown");
    expect(pickStop([{ stop_name: "X" }], "X", at)).toBe("unknown");
  });
});

describe("queryDeparture (times that already passed)", () => {
  const now = Date.parse("2026-11-14T19:30:00-05:00"); // Saturday evening
  it("moves a past departure to the same weekday and time next week", () => {
    expect(queryDeparture("2026-11-14T11:05:00-05:00", now).toISOString()).toBe("2026-11-21T16:10:00.000Z"); // 11:10 EST next Sat
  });
  it("keeps future departures (rounded up to 10 min)", () => {
    expect(queryDeparture("2026-11-15T09:02:00-05:00", now).toISOString()).toBe("2026-11-15T14:10:00.000Z");
  });
});

describe("stepsOf (route → roll / ride steps)", () => {
  it("names the stop each roll leads to", () => {
    const steps = stepsOf({
      minutes: 50,
      polyline: "",
      segments: [
        { kind: "walk", minutes: 4, from: { lat: 0, lng: 0 }, to: { lat: 0, lng: 0 } },
        { kind: "transit", minutes: 38, vehicle: "bus", line: "101", board: { name: "Mission St & 3rd St", location: { lat: 0, lng: 0 } }, alight: { name: "Toll Plaza", location: { lat: 0, lng: 0 } } },
        { kind: "walk", minutes: 3, from: { lat: 0, lng: 0 }, to: { lat: 0, lng: 0 } },
      ],
    });
    expect(steps).toEqual([
      { kind: "roll", minutes: 4, to: "Mission St & 3rd St" },
      { kind: "bus", minutes: 38, line: "101", from: "Mission St & 3rd St", to: "Toll Plaza" },
      { kind: "roll", minutes: 3, to: undefined },
    ]);
  });
});

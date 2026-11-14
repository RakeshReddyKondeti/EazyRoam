import { describe, expect, it } from "vitest";
import { pickStop } from "@/lib/routing/stops";
import { mapRoute } from "@/lib/routing/transit";

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

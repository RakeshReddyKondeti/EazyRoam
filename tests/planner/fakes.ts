// Fake Deps for planner tests: fixed places, no network. Owner: A.
import type { BuildLeg, Deps } from "@/lib/contracts";
import { addMin, roughMinutes } from "@/lib/planner/geo";
import type { Access, Place, Request } from "@/lib/types";

const day = "2026-11-14";
const at = (hm: string) => `${day}T${hm}:00-05:00`;

function place(id: string, category: string, lat: number, lng: number, open: string, close: string, overall: Access): Place {
  return {
    id,
    name: id,
    category,
    location: { lat, lng },
    address: "Northampton, MA",
    hours: [{ open: at(open), close: at(close) }],
    access: { entrance: overall, restroom: overall, seating: overall, parking: overall },
    overall,
    sources: ["google"],
  };
}

// Ranked as a search would return them: the top result is not always accessible.
export const PLACES: Record<string, Place[]> = {
  lunch: [
    place("steps-bistro", "lunch", 42.3191, -72.6309, "11:00", "22:00", "no"),
    place("flat-cafe", "lunch", 42.3195, -72.6315, "11:00", "21:00", "yes"),
  ],
  "gift shop": [
    place("mystery-gifts", "gift shop", 42.3186, -72.6322, "10:00", "19:00", "unknown"),
    place("ramp-gifts", "gift shop", 42.3199, -72.6331, "10:00", "18:00", "yes"),
  ],
  museum: [place("art-museum", "museum", 42.3172, -72.6386, "10:00", "16:00", "yes")],
  pharmacy: [place("corner-pharmacy", "pharmacy", 42.3201, -72.6290, "08:00", "21:00", "yes")],
};

export const REQUEST: Request = {
  wants: [{ category: "lunch" }, { category: "gift shop" }, { category: "museum" }],
  start: at("11:00"),
  end: at("18:00"),
  origin: { lat: 42.3868, lng: -72.5301 },
  home: { lat: 42.3868, lng: -72.5301 },
  needs: { noSteps: true, gentleSlopes: true, restroom: false },
};

/** Long legs ride a bus through "Pulaski Park"; blocked stops come back with elevatorOut. */
export const fakeBuildLeg: BuildLeg = async (from, to, departAt, _needs, _deps, opts = {}) => {
  const a = "location" in from ? from.location : from;
  const b = "location" in to ? to.location : to;
  const minutes = roughMinutes(a, b);
  const long = minutes > 15;
  const stops = long
    ? [
        { name: "Haigis Mall", location: a, wheelchair: "yes" as const },
        { name: "Pulaski Park", location: b, wheelchair: "yes" as const, elevatorOut: opts.blockedStops?.includes("Pulaski Park") || undefined },
      ]
    : [];
  return { fromId: from.id, toId: to.id, mode: long ? "bus" : "roll", departAt, arriveAt: addMin(departAt, minutes), minutes, polyline: "", stops, issues: [] };
};

export function fakeDeps(overrides: Partial<Deps> = {}): Deps {
  return {
    findCandidates: async (want) => PLACES[want.category] ?? [],
    getElevatorOutages: async () => new Set(),
    getReliability: async () => ({}),
    getReports: async () => ({}),
    cached: (_k, _t, fn) => fn(),
    buildLeg: fakeBuildLeg,
    ...overrides,
  };
}

export { at };

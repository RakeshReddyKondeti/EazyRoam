// Shared contract: PLAN.md §3. Frozen after hour 0.
// Change only via a small PR agreed in team chat (PLAN.md §3, "How to change a contract").

export type LatLng = { lat: number; lng: number };
export type Access = "yes" | "limited" | "no" | "unknown";
export type Needs = { noSteps: boolean; gentleSlopes: boolean; restroom: boolean };

export type Want = {
  category: string; // "lunch", "gift shop", "museum"
  query?: string; // what to search, e.g. "birthday gift shop" or a named place
  minutes?: number; // how long to stay; the user's words or a realistic estimate
  at?: string; // "HH:MM": start at this time ("lunch at 1", "the 5 pm movie")
  timed?: boolean; // happens at a set time (movie, show, game, appointment): ask for it if `at` is missing
  placeId?: string; // keep this exact place (set when the user adjusts a stop in the plan)
};
export type Request = {
  wants: Want[];
  start: string; // ISO times
  end: string;
  origin: LatLng;
  home: LatLng;
  needs: Needs;
  inOrder?: boolean; // true = keep the user's order ("first …, then …")
  startLabel?: string; // shown on the Start/Home rows: the typed address, or "Your location"
  endLabel?: string; // set only when the day ends somewhere other than the start
  note?: string; // e.g. "11:00 AM has already passed today, so this plan is for tomorrow."
};

export type Hours = { open: string; close: string }[]; // today's periods, ISO
export type Place = {
  id: string;
  name: string;
  category: string;
  location: LatLng;
  address: string;
  phone?: string;
  hours: Hours;
  access: { entrance: Access; restroom: Access; seating: Access; parking: Access };
  overall: Access;
  sources: ("google" | "osm" | "report")[];
  /** Google's place type, e.g. "Art museum" (helps estimate visit length). */
  kind?: string;
};

export type Stop = {
  name: string;
  location: LatLng;
  wheelchair: Access;
  elevatorOut?: boolean;
  reliability?: number; // 0..1
};
export type Leg = {
  fromId: string;
  toId: string;
  mode: "roll" | "bus" | "rail";
  departAt: string;
  arriveAt: string;
  minutes: number;
  polyline: string;
  stops: Stop[];
  issues: string[];
  /** How you travel, in order: roll to the stop, ride, roll on. Older/fixture legs may omit it. */
  steps?: LegStep[];
};

/** One part of a leg. `from`/`to` are stop names for rides; `to` is a stop name for rolls to a stop. */
export type LegStep = {
  kind: "roll" | "bus" | "rail";
  minutes: number;
  line?: string; // "101", "Red Line"
  from?: string;
  to?: string;
};

export type PlanStop = {
  placeId: string;
  arrive: string;
  depart: string;
  status: "ok" | "unknown" | "bad";
  reasons: string[];
  backupId?: string;
};
export type Plan = {
  id: string;
  request: Request;
  places: Record<string, Place>;
  stops: PlanStop[];
  legs: Leg[];
  endAt: string;
  problems: number;
  explanation?: string;
  /** Carried across re-plans so earlier events still apply (set by A's replan). */
  constraints?: { excludedPlaceIds: string[]; blockedStops: string[] };
};

export type Event =
  | { type: "rampBlocked"; placeId: string }
  | { type: "elevatorOut"; stopName: string }
  | { type: "late"; minutes: number }
  | { type: "addStop"; category: string }
  | { type: "setStay"; placeId: string; minutes: number } // the + / − buttons
  | { type: "setTime"; placeId: string; at: string | null }; // "Start at" on a stop ("HH:MM", null = any time)

// ---- Vacation mode ----
export type TripInput = {
  places: string[]; // names the user typed, e.g. "New England Aquarium"
  days: number; // 1 to 14
  origin: LatLng; // where they're staying
  startLabel?: string; // the typed address, or "Your location"
  needs: Needs;
  date: string; // first day, YYYY-MM-DD
  offset: string; // "-05:00"
};
export type TripDay = { date: string; plan: Plan };
export type Trip = {
  id: string;
  title: string; // "3-day trip"
  input: TripInput;
  dayPlans: TripDay[];
  leftOut: { place: Place; reason: string }[]; // found but not accessible
  notFound: string[]; // names we couldn't find
  freeDays: number;
};

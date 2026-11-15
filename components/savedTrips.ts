// Saved trips live in this browser only (a per-viewer convenience). Every access is guarded:
// storage can be blocked or empty (private windows, previews), and the app works without it.
import type { Trip } from "@/lib/types";

const KEY = "eazyroam.trips.v1";
export type SavedTrip = { trip: Trip; savedAt: string; visited: string[] }; // visited: "<date>:<placeId>"

export function loadTrips(): SavedTrip[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedTrip[]) : [];
    return Array.isArray(list) ? list.filter((t) => t?.trip?.id) : [];
  } catch {
    return [];
  }
}

export function storeTrips(list: SavedTrip[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage full or blocked: keep working in memory
  }
}

export function upsertTrip(t: SavedTrip) {
  storeTrips([t, ...loadTrips().filter((x) => x.trip.id !== t.trip.id)]);
}

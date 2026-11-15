// Saved trips live in this browser only (a per-viewer convenience). Every access is guarded:
// storage can be blocked or empty (private windows, previews), and the app works without it.
// Read through useSavedTrips() so the list shows on first load without a server/client mismatch.
import { useSyncExternalStore } from "react";
import type { Trip } from "@/lib/types";

const KEY = "eazyroam.trips.v1";
export type SavedTrip = { trip: Trip; savedAt: string; visited: string[] }; // visited: "<date>:<placeId>"

const EMPTY: SavedTrip[] = [];
let snapshot: SavedTrip[] | null = null;
const listeners = new Set<() => void>();

function read(): SavedTrip[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as SavedTrip[]) : [];
    return Array.isArray(list) ? list.filter((t) => t?.trip?.id) : [];
  } catch {
    return [];
  }
}

export function loadTrips(): SavedTrip[] {
  if (!snapshot) snapshot = read();
  return snapshot;
}

export function storeTrips(list: SavedTrip[]) {
  snapshot = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // storage full or blocked: keep working in memory
  }
  listeners.forEach((l) => l());
}

export function upsertTrip(t: SavedTrip) {
  storeTrips([t, ...loadTrips().filter((x) => x.trip.id !== t.trip.id)]);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    snapshot = read(); // another tab changed it
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** The saved trips, kept in sync with storage. Empty on the server. */
export const useSavedTrips = () => useSyncExternalStore(subscribe, loadTrips, () => EMPTY);

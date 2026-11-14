import type { LatLng } from "../types";

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function meters(a: LatLng, b: LatLng): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const ROLL_LIMIT_M = 800;
const ROLL_M_PER_MIN = 60; // ~3.6 km/h, a cautious wheelchair pace
const TRANSIT_M_PER_MIN = 250; // ~15 km/h door to door incl. stops

/** Rough door-to-door minutes, used to rank orders before any API call. */
export function roughMinutes(a: LatLng, b: LatLng): number {
  const d = meters(a, b) * 1.3; // street-grid detour factor
  if (d <= ROLL_LIMIT_M) return Math.ceil(d / ROLL_M_PER_MIN);
  return Math.ceil(12 + d / TRANSIT_M_PER_MIN); // 12 min average wait + boarding
}

/** Minutes for a straight-line roll (fallback when no routing key). */
export const rollMinutes = (a: LatLng, b: LatLng) =>
  Math.max(1, Math.ceil((meters(a, b) * 1.3) / ROLL_M_PER_MIN));

const VISIT: [RegExp, number][] = [
  [/museum|gallery|zoo|aquarium/, 120],
  [/lunch|dinner|restaurant|brunch|breakfast/, 60],
  [/coffee|cafe|café|bakery/, 30],
  [/pharmacy|post office|bank|atm/, 15],
  [/park|garden|library/, 60],
  [/gift|shop|store|book|grocery|market|mall/, 40],
];

/** Default visit length in minutes for a category. */
export function visitMinutes(category: string): number {
  const c = category.toLowerCase();
  return VISIT.find(([re]) => re.test(c))?.[1] ?? 45;
}

export const addMin = (iso: string, min: number) => shiftIso(iso, min * 60000);
export const diffMin = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60000);
export const before = (a: string, b: string) => Date.parse(a) < Date.parse(b);
export const maxIso = (a: string, b: string) => (Date.parse(a) >= Date.parse(b) ? a : b);

/** Shift an ISO time while keeping its UTC offset suffix, so times stay in the request's zone. */
export function shiftIso(iso: string, ms: number): string {
  const off = iso.match(/([+-]\d{2}:\d{2}|Z)$/)?.[1] ?? "Z";
  return toOffsetIso(Date.parse(iso) + ms, off);
}

/** Epoch ms -> "YYYY-MM-DDTHH:MM:SS±HH:MM" in the given offset. */
export function toOffsetIso(t: number, off: string): string {
  if (off === "Z") return new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
  const sign = off[0] === "-" ? -1 : 1;
  const offMs = sign * (Number(off.slice(1, 3)) * 60 + Number(off.slice(4, 6))) * 60000;
  return new Date(t + offMs).toISOString().replace(/\.\d{3}Z$/, off);
}

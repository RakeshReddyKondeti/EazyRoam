// Compare for a trip day (pure, safe in the browser). Owner: A.
import type { LatLng, Request, Trip } from "../types";
import { meters } from "./geo";

const centroid = (ps: { location: LatLng }[]): LatLng => ({
  lat: ps.reduce((s, p) => s + p.location.lat, 0) / ps.length,
  lng: ps.reduce((s, p) => s + p.location.lng, 0) / ps.length,
});

/**
 * What a normal map app would plan for this day: everything the user picked nearby, including the
 * places EazyRoam left out as not accessible (each goes to the day whose stops are closest),
 * in the user's order, with the fastest routes.
 */
export function compareRequest(trip: Trip, dayIndex: number): Request {
  const days = trip.dayPlans;
  const centers = days.map((d) => {
    const ps = d.plan.stops.map((s) => d.plan.places[s.placeId]).filter(Boolean);
    return ps.length ? centroid(ps) : trip.input.origin;
  });
  const nearest = (p: LatLng) => centers.reduce((best, c, i) => (meters(c, p) < meters(centers[best], p) ? i : best), 0);
  const extra = trip.leftOut
    .filter(({ place }) => nearest(place.location) === dayIndex)
    .map(({ place }) => ({ category: place.category, query: place.name, placeId: place.id }));
  const req = days[dayIndex].plan.request;
  return { ...req, wants: [...req.wants, ...extra] };
}

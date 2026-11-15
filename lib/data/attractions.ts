// Top tourist attractions for a city (Vacation mode), via Google Places (New) Text Search. Owner: B.
import { cached } from "../db/cache";
import { fetchJson, requireKey } from "../http";
import { log } from "../log";
import type { Access, LatLng } from "../types";

export type Attraction = {
  id: string;
  name: string;
  kind?: string; // "Aquarium", "Art museum"
  address: string;
  location: LatLng;
  rating?: number;
  ratings?: number; // how many people rated it (popularity)
  access: Access; // wheelchair-accessible entrance
};

type GAttraction = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  accessibilityOptions?: { wheelchairAccessibleEntrance?: boolean };
};

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.primaryTypeDisplayName",
  "places.rating",
  "places.userRatingCount",
  "places.accessibilityOptions",
].join(",");

/** Google results → attractions, most-rated first (a fair proxy for "top"). Exported for tests. */
export function rankAttractions(raw: GAttraction[], limit = 15): Attraction[] {
  const seen = new Set<string>();
  return raw
    .filter((g) => g.id && g.location && g.displayName?.text && !seen.has(g.id) && seen.add(g.id))
    .map((g) => {
      const e = g.accessibilityOptions?.wheelchairAccessibleEntrance;
      return {
        id: g.id!,
        name: g.displayName!.text!,
        kind: g.primaryTypeDisplayName?.text,
        address: g.formattedAddress ?? "",
        location: { lat: g.location!.latitude ?? 0, lng: g.location!.longitude ?? 0 },
        rating: g.rating,
        ratings: g.userRatingCount,
        access: (e === true ? "yes" : e === false ? "no" : "unknown") as Access,
      };
    })
    .sort((a, b) => (b.ratings ?? 0) - (a.ratings ?? 0))
    .slice(0, limit);
}

/** Up to 15 top sights in `city`. Cached for a day. */
export async function topAttractions(city: string): Promise<Attraction[]> {
  const key = requireKey("GOOGLE_MAPS_API_KEY");
  const q = city.trim();
  const list = await cached(`attractions:${q.toLowerCase()}`, 24 * 3600, async () => {
    const data = await fetchJson<{ places?: GAttraction[] }>("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
      body: JSON.stringify({ textQuery: `top tourist attractions in ${q}`, pageSize: 20 }),
    });
    return rankAttractions(data.places ?? []);
  });
  log("places", `top sights in "${q}" → ${list.length} (accessible ${list.filter((a) => a.access === "yes").length})`);
  return list;
}

// GET /api/geocode?q=address -> { lat, lng, label }. geocode (B).
import { geocode } from "@/lib/data/places";
import { BadRequest, errorResponse } from "../_lib/errors";
import { fixturesOn } from "../_lib/fixtures";

export async function GET(req: Request) {
  try {
    const q = new URL(req.url).searchParams.get("q")?.trim();
    if (!q) throw new BadRequest("Add ?q=<address>.");
    if (fixturesOn()) return Response.json({ lat: 42.3868, lng: -72.5301, label: `${q} (fixture)` });
    return Response.json(await geocode(q));
  } catch (e) {
    return errorResponse(e);
  }
}

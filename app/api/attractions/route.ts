// GET /api/attractions?city=Chicago -> { city, attractions: Attraction[] }. topAttractions (B).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import { topAttractions } from "@/lib/data/attractions";
import { BadRequest, errorResponse } from "../_lib/errors";
import { fixturesOn } from "../_lib/fixtures";

export async function GET(req: Request) {
  await connection(); // per request, never prerendered
  try {
    const city = new URL(req.url).searchParams.get("city")?.trim();
    if (!city) throw new BadRequest("Which city are you visiting?");
    if (city.length > 100) throw new BadRequest("That city name is too long.");
    if (fixturesOn()) {
      const attractions = JSON.parse(await readFile(path.join(process.cwd(), "fixtures", "attractions.sample.json"), "utf8"));
      return Response.json({ city, attractions });
    }
    return Response.json({ city, attractions: await topAttractions(city) });
  } catch (e) {
    return errorResponse(e);
  }
}

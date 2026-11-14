import { afterEach, describe, expect, it, vi } from "vitest";
import { keywordParse, parseRequest, templateExplain } from "@/lib/ai";
import type { Plan } from "@/lib/types";
import sample from "@/fixtures/plan.sample.json";

describe("keywordParse (offline fallback)", () => {
  it("finds places in the order mentioned and the times", () => {
    const p = keywordParse("Lunch, a birthday gift, then the art museum. Leave at 11, home by 6.");
    expect(p.wants.map((w) => w.category)).toEqual(["lunch", "gift shop", "museum"]);
    expect(p.wants[2].query).toBe("art museum");
    expect(p).toMatchObject({ start: "11:00", end: "18:00" });
  });
  it("reads am/pm and 'until'", () => {
    expect(keywordParse("coffee then the pharmacy, leaving at 9:30am until 3pm")).toMatchObject({
      wants: [{ category: "coffee" }, { category: "pharmacy" }],
      start: "09:30",
      end: "15:00",
    });
  });
  it("returns no wants for nonsense", () => {
    expect(keywordParse("hello there").wants).toEqual([]);
  });
});

describe("parseRequest", () => {
  const ctx = { date: "2026-11-14", offset: "-05:00" };
  const here = { lat: 42.3868, lng: -72.5301 };
  const needs = { noSteps: true, gentleSlopes: true, restroom: false };
  const saved = process.env.GEMINI_API_KEY;
  afterEach(() => {
    process.env.GEMINI_API_KEY = saved;
    vi.unstubAllGlobals();
  });

  it("falls back to keywords without a Gemini key and builds ISO times", async () => {
    delete process.env.GEMINI_API_KEY;
    const r = await parseRequest("lunch and the museum, leave at 11, home by 6", needs, here, here, ctx);
    expect(r.start).toBe("2026-11-14T11:00:00-05:00");
    expect(r.end).toBe("2026-11-14T18:00:00-05:00");
    expect(r.wants.map((w) => w.category)).toEqual(["lunch", "museum"]);
  });

  it("uses Gemini's JSON when it answers", async () => {
    process.env.GEMINI_API_KEY = "test";
    const body = { wants: [{ category: "bookstore", query: "used bookstore" }], start: "13:00", end: "17:30" };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }))));
    const r = await parseRequest("somewhere with old books after lunch", needs, here, here, ctx);
    expect(r.wants).toEqual([{ category: "bookstore", query: "used bookstore" }]);
    expect(r.start).toBe("2026-11-14T13:00:00-05:00");
  });

  it("asks for at least one place", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(parseRequest("hello", needs, here, here, ctx)).rejects.toThrow(/at least one place/);
  });
});

describe("templateExplain", () => {
  const plan = sample as unknown as Plan;
  it("names the blocked place and the time home", () => {
    const s = templateExplain(plan, plan, { type: "rampBlocked", placeId: "gift-1" });
    expect(s).toMatch(/Draft Gift Shop is blocked/);
    expect(s).toMatch(/Home by 4:40 PM/);
  });
});

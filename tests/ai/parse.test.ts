import { afterEach, describe, expect, it, vi } from "vitest";
import { keywordParse, parseRequest, templateExplain } from "@/lib/ai";
import { dayWindow } from "@/lib/ai/parse";
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
  it("reads stay length, a time for a stop, and a fixed order", () => {
    const p = keywordParse("First a quick coffee, then the museum for 2 hours, lunch at 1");
    expect(p.wants).toEqual([
      { category: "coffee", query: "coffee shop", minutes: 15 },
      { category: "museum", query: "museum", minutes: 120 },
      { category: "lunch", query: "lunch restaurant", at: "13:00" },
    ]);
    expect(p.inOrder).toBe(true);
    expect(keywordParse("lunch, a gift and the museum").inOrder).toBeUndefined();
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
    const body = { wants: [{ category: "bookstore", query: "used bookstore", minutes: 45 }, { category: "x", query: "x", minutes: 9999, at: "25:00" }], start: "13:00", end: "17:30", inOrder: true };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }))));
    const r = await parseRequest("somewhere with old books after lunch", needs, here, here, ctx);
    // Valid minutes kept; out-of-range minutes and bad times dropped.
    expect(r.wants).toEqual([{ category: "bookstore", query: "used bookstore", minutes: 45 }, { category: "x", query: "x" }]);
    expect(r.inOrder).toBe(true);
    expect(r.start).toBe("2026-11-14T13:00:00-05:00");
  });

  it("asks for at least one place", async () => {
    delete process.env.GEMINI_API_KEY;
    await expect(parseRequest("ok?", needs, here, here, ctx)).rejects.toThrow(/couldn’t tell where you want to go/);
  });

  it("turns phrases into searches when no keyword matches", async () => {
    delete process.env.GEMINI_API_KEY;
    const r = await parseRequest("I want pizza, then see the river walk. Leave at 1", needs, here, here, ctx);
    expect(r.wants.map((w) => w.query)).toEqual(["pizza", "river walk"]);
    expect(r.start).toBe("2026-11-14T13:00:00-05:00");
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

describe("dayWindow (when the day runs)", () => {
  const ctx = { date: "2026-11-14", offset: "-05:00", now: "2026-11-14T19:32:00-05:00" }; // 7:32 PM

  it("leaves now (rounded up to 5 min) when no time was given, home at least 3 h later", () => {
    expect(dayWindow(undefined, undefined, ctx)).toEqual({ start: "2026-11-14T19:35:00-05:00", end: "2026-11-14T22:35:00-05:00", note: undefined });
  });

  it("moves a leave time that already passed to tomorrow, and says so", () => {
    const w = dayWindow("11:00", "18:00", ctx);
    expect(w.start).toBe("2026-11-15T11:00:00-05:00");
    expect(w.end).toBe("2026-11-15T18:00:00-05:00");
    expect(w.note).toBe("11:00 AM has already passed today, so this plan is for tomorrow.");
  });

  it("keeps a leave time later today, with the 6 PM default home time", () => {
    expect(dayWindow("13:00", undefined, { ...ctx, now: "2026-11-14T09:00:00-05:00" })).toEqual({
      start: "2026-11-14T13:00:00-05:00",
      end: "2026-11-14T18:00:00-05:00",
      note: undefined,
    });
  });

  it("a home-by time after midnight belongs to the next day", () => {
    expect(dayWindow("21:00", "01:00", { ...ctx, now: "2026-11-14T20:00:00-05:00" }).end).toBe("2026-11-15T01:00:00-05:00");
  });
});

describe("Leave at / Done by fields", () => {
  const here = { lat: 42.3868, lng: -72.5301 };
  const needs = { noSteps: true, gentleSlopes: true, restroom: false };
  it("win over times written in the text", async () => {
    delete process.env.GEMINI_API_KEY;
    const r = await parseRequest("lunch, leave at 11, home by 6", needs, here, here, {
      date: "2026-11-14",
      offset: "-05:00",
      now: "2026-11-14T09:00:00-05:00",
      leaveAt: "12:30",
      doneBy: "16:00",
    });
    expect(r.start).toBe("2026-11-14T12:30:00-05:00");
    expect(r.end).toBe("2026-11-14T16:00:00-05:00");
  });
});

describe("set-time activities and realistic stays", () => {
  it("keyword fallback marks a movie as timed with a full-length stay", () => {
    const p = keywordParse("see a movie and get groceries");
    expect(p.wants[0]).toMatchObject({ category: "movie", timed: true });
    expect(p.wants[1].timed).toBeUndefined();
  });
  it("reads a time written before the activity", () => {
    expect(keywordParse("coffee, the 5pm movie, then dinner").wants[1]).toMatchObject({ category: "movie", at: "17:00", timed: true });
  });
  it("Gemini's timed flag and showtime are kept", async () => {
    process.env.GEMINI_API_KEY = "test";
    const body = { wants: [{ category: "movie", query: "movie theater", minutes: 150, at: "17:00", timed: true }], inOrder: false };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(body) }] } }] }))));
    const r = await parseRequest("movie at 5", { noSteps: true, gentleSlopes: true, restroom: false }, { lat: 0, lng: 0 }, { lat: 0, lng: 0 }, { date: "2026-11-14", offset: "-05:00", now: "2026-11-14T09:00:00-05:00" });
    expect(r.wants[0]).toEqual({ category: "movie", query: "movie theater", minutes: 150, at: "17:00", timed: true });
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
  });
});

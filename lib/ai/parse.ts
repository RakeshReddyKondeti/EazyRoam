// parseRequest(): free text → Request. Gemini first, keyword parser as fallback. Owner: C.
import type { ParseRequest } from "../contracts";
import { UserError } from "../http";
import { log } from "../log";
import { addDays, addMin, before, roundUpIso, visitMinutes } from "../planner/geo";
import type { ParseCtx } from "../contracts";
import type { Want } from "../types";
import { geminiJson } from "./gemini";

/** Things that start at a set time; without a time we ask the user instead of guessing. */
const TIMED = new Set(["movie", "show", "sports game", "appointment"]);

type Parsed = { wants: Want[]; start?: string; end?: string; inOrder?: boolean }; // times as "HH:MM" (24 h)

// Keyword → category (and a search query that works in Places). Order matters: first match wins per phrase.
const CATEGORIES: [RegExp, string, string][] = [
  [/\bmovies?\b|\bcinema\b|\bfilm\b/, "movie", "movie theater"],
  [/\bplay\b|\bmusical\b|\btheat(er|re)\b|\bconcert\b|\bshow\b/, "show", "theater"],
  [/\b(ball )?game\b|\bstadium\b|\barena\b/, "sports game", "stadium"],
  [/\bappointment\b|\bdoctor\b|\bdentist\b/, "appointment", "doctor"],
  [/\bbreakfast\b/, "breakfast", "breakfast restaurant"],
  [/\bbrunch\b/, "brunch", "brunch restaurant"],
  [/\blunch\b/, "lunch", "lunch restaurant"],
  [/\bdinner\b|\bsupper\b/, "dinner", "dinner restaurant"],
  [/\bcoffee\b|\bcaf[eé]\b/, "coffee", "coffee shop"],
  [/\bgifts?\b|\bpresent\b/, "gift shop", "gift shop"],
  [/\bart museum\b/, "museum", "art museum"],
  [/\bmuseum\b|\bgallery\b|\bexhibit/, "museum", "museum"],
  [/\bpharmacy\b|\bprescription\b|\bdrugstore\b/, "pharmacy", "pharmacy"],
  [/\bgrocer(y|ies)\b|\bsupermarket\b/, "grocery", "grocery store"],
  [/\blibrary\b/, "library", "public library"],
  [/\bpark\b|\bgarden\b/, "park", "park"],
  [/\bbook(s|store|shop)?\b/, "bookstore", "bookstore"],
  [/\bshopping\b|\bmall\b|\bclothes\b/, "shopping", "shopping"],
  [/\bbank\b|\batm\b/, "bank", "bank"],
  [/\bpost office\b|\bmail\b/, "post office", "post office"],
];

/** "11", "11am", "6:30 pm", "noon" → "HH:MM". A bare 1–7 reads as PM ("home by 6"). */
function toHHMM(raw: string): string | undefined {
  const s = raw.toLowerCase().trim();
  if (s === "noon") return "12:00";
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?$/);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = m[2] ?? "00";
  const mer = m[3]?.replace(/\./g, "");
  if (h > 23) return undefined;
  if (mer === "pm" && h < 12) h += 12;
  else if (mer === "am" && h === 12) h = 0;
  else if (!mer && h >= 1 && h <= 7) h += 12; // "home by 6", "leave at 1" → afternoon
  return `${String(h).padStart(2, "0")}:${min}`;
}

const TIME = String.raw`(noon|\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)`;

/** "for 2 hours", "for 90 min", "1.5 hrs" → minutes. */
function durationIn(s: string): number | undefined {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h\b|minutes?|mins?|m\b)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Math.round(/^h/.test(m[2]) ? n * 60 : n);
}

/** Offline fallback: categories in the order mentioned, stay length, "at" times, leave/home times. Exported for tests. */
export function keywordParse(text: string): Parsed {
  const t = text.toLowerCase();
  const hits: { at: number; end: number; want: Want }[] = [];
  const seen = new Set<string>();
  for (const [re, category, query] of CATEGORIES) {
    const m = re.exec(t);
    if (m && !seen.has(category)) {
      seen.add(category);
      hits.push({ at: m.index, end: m.index + m[0].length, want: { category, query } });
    }
  }
  hits.sort((a, b) => a.at - b.at);
  for (const h of hits) if (TIMED.has(h.want.category)) h.want.timed = true;

  // Look just around each place for "quick", "for 2 hours", "at 1".
  hits.forEach((h, i) => {
    const after = t.slice(h.end, Math.min(hits[i + 1]?.at ?? t.length, h.end + 40));
    const beforeText = t.slice(Math.max(0, h.at - 15), h.at);
    const explicit = durationIn(after.match(/^[^,;.]*?\bfor\b[^,;.]*/)?.[0] ?? "");
    if (explicit) h.want.minutes = explicit;
    else if (/\b(quick|short|brief)\b/.test(beforeText + after.slice(0, 10))) h.want.minutes = Math.max(15, Math.round(visitMinutes(h.want.category) / 2));
    const at = after.match(new RegExp(String.raw`^\s*(?:at|around)\s+${TIME}`));
    const lead = beforeText.match(new RegExp(String.raw`\b(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.))\s*$`)); // "the 5pm movie"
    if (at) h.want.at = toHHMM(at[1]);
    else if (lead) h.want.at = toHHMM(lead[1]);
  });

  const start = t.match(new RegExp(String.raw`\b(?:leave|leaving|start|starting|depart|from|go)\w*\s+(?:at\s+|around\s+)?${TIME}`));
  const end = t.match(new RegExp(String.raw`\b(?:home|back|return|done|finish)\w*\s+(?:by|at|before|around)\s+${TIME}|\buntil\s+${TIME}`));
  return {
    wants: hits.map((h) => h.want),
    start: start ? toHHMM(start[1]) : undefined,
    end: end ? toHHMM(end[1] ?? end[2]) : undefined,
    inOrder: /\b(then|first|after that|afterwards|followed by|finally|last)\b/.test(t) || undefined,
  };
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    wants: {
      type: "ARRAY",
      description: "Places to visit, in the order the user mentioned them. Empty if they named none.",
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING", description: "Short lowercase kind of stop: lunch, coffee, gift shop, museum, pharmacy, grocery, park, library…" },
          query: { type: "STRING", description: "Text to search on a map: a named place exactly as written, or a specific kind of place" },
          minutes: { type: "INTEGER", description: "Minutes to stay: the user's words if given, otherwise a realistic estimate for a wheelchair user" },
          at: { type: "STRING", description: "HH:MM 24-hour, only if the user gave a time for this stop" },
          timed: { type: "BOOLEAN", description: "true if this happens at a set start time (movie, show, concert, game, class, appointment, reservation)" },
        },
        required: ["category", "query", "minutes"],
      },
    },
    start: { type: "STRING", description: "HH:MM 24-hour departure time, only if given" },
    end: { type: "STRING", description: "HH:MM 24-hour time they must be home by, only if given" },
    inOrder: { type: "BOOLEAN", description: "true only if the user clearly fixed the order (first, then, after that, finally)" },
  },
  required: ["wants", "inOrder"],
};

const SYSTEM = `You are the trip parser for EazyRoam, a day planner for wheelchair users who travel by public transit.
Read the user's plans for one day and return JSON matching the schema. Another system finds the places,
checks accessibility and builds the route; your only job is to understand what they asked for.

Stops (wants):
- One entry per stop they want to make, in the order they mentioned them. Only stops they asked for; never add extra ones.
- "category": a short lowercase kind of stop, e.g. "lunch", "coffee", "gift shop", "museum", "pharmacy", "grocery".
- "query": what to type into a map search. Use a named place exactly as written ("Smith College Museum of Art").
  Otherwise make it specific from their words: "a birthday present" → "gift shop"; "somewhere for sushi" → "sushi restaurant";
  "pick up my prescription" → "pharmacy"; "the art museum" → "art museum". Do not add city names, ratings or "accessible".
- Errands count as stops ("drop off a package" → post office). Going home is not a stop.

Time to stay ("minutes", required):
- Use the user's words when given: "quick coffee" ≈ 20, "for 2 hours" = 120, "an hour" = 60, "a bit" ≈ 30.
- Otherwise estimate the WHOLE activity for a wheelchair user, including arriving early, finding the accessible
  entrance and seating, and an accessible restroom stop. Never shorten an activity below its real length.
  Typical: coffee 30 · quick errand, bank or pharmacy 15–20 · grocery run 40 · shopping for a gift 40 ·
  breakfast 50 · sit-down lunch or dinner 75 · haircut or salon 75 · doctor or dentist appointment 60 ·
  gym, class or religious service 75 · park, library or waterfront 60 · museum or gallery 120 · mall 120 ·
  movie 150 (a feature film plus trailers, seating and exit) · play, concert or comedy show 180 ·
  zoo, aquarium or amusement park 180 · pro sports game 210.

Set start times ("timed"):
- "timed": true for anything that starts at a fixed time: movie, play, concert, show, sports game, class,
  religious service, appointment, reservation, tour. false for things you can do any time (shops, museums, food, parks).
- If they gave a time for it ("the 5 pm movie", "dentist at 3:30"), put it in "at". If not, leave "at" empty;
  the app will ask them. Never guess a showtime.

Times (24-hour HH:MM):
- "start": when they leave, only if said ("leave at 11" → "11:00"). "end": when they must be home, only if said
  ("home by 6" → "18:00", "back before dinner" → omit). Bare hours 1–7 mean PM; 8–11 mean AM; "noon" → "12:00".
- "at" on a stop only when they gave a time for that stop ("lunch at 1" → "13:00"). Never invent times.

Order:
- "inOrder": true only when they clearly fixed the order ("first…", "then…", "after that…", "finally…").
  A plain list ("lunch, a gift and the museum") is false, so the planner may reorder for opening hours.

If they named no stops at all, return an empty "wants" list.

Examples:
"Lunch, a birthday gift, then the art museum. Leave at 11, home by 6."
→ {"wants":[{"category":"lunch","query":"lunch restaurant","minutes":75},{"category":"gift shop","query":"gift shop","minutes":40},{"category":"museum","query":"art museum","minutes":120}],"start":"11:00","end":"18:00","inOrder":true}
"quick coffee and pick up my prescription, need to be back by 3"
→ {"wants":[{"category":"coffee","query":"coffee shop","minutes":20},{"category":"pharmacy","query":"pharmacy","minutes":15}],"end":"15:00","inOrder":false}
"Coffee, then a movie at 5 and dinner after"
→ {"wants":[{"category":"coffee","query":"coffee shop","minutes":30,"timed":false},{"category":"movie","query":"movie theater","minutes":150,"at":"17:00","timed":true},{"category":"dinner","query":"dinner restaurant","minutes":75,"timed":false}],"inOrder":true}
"see a movie and get groceries"
→ {"wants":[{"category":"movie","query":"movie theater","minutes":150,"timed":true},{"category":"grocery","query":"grocery store","minutes":40,"timed":false}],"inOrder":false}
"I'd like 2 hours at the New England Aquarium, then sushi at 1:30"
→ {"wants":[{"category":"aquarium","query":"New England Aquarium","minutes":120},{"category":"lunch","query":"sushi restaurant","minutes":75,"at":"13:30"}],"inOrder":true}`;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const FILLER =
  /\b(i|we|want|wanna|would|like|need|to|go|get|grab|visit|see|stop|at|by|the|a|an|some|my|our|then|first|after|afterwards|later|maybe|also|please|today|leave|leaving|home|back|until|around|before)\b/g;

/** Last resort when no keyword matches: each phrase becomes a search ("pizza", "the river walk"). Exported for tests. */
export function phraseParse(text: string): Want[] {
  return text
    .toLowerCase()
    .replace(new RegExp(TIME, "g"), " ")
    .split(/[,;.!?\n]|\bthen\b|\band\b/)
    .map((s) => s.replace(FILLER, " ").replace(/[^a-z0-9'& -]/g, " ").replace(/\s+/g, " ").trim())
    .filter((s) => /[a-z]{3,}/.test(s) && s.length <= 40)
    .slice(0, 5)
    .map((s) => ({ category: s, query: s }));
}

export const parseRequest: ParseRequest = async (text, needs, origin, home, ctx) => {
  let parsed: Parsed | null = null;
  try {
    const g = await geminiJson<Parsed>("parse", SYSTEM, text, SCHEMA);
    if (Array.isArray(g.wants) && g.wants.length) parsed = g;
    else log("parse", "Gemini returned no places; trying keywords");
  } catch {
    // no key, timeout or bad output: logged in geminiJson, fall back below
  }
  const kw = keywordParse(text);
  let p: Parsed = parsed ?? kw;
  let via = parsed ? "gemini" : "keywords";
  if (!p.wants.length) {
    p = { ...kw, wants: phraseParse(text) };
    via = "phrases";
  }
  const wants: Want[] = p.wants
    .filter((w) => w.category?.trim())
    .slice(0, 8)
    .map((w) => {
      const want: Want = { category: w.category.trim().toLowerCase(), query: w.query?.trim() || w.category.trim() };
      const min = Math.round(Number(w.minutes));
      if (Number.isFinite(min) && min >= 5 && min <= 600) want.minutes = min;
      if (w.at && HHMM.test(w.at)) want.at = w.at;
      if (w.timed === true || TIMED.has(want.category)) want.timed = true;
      return want;
    });
  const inOrder = Boolean(p.inOrder ?? kw.inOrder);
  log(
    "parse",
    `via ${via}: ${wants.length ? wants.map((w) => `"${w.query}" ${w.minutes ?? "default"} min${w.at ? ` at ${w.at}` : ""}`).join(", ") : "nothing found"}`,
    { start: p.start, end: p.end, inOrder },
  );
  if (!wants.length) throw new UserError("We couldn’t tell where you want to go. Try naming places, like “lunch, a pharmacy, then the art museum”.");

  const field = (v?: string) => (v && HHMM.test(v) ? v : undefined);
  const startHM = field(ctx.leaveAt) ?? (p.start && HHMM.test(p.start) ? p.start : kw.start);
  const endHM = field(ctx.doneBy) ?? (p.end && HHMM.test(p.end) ? p.end : kw.end);
  const win = dayWindow(startHM, endHM, ctx);
  log("parse", `day: ${win.start} → ${win.end}${win.note ? ` (${win.note})` : ""}`);
  return { wants, start: win.start, end: win.end, origin, home, needs, inOrder, note: win.note };
};

const hm12 = (hm: string) => {
  const [h, m] = hm.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

/**
 * When the day runs, from the user's words and the current time. Exported for tests.
 * - No leave time: leave now (rounded up to 5 min).
 * - A leave time that already passed today: the same time tomorrow, with a note.
 * - No home-by time: 6 PM, but at least 3 hours after leaving.
 */
export function dayWindow(startHM: string | undefined, endHM: string | undefined, ctx: ParseCtx) {
  const now = ctx.now ?? `${ctx.date}T00:00:00${ctx.offset}`;
  const iso = (d: string, hm: string) => `${d}T${hm}:00${ctx.offset}`;
  let date = ctx.date;
  let note: string | undefined;
  let start: string;
  if (startHM) {
    start = iso(date, startHM);
    if (before(start, now)) {
      date = addDays(date, 1);
      start = iso(date, startHM);
      note = `${hm12(startHM)} has already passed today, so this plan is for tomorrow.`;
    }
  } else start = roundUpIso(now, 5, ctx.offset);

  let end: string;
  if (endHM) {
    end = iso(start.slice(0, 10), endHM);
    if (!before(start, end)) end = iso(addDays(start.slice(0, 10), 1), endHM); // "leave at 9 pm, back by 1"
  } else {
    end = iso(start.slice(0, 10), "18:00");
    const min = addMin(start, 180);
    if (before(end, min)) end = min;
  }
  return { start, end, note };
}

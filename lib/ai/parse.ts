// parseRequest(): free text → Request. Gemini first, keyword parser as fallback. Owner: C.
import type { ParseRequest } from "../contracts";
import type { Want } from "../types";
import { geminiJson } from "./gemini";

type Parsed = { wants: Want[]; start?: string; end?: string }; // times as "HH:MM" (24 h)

// Keyword → category (and a search query that works in Places). Order matters: first match wins per phrase.
const CATEGORIES: [RegExp, string, string][] = [
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

/** Offline fallback: categories in the order mentioned + "leave at"/"home by" times. Exported for tests. */
export function keywordParse(text: string): Parsed {
  const t = text.toLowerCase();
  const hits: { at: number; want: Want }[] = [];
  const seen = new Set<string>();
  for (const [re, category, query] of CATEGORIES) {
    const m = re.exec(t);
    if (m && !seen.has(category)) {
      seen.add(category);
      hits.push({ at: m.index, want: { category, query } });
    }
  }
  hits.sort((a, b) => a.at - b.at);

  const start = t.match(new RegExp(String.raw`\b(?:leave|leaving|start|starting|depart|from|go)\w*\s+(?:at\s+|around\s+)?${TIME}`));
  const end = t.match(new RegExp(String.raw`\b(?:home|back|return|done|finish)\w*\s+(?:by|at|before|around)\s+${TIME}|\buntil\s+${TIME}`));
  return {
    wants: hits.map((h) => h.want),
    start: start ? toHHMM(start[1]) : undefined,
    end: end ? toHHMM(end[1] ?? end[2]) : undefined,
  };
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    wants: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          category: { type: "STRING", description: "Short lowercase kind of place, e.g. lunch, gift shop, museum, pharmacy" },
          query: { type: "STRING", description: "What to search on a map, e.g. 'art museum', 'birthday gift shop', or a named place" },
        },
        required: ["category", "query"],
      },
    },
    start: { type: "STRING", description: "Departure time HH:MM 24-hour, if given" },
    end: { type: "STRING", description: "Must-be-home time HH:MM 24-hour, if given" },
  },
  required: ["wants"],
};

const SYSTEM =
  "You turn a wheelchair user's plans for today into a list of places to visit, in the order they said, " +
  "plus their leave and home-by times. Only include places they asked for. Do not invent times.";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export const parseRequest: ParseRequest = async (text, needs, origin, home, ctx) => {
  let parsed: Parsed | null = null;
  try {
    const g = await geminiJson<Parsed>(SYSTEM, text, SCHEMA);
    if (Array.isArray(g.wants) && g.wants.length) parsed = g;
  } catch {
    // no key, timeout or bad output: fall back below
  }
  const kw = keywordParse(text);
  const p: Parsed = parsed ?? kw;
  const wants = p.wants.filter((w) => w.category?.trim()).map((w) => ({ category: w.category.trim().toLowerCase(), query: w.query?.trim() || w.category }));
  if (!wants.length) throw new Error("Tell us at least one place to go, like “lunch” or “the museum”.");

  const start = p.start && HHMM.test(p.start) ? p.start : (kw.start ?? "10:00");
  let end = p.end && HHMM.test(p.end) ? p.end : (kw.end ?? "18:00");
  if (end <= start) end = "21:00";
  const iso = (hm: string) => `${ctx.date}T${hm}:00${ctx.offset}`;
  return { wants, start: iso(start), end: iso(end), origin, home, needs };
};

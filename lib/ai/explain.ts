// explainChange(): one plain sentence about what changed. Gemini, else a template. Owner: C.
import type { ExplainChange } from "../contracts";
import type { Event, Plan } from "../types";
import { geminiJson } from "./gemini";

const names = (p: Plan) => p.stops.map((s) => p.places[s.placeId]?.name ?? s.placeId);
const hm = (iso: string) => {
  const m = iso.match(/T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "PM" : "AM"}`;
};

/** Deterministic sentence; also the fallback. Exported for tests. */
export function templateExplain(before: Plan, after: Plan, event: Event): string {
  const added = names(after).filter((n) => !names(before).includes(n));
  const home = `Home by ${hm(after.endAt)}.`;
  switch (event.type) {
    case "rampBlocked": {
      const gone = before.places[event.placeId]?.name ?? "That place";
      return added.length
        ? `${gone} is blocked, so you’ll go to ${added.join(" and ")} instead. ${home}`
        : `${gone} is blocked, so it’s out of your day. ${home}`;
    }
    case "elevatorOut":
      return `The elevator at ${event.stopName} is out, so your route avoids it. ${home}`;
    case "late":
      return `Leaving ${event.minutes} min later. ${after.problems ? "Some stops no longer fit; check the list." : "Everything still fits."} ${home}`;
    case "addStop":
      return added.length ? `Added ${added.join(" and ")} to your day. ${home}` : `Couldn’t fit an accessible ${event.category} into your day.`;
    case "setStay": {
      const name = after.places[event.placeId]?.name ?? "that stop";
      const h = Math.floor(event.minutes / 60);
      const len = h ? `${h} hr${event.minutes % 60 ? ` ${event.minutes % 60} min` : ""}` : `${event.minutes} min`;
      return `You’ll stay ${len} at ${name}. ${after.problems ? "Some stops no longer fit; check the list." : "The rest of the day still fits."} ${home}`;
    }
    case "setTime": {
      const name = after.places[event.placeId]?.name ?? "that stop";
      return event.at
        ? `${name} now starts at ${hm(`T${event.at}`)}. ${after.problems ? "Some stops no longer fit; check the list." : "Everything else still fits."} ${home}`
        : `${name} can be at any time now. ${home}`;
    }
  }
}

export const explainChange: ExplainChange = async (before, after, event) => {
  const fallback = templateExplain(before, after, event);
  try {
    const r = await geminiJson<{ sentence: string }>(
      "explain",
      "You write one short, calm sentence (max 25 words) telling a wheelchair user how their day changed and why. " +
        "Use only the facts given. Never claim a place is accessible unless the facts say so.",
      JSON.stringify({ event, before: names(before), after: names(after), homeBy: hm(after.endAt), problemsNow: after.problems, draft: fallback }),
      { type: "OBJECT", properties: { sentence: { type: "STRING" } }, required: ["sentence"] },
      6000,
    );
    return r.sentence?.trim() || fallback;
  } catch {
    return fallback;
  }
};

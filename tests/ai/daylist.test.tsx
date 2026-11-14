// UI render checks for C's day screen, against C's draft fixture (or A's, once it lands).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Plan } from "@/lib/types";
import { DayList } from "@/components/DayList";
import draft from "@/fixtures/plan.sample.json";

const plan = draft as unknown as Plan;
const html = renderToStaticMarkup(<DayList plan={plan} />);

describe("DayList", () => {
  it("renders every stop by name, in order", () => {
    const names = plan.stops.map((s) => plan.places[s.placeId].name);
    const idx = names.map((n) => html.indexOf(n.replace(/&/g, "&amp;")));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("renders one leg row per leg and ends at Home", () => {
    expect(html.match(/class="leg/g)?.length).toBe(plan.legs.length);
    expect(html).toContain(">Home<");
  });

  it("never shows an unknown stop as step-free", () => {
    expect(html).toContain("Accessibility unknown. Call ahead");
    expect(html).toContain("Backup: Draft Backup Gift Shop");
  });
});

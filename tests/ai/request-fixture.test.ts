import { describe, expect, it } from "vitest";
import type { Request } from "@/lib/types";
import sample from "@/fixtures/request.sample.json";

describe("fixtures/request.sample.json", () => {
  const req = sample as Request;

  it("has at least one want with a category", () => {
    expect(req.wants.length).toBeGreaterThan(0);
    for (const w of req.wants) expect(w.category).toBeTruthy();
  });

  it("starts before it ends", () => {
    expect(Date.parse(req.start)).toBeLessThan(Date.parse(req.end));
  });

  it("has valid coordinates", () => {
    for (const p of [req.origin, req.home]) {
      expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(p.lng)).toBeLessThanOrEqual(180);
    }
  });
});

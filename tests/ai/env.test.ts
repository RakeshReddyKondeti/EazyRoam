import { describe, expect, it } from "vitest";

describe("test environment", () => {
  it("loads .env.test, so tests run in fixture mode", () => {
    expect(process.env.USE_FIXTURES).toBe("1");
  });
});

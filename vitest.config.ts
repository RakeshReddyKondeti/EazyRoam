import { fileURLToPath } from "node:url";
import { loadEnvConfig } from "@next/env";
import { defineConfig } from "vitest/config";

// Load env files the way Next does in test mode: .env.test + .env (never .env.local).
(process.env as Record<string, string | undefined>).NODE_ENV ??= "test"; // vitest sets it; default for safety
loadEnvConfig(fileURLToPath(new URL(".", import.meta.url)), false);

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { include: ["tests/**/*.test.{ts,tsx}"], environment: "node" },
});

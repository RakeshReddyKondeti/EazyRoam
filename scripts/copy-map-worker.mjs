// MapLibre v6 loads its web worker from a URL computed at runtime, which Next's bundler can't see.
// Copy the worker into public/ (matching the installed version) so it is served at /maplibre-gl-worker.mjs.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("maplibre-gl/package.json"));
mkdirSync("public", { recursive: true });
copyFileSync(path.join(dist, "dist", "maplibre-gl-worker.mjs"), path.join("public", "maplibre-gl-worker.mjs"));

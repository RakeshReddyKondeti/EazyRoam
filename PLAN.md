# EazyRoam: Team Build Plan (HackUMass 19 · 12 hours · 3 people)

EazyRoam plans a whole day for a wheelchair user on public transit, anywhere in the US.
- Every place is accessible, every leg is step-free, and every stop is open when you arrive.
- It re-plans live when something changes: ramp blocked, elevator out, running late, add a stop.
- It never shows a false green check. Missing data reads "Accessibility unknown. Call ahead."

**Stack:** Next.js (App Router) + TypeScript, deployed as one Docker container on Vultr at our GoDaddy domain.

**APIs and services:**
- Gemini: parsing requests and explaining changes.
- Google Places (New), with OSM Overpass as a cross-check: places, hours, accessibility.
- Google Routes (transit), Transitland and OpenRouteService (wheelchair profile): routing and step-free checks.
- MBTA v3: live elevator outages.
- MongoDB Atlas: cache, reports.
- Tiger Data: event history.

No self-hosted routing or map servers. Map tiles come from OpenFreeMap through MapLibre GL.

## 1. The three rules that prevent clashes

1. **Everyone owns separate folders.** You only edit files in your own folders. If you need a change somewhere else, ask the owner in chat.
2. **Code against contracts and fixtures, never against each other's unfinished code.**
   - `lib/types.ts` and `lib/contracts.ts` (function signatures) are written in hour 0 and frozen.
   - Each person's functions start as **stubs that return fixture JSON**, so A, B and C can each run the whole app from minute 45, even before the real code exists.
3. **Small merges every hour.** Merge to `main` at least hourly. `main` must always pass `npm run build && npm test`.

## 2. Ownership map

| Area | Owner | Files |
|---|---|---|
| Planner & routing | **A** | `lib/planner/**`, `lib/routing/**`, `tests/planner/**`, `tests/routing/**` |
| Data, databases & deploy | **B** | `lib/data/**`, `lib/db/**`, `tests/data/**`, `Dockerfile`, `deploy/**` (Caddyfile, deploy script) |
| UI, AI, API routes & pitch | **C** | `app/**` (pages + `app/api/**`), `components/**`, `lib/ai/**`, `styles/eazyroam.css`, `tests/ai/**`, `pitch/**` |
| Shared contracts | **All (see §3)** | `lib/types.ts`, `lib/contracts.ts`, `fixtures/**` |
| Project config | **C keeps; others request** | `package.json`, `tsconfig.json`, `.env.example`, `next.config.ts` |

`fixtures/` is owned per file: `fixtures/places.*` by B, `fixtures/legs.*` and `fixtures/plan.*` by A, `fixtures/request.*` by C.

## 3. Shared contracts (written together in hour 0, then frozen)

### `lib/types.ts`
```ts
export type LatLng = { lat: number; lng: number };
export type Access = "yes" | "limited" | "no" | "unknown";
export type Needs = { noSteps: boolean; gentleSlopes: boolean; restroom: boolean };

export type Want = { category: string; query?: string };            // "lunch", "gift shop", "museum"
export type Request = { wants: Want[]; start: string; end: string;  // ISO times
                        origin: LatLng; home: LatLng; needs: Needs };

export type Hours = { open: string; close: string }[];               // today's periods, ISO
export type Place = { id: string; name: string; category: string; location: LatLng;
  address: string; phone?: string; hours: Hours;
  access: { entrance: Access; restroom: Access; seating: Access; parking: Access };
  overall: Access; sources: ("google" | "osm" | "report")[] };

export type Stop = { name: string; location: LatLng; wheelchair: Access;
                     elevatorOut?: boolean; reliability?: number };   // 0..1
export type Leg = { fromId: string; toId: string; mode: "roll" | "bus" | "rail";
  departAt: string; arriveAt: string; minutes: number; polyline: string;
  stops: Stop[]; issues: string[] };

export type PlanStop = { placeId: string; arrive: string; depart: string;
  status: "ok" | "unknown" | "bad"; reasons: string[]; backupId?: string };
export type Plan = { id: string; request: Request; places: Record<string, Place>;
  stops: PlanStop[]; legs: Leg[]; endAt: string; problems: number; explanation?: string };

export type Event =
  | { type: "rampBlocked"; placeId: string }
  | { type: "elevatorOut"; stopName: string }
  | { type: "late"; minutes: number }
  | { type: "addStop"; category: string };
```

### `lib/contracts.ts` (who implements what)
```ts
// B implements (lib/data, lib/db)
findCandidates(want: Want, near: LatLng, needs: Needs): Promise<Place[]>      // top 3, access merged
getElevatorOutages(stops: Stop[]): Promise<Set<string>>                      // stop names out now
cached<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T>     // Atlas cache
addReport(r: { placeId?: string; stopName?: string; kind: string }): Promise<void>
getReports(placeIds: string[]): Promise<Record<string, string[]>>
recordEvent(e: { kind: string; subject: string; at: Date }): Promise<void>   // Tiger
getReliability(stopNames: string[]): Promise<Record<string, number>>         // Tiger

// A implements (lib/planner, lib/routing)
buildLeg(from: Place | LatLng, to: Place | LatLng, departAt: string, needs: Needs): Promise<Leg>
makePlan(req: Request, deps: Deps): Promise<Plan>
replan(plan: Plan, event: Event, now: string, deps: Deps): Promise<Plan>
comparePlan(req: Request, deps: Deps): Promise<Plan>                         // "normal map app" + its problems

// C implements (lib/ai)
parseRequest(text: string, needs: Needs, origin: LatLng, home: LatLng): Promise<Request>
explainChange(before: Plan, after: Plan, event: Event): Promise<string>

// Deps = the B functions A needs, injected so tests can pass fakes
export type Deps = { findCandidates; getElevatorOutages; getReliability; getReports; cached };
```

**How to change a contract:**
1. Post in the team chat.
2. Get one 👍 from the person it affects.
3. Make a single small PR that touches only the contract file and its fixture.

Nobody edits contracts inside a feature branch.

### API routes (C writes them; each is a thin wrapper around A's functions)
| Route | Body → Response |
|---|---|
| `POST /api/plan` | `{ text, needs, origin, home }` → `Plan` (calls `parseRequest` → `makePlan`) |
| `POST /api/replan` | `{ plan, event, now }` → `Plan` (calls `replan`, `explainChange`, `addReport`/`recordEvent`) |
| `POST /api/compare` | `{ request }` → `Plan` (calls `comparePlan`) |

## 4. Fixtures and stubs (so nobody waits)
- `fixtures/request.sample.json`, `fixtures/places.sample.json`, `fixtures/legs.sample.json`, `fixtures/plan.sample.json` and `fixtures/plan.compare.json` are hand-written in hour 0 from the types. Use a real Amherst → Northampton day.
- Every contract function first ships as a stub that returns its fixture.
- `USE_FIXTURES=1` in `.env.local` makes the API routes return fixtures directly. C builds the whole UI this way while A and B finish the real code.
- A's unit tests use fake `Deps` that return the fixtures, so the planner never needs B's live code or API keys.
- Fixtures are **dev and test only**. The deployed app runs with `USE_FIXTURES=0`.

## 5. Git workflow
- Branch names: `a/<task>`, `b/<task>`, `c/<task>`. Keep branches short-lived (≤ 1 hour).
- Merge with `git pull --rebase origin main` first, then PR (or a fast-forward merge) into `main`. Keep it small.
- **`main` must stay green:** `npm run build && npm test` passes before every merge.
- **`package.json`:** add a dependency with its own one-line commit (`deps: add maplibre-gl`), push it right away, and tell the team. C resolves any `package.json` conflict.
- **`.env.example`:** list every new environment variable you add. Real keys go only in `.env.local`, which is git-ignored and shared privately.
- Never reformat files you don't own. Only C runs Prettier on `app/` and `components/`.

## 6. Environment variables (`.env.example`)
```
GEMINI_API_KEY=
GOOGLE_MAPS_API_KEY=          # Places (New) + Routes
ORS_API_KEY=
TRANSITLAND_API_KEY=
MBTA_API_KEY=
MONGODB_URI=
TIGER_DATABASE_URL=           # Postgres connection string
USE_FIXTURES=0
```

## 7. Hour 0 (0:00–0:45): everyone at once, without colliding

| A | B | C |
|---|---|---|
| Write `lib/types.ts` + `lib/contracts.ts` from §3 | Test every API key with one curl each (Places, Routes, ORS, Transitland, MBTA, Gemini); create Atlas DB + Tiger service; fill `.env.local` and share it privately | `npx create-next-app@latest` (TS, App Router, ESLint, no Tailwind); add vitest; import `styles/eazyroam.css` in `app/layout.tsx`; create every folder from §2 with an empty `index.ts`; push to `main` **first** |
| After C's push: write stubs for A's functions + `fixtures/legs|plan.*` | After C's push: stubs for B's functions + `fixtures/places.*` | `fixtures/request.*`, `USE_FIXTURES` switch in API routes |

**Order matters:** C pushes the scaffold first, about 15 minutes in. A and B write in their own scratch files until it lands, then commit into the new folders. That way nobody runs `create-next-app` twice.

**Done when:** `npm run dev` shows the fixture plan on screen, and `npm test` runs one passing test per person.

## 8. Tasks per person

### A: Planner & routing (`lib/planner`, `lib/routing`)
Build order (each step merges on its own):
- [ ] `lib/routing/transit.ts`: Google Routes `computeRoutes`, travelMode TRANSIT, `computeAlternativeRoutes: true`, mapped to `Leg` (stops taken from `transitDetails`). Wrap the call in B's `cached()`.
- [ ] `lib/routing/roll.ts`: ORS `/v2/directions/wheelchair` for legs under 800 m and for the walking parts of transit routes.
- [ ] `lib/routing/stops.ts`: Transitland `/stops?lat&lon&radius=60` → `wheelchair_boarding` (1 = yes, 2 = no, 0 or missing = unknown).
- [ ] `lib/routing/legs.ts`: `buildLeg()`. Try routes in order and take the first with no `no` stops. Add elevator outages and reliability from `Deps`, and fill `issues`.
- [ ] `lib/planner/solve.ts`: `makePlan()`.
  1. Rough pass: every venue choice × stop order, using straight-line estimates; keep the top 5.
  2. Real pass: run `buildLeg()` on those 5 plans.
  3. Feasibility: open on arrival and at departure, home by `end`, no `no` stops.
  4. Score: total time + unknown penalty + wait penalty.
- [ ] `lib/planner/events.ts`: `replan()` for all 4 event types, re-solving from `now` and reusing cached legs.
- [ ] `lib/planner/compare.ts`: `comparePlan()`. Take the top place per category in the user's order on Google's fastest route, ignoring accessibility, then run the same checks and count the problems.
- [ ] Tests in `tests/planner/*.test.ts` using fake `Deps`:
  - respects hours and the end time;
  - never picks a `no` place;
  - each event changes the plan correctly;
  - Compare finds ≥ 1 problem in `plan.compare.json`.

### B: Data, databases & deploy (`lib/data`, `lib/db`, `deploy`)
- [ ] `lib/db/mongo.ts`: one shared client. Collections:
  - `cache` (expiry index on `expiresAt`)
  - `places` (`2dsphere` index on `location`)
  - `reports`
- [ ] `lib/db/cache.ts`: `cached()`. Key = API name + normalised params.
- [ ] `lib/data/places.ts`: `findCandidates()`.
  - Places API (New) Text Search with `locationBias` and a field mask: `id`, `displayName`, `location`, `formattedAddress`, `nationalPhoneNumber`, `currentOpeningHours`, `accessibilityOptions`.
  - Map `wheelchairAccessibleEntrance/Restroom/Seating/Parking` to `Access`. A missing field is `unknown`.
- [ ] `lib/data/osm.ts`: Overpass lookup of `wheelchair=*` near each place, merged in. Google wins when both have data; when they conflict, use `limited`.
- [ ] `lib/db/reports.ts`: `addReport()` and `getReports()`. A "ramp blocked" report makes that place's `overall` = `no` for 24 hours.
- [ ] `lib/data/outages.ts`: `getElevatorOutages()` from MBTA v3 alerts (elevator closures), cached for 5 minutes. Other agencies return an empty set.
- [ ] `lib/db/tiger.ts`: an `events` hypertable `(at, kind, subject)`; `recordEvent()`; `getReliability()` = 1 − (outages in the last 30 days ÷ 30), clamped to 0..1.
- [ ] `Dockerfile` (Next.js standalone output) and `deploy/Caddyfile` (HTTPS for the domain).
- [ ] `deploy/deploy.sh`: build, copy to the Vultr VM, `docker compose up -d`.
- [ ] Domain: GoDaddy Registry DNS A record → Vultr IP. **First deploy by 7:00.**
- [ ] Tests in `tests/data/*.test.ts`: the Places → `Place` mapping (from a recorded response), and the access merge rules.

### C: UI, AI, API routes & pitch (`app`, `components`, `lib/ai`, `pitch`)
- [ ] Port the prototype UI to React components that use the existing CSS classes. Change no CSS class names, so `styles/eazyroam.css` works as-is.
  - `components/AskForm.tsx`: textarea plus needs chips (`.chip`).
  - `components/DayList.tsx`, `StopRow.tsx`, `LegRow.tsx`: `.list`, `.stop`, `.leg`, `.home`, and `.new`/`.fade` for changed rows.
  - `components/PlaceCard.tsx`: per-feature access rows plus the "unknown" box (`.unknown`) and the backup box (`.altbox`).
  - `components/MapView.tsx`: MapLibre GL + OpenFreeMap style, numbered pins, decoded route polylines, red marker for an elevator that's out.
  - `components/ChangeSheet.tsx`: `.fab` + `.sheet`, with the 4 events. Add "Ramp blocked" (the prototype only had elevator, late and pharmacy).
  - `components/CompareView.tsx`: side by side on wide screens, toggle on phones.
- [ ] `app/page.tsx`: screen flow ask → day (List/Map tabs) → Compare, with the `aria-live` update line.
- [ ] `app/api/plan|replan|compare/route.ts`, with the fixture switch.
- [ ] `lib/ai/parse.ts`: Gemini with a JSON response schema matching `Request`, a 4-second timeout, and a keyword fallback parser.
- [ ] `lib/ai/explain.ts`: a one-sentence change explanation, with a template fallback.
- [ ] Brand: "EazyRoam" everywhere (title, top bar, metadata).
- [ ] Accessibility pass: 375 px width, dark mode, keyboard only, VoiceOver reads plan updates.
- [ ] `pitch/`:
  - the 3-minute script: problem → normal plan fails → EazyRoam plan → "Ramp blocked" live → closing line;
  - 4–5 slides;
  - the backup video, recorded at 9:30.

## 9. Integration checkpoints (whole team, 5 minutes each)
| Time | Check |
|---|---|
| 0:45 | Fixture plan renders; everyone's stubs merged |
| 2:00 | B's real `findCandidates` replaces its stub; A's `makePlan` runs on real candidates in a test |
| 4:00 | **M1:** a typed request returns a real plan on screen (`USE_FIXTURES=0`) |
| 5:30 | Re-plan works for "Ramp blocked" and "Running late" |
| 7:00 | **M2:** all 4 events + Compare work end to end; **live on the domain** |
| 8:30 | **Feature freeze.** Only bug fixes after this |
| 9:30 | Backup video recorded |
| 10:00–11:30 | Rehearse 3 times on the live site (Amherst and Boston requests) |
| 11:30 | Submit: Gemini, MongoDB Atlas, Tiger Data, Vultr, GoDaddy Registry. The DEV post comes after the event |

## 10. If we fall behind, cut in this order
1. Tiger reliability score: keep only `recordEvent`, so the prize entry still stands.
2. Gemini `explainChange`: use template text.
3. The rough pass: route only the user's own stop order.
4. OSM cross-check: Google accessibility only.

**Never cut:** honest "unknown" handling, the four events, Compare, the live deploy.

## 11. Definition of done
- `npm run build && npm test` is green on `main`.
- The live HTTPS domain plans a real Amherst and a real Boston day.
- The 4 events re-plan in under 5 seconds.
- Compare shows real problems.
- No hard-coded place data anywhere outside `fixtures/`.

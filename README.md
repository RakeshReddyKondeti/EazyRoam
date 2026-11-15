# EazyRoam

**A day planner for wheelchair users who travel by public transit.** Tell it where you want to go today, and it plans the whole day so that every place is accessible, every bus, train and sidewalk is step-free, and everything is open when you get there. When the day changes (a blocked ramp, an elevator out, running late), it re-plans on the spot.

> Google Maps tells you whether one door is accessible. EazyRoam plans your whole day so that every door, every bus and every sidewalk is.

Built at **HackUMass 19**. Team plan, ownership and contracts: **[PLAN.md](PLAN.md)**.

---

## What it does

**Today**: type your plans in plain words ("lunch, a birthday gift, then the 5 pm movie").
- Gemini turns the text into stops, with a realistic stay for each (a movie gets 150 min, a coffee 30), any set times, and whether the order matters.
- For each stop it finds places near you (Google Places + OpenStreetMap) and checks entrance, restroom and seating access.
- It plans the order around **opening hours**, your **leave** and **done-by** times, and where you **start** and **end**.
- Every trip between stops is spelled out: **Roll › Bus 31 › Roll**, with the stop you board at, the stop you get off at, and a step-free / unknown / elevator-out chip for each.
- **Never a false green check:** missing data reads "Accessibility unknown. Call ahead", with a backup place.
- **On each stop:** **+ / −** to stay longer or shorter, and **Start at** for things with a set time (movies, appointments).
- **Something changed?** Ramp blocked, elevator out, running 30 min late, or add a stop: the rest of the day re-plans.
- **Compare**: the same request planned by "a normal map app" next to EazyRoam, with every problem listed.

**Vacation**: say which city you’re visiting and pick from its **top 15 sights** (with entrance access for each), add your own places, and choose a trip length (1 to 14 days). EazyRoam leaves out what isn't accessible, groups the rest into days by area, plans each day the same way, and lets you save trips and tick off "I've been here".

---

## Quick start (no keys, sample data)

You need **Node.js 22.12 or newer** (tested on 24) and npm.

```bash
git clone https://github.com/RakeshReddyKondeti/EazyRoam.git
cd EazyRoam
npm install
npm run dev:demo
```

Open **http://localhost:3000**. Demo mode returns fixed sample plans (`fixtures/*.json`) whatever you type, so you can click through every screen without any API keys.

---

## Run with real data

### 1. Get the keys

| Key | Required? | Where to get it |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | **Yes** | [Google Cloud Console](https://console.cloud.google.com): see below |
| `GEMINI_API_KEY` | Recommended | [Google AI Studio → API keys](https://aistudio.google.com/apikey) |
| `TRANSITLAND_API_KEY` | Recommended | [transit.land](https://www.transit.land/): sign up for a free API key |
| `ORS_API_KEY` | Recommended | [openrouteservice.org](https://openrouteservice.org/dev/#/signup): free key |
| `MONGODB_URI` | Optional | [MongoDB Atlas](https://www.mongodb.com/atlas): free cluster → *Connect* → connection string |
| `TIGER_DATABASE_URL` | Optional | [Tiger Data](https://www.tigerdata.com/): create a service → Postgres connection string |
| `MBTA_API_KEY` | Optional | [api-v3.mbta.com](https://api-v3.mbta.com/): works without a key, with a lower rate limit |

**Google Maps key, step by step:**
1. Create a project in the Cloud Console and **link billing**. This is needed even for the free monthly allowance.
2. Under **APIs & Services → Library**, enable exactly **Places API (New)** and **Routes API**.
3. Under **APIs & Services → Credentials → Create credentials → API key**, open the key and set **API restrictions** to just those two APIs. (A 403 "Permission denied" almost always means they aren't ticked.)
4. Recommended: under each API's **Quotas**, set a daily request limit. Budget alerts only email you; quotas actually stop requests.

Map tiles (OpenFreeMap) and OpenStreetMap lookups need no key.

### 2. Add them to `.env.local`

```bash
cp .env.example .env.local
```

Fill in your keys, then **delete any `USE_FIXTURES` line**. `.env.local` overrides everything else, so `USE_FIXTURES=1` there would keep showing sample data.

```bash
GOOGLE_MAPS_API_KEY=AIza...
GEMINI_API_KEY=...
TRANSITLAND_API_KEY=...
ORS_API_KEY=...
```

### 3. Start it

```bash
npm run dev                    # development, real APIs → http://localhost:3000
# or the production build:
npm run build && npm start
```

Env files are read only at start-up, so restart after editing `.env.local`. Only one dev server can run per project folder.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev:demo` | Dev server on sample data (`USE_FIXTURES=1`), no keys needed |
| `npm run dev` | Dev server with real APIs (keys from `.env.local`) |
| `npm run build` | Production build (also copies the map worker into `public/`) |
| `npm start` | Serve the production build |
| `npm test` | Unit tests (Vitest). Fixture mode, never calls real APIs, needs no keys |
| `npm run lint` | ESLint |

`main` must pass `npm run build && npm test` before every merge.

## Env files

| File | In git? | What goes in it |
|---|---|---|
| `.env.example` | yes | Every variable, documented. Copy it to start. |
| `.env.development` | yes | Non-secret defaults for `npm run dev` (`USE_FIXTURES=0`, Gemini model). |
| `.env.test` | yes | `USE_FIXTURES=1` for `npm test`. |
| `.env.local` | **no** | Your real keys. Read by `dev` and `start` (not by tests). |
| `.env.production` | **no** | Real keys for the server; `deploy/deploy.sh` uploads it. |

**Never put a key in a committed file.**

**What happens without each key** (missing keys never produce a false "accessible"):

| Key | Used for | Without it |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Places (New): places, hours, accessibility, addresses. Routes: transit | Planning returns an error naming the key |
| `GEMINI_API_KEY` | Understanding the request; explaining changes | Keyword parser + template sentences |
| `TRANSITLAND_API_KEY` | `wheelchair_boarding` for every transit stop | Stops shown as "Access unknown" |
| `ORS_API_KEY` | Wheelchair sidewalk routing (slope, kerbs) | Straight-line estimate marked "not checked" |
| `MONGODB_URI` | Atlas cache + "ramp blocked" reports | In memory (lost on restart) |
| `TIGER_DATABASE_URL` | Elevator-outage history → station reliability | No reliability scores |
| `GEMINI_MODEL` | Model override | Default `gemini-3.1-flash-lite` |

---

## How it works

```
Browser (React, MapLibre)
  │  POST /api/plan · /api/replan · /api/compare · /api/trip · GET /api/geocode · /api/attractions
  ▼
Next.js API routes (server; all keys stay here)
  ├─ Gemini ............ text → stops, stay minutes, set times, order (structured JSON)
  ├─ Google Places (New) candidates, opening hours, accessibility, addresses
  ├─ OpenStreetMap ..... wheelchair=* tags (cross-check)
  ├─ Google Routes ..... transit routes + alternatives
  ├─ Transitland ....... is each boarding/alighting stop step-free?
  ├─ OpenRouteService .. step-free sidewalk legs
  ├─ MBTA v3 ........... live elevator outages (Boston area)
  ├─ MongoDB Atlas ..... API cache, user reports
  └─ Tiger Data ........ outage history → reliability
```

The planner (`lib/planner`) tries every choice of venue × order of stops on rough travel times, builds real step-free legs for the best few, checks opening hours, set times and your done-by time, and picks the best plan. Re-planning runs the same solver again from now, with the change applied.

**Server logs** print one line per step, so you can see what happened (never keys):
```
[eazyroam:gemini] parse: ok with gemini-3.1-flash-lite in 805 ms
[eazyroam:parse] via gemini: "lunch restaurant" 75 min, "movie theater" 150 min at 17:00 {"inOrder":true}
[eazyroam:places] "lunch restaurant" → 6 found (accessible 3, partly 0, not 1, unknown 2)
[eazyroam:plan] EazyRoam: 162 options → 3 stops, 0 problems, home 18:40
```
Set `EAZYROAM_LOG=0` to turn them off.

## Project layout

| Folder | What's there | Owner (PLAN.md) |
|---|---|---|
| `app/` | Pages and API routes | C |
| `components/` | UI: ask form, day list, trip rows, map, change sheet, compare, vacation | C |
| `lib/ai/` | Gemini client, request parser, change explanations | C |
| `lib/planner/` | Solver, re-planning, Compare, Vacation trips | A |
| `lib/routing/` | Google Routes, Transitland, OpenRouteService, leg builder | A |
| `lib/data/` | Google Places, OpenStreetMap, MBTA outages | B |
| `lib/db/` | MongoDB Atlas cache + reports, Tiger Data events | B |
| `lib/types.ts`, `lib/contracts.ts` | Shared types and function contracts | All |
| `fixtures/` | Sample data for demo mode and tests (invented values) | All |
| `styles/eazyroam.css` | The design system (light + dark) | C |
| `tests/` | Vitest unit tests | All |
| `deploy/`, `Dockerfile` | Vultr deploy (Docker + Caddy HTTPS) | B |

---

## Deploy (Vultr + GoDaddy domain)

1. Create a **Vultr Cloud Compute** VM with Docker (compose plugin included).
2. In **GoDaddy Registry** DNS, point the domain's **A record** at the VM's IP.
3. Create `.env.production` locally with your real keys (no `USE_FIXTURES`).
4. Run:
   ```bash
   VULTR_HOST=root@<vm-ip> DOMAIN=<your-domain> ./deploy/deploy.sh
   ```
Caddy gets the HTTPS certificate automatically. After deploying, restrict the Google key to the VM's IP under *Application restrictions → IP addresses*.

---

## Troubleshooting

| You see | Fix |
|---|---|
| Sample places ("Draft Lunch Café") with `npm run dev` | Remove `USE_FIXTURES=1` from `.env.local` and restart |
| `places.googleapis.com 403: Permission denied` | Enable **Places API (New)** + **Routes API**, tick them under the key's API restrictions, check billing, wait 2–5 min |
| `GOOGLE_MAPS_API_KEY is not set` | Add it to `.env.local` and restart |
| "We couldn't tell where you want to go" | Name places ("lunch, a pharmacy…"); check the log for `gemini … FAILED` |
| Map is blank | Restart `npm run dev` / rebuild (it copies `public/maplibre-gl-worker.mjs`), then hard-refresh |
| "Another next dev server is already running" | Only one dev server per folder: stop the other one |
| Times look wrong | An empty **Leave at** means *now*; a leave time that already passed today plans for tomorrow (the plan says so) |

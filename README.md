# EazyRoam

**A vacation planner for wheelchair users who travel by public transit.** Pick a city and the sights you want to see. EazyRoam plans every day so that each place is accessible, each bus, train and sidewalk is step-free, and everything is open when you get there. On the day, it guides you journey by journey and re-plans on the spot when something changes, so you can travel on your own.

> Google Maps tells you whether one door is accessible. EazyRoam plans your whole trip so that every door, every bus and every sidewalk is, and checks it again on the day.

Built at **HackUMass 19**. Team plan, ownership and contracts: **[PLAN.md](PLAN.md)**.

---

## What it does

**1. Plan the trip**
- Say which city you’re visiting and pick from its **top 15 sights**, each with its entrance access. Add your own places too.
- Choose the **first day** (today up to a year ahead), the **trip length** (1 to 14 days), when you **leave** each day and when you want to be **back by**, and where you’re staying.
- EazyRoam leaves out places that aren’t accessible (and says why), groups the rest into days by area, and plans each day around **opening hours** with a realistic stay at each place.
- Every journey is spelled out: **Roll › Bus 31 › Roll**, with the stop you board at, the stop you get off at, and a step-free / unknown / elevator-out chip for each.
- **Never a false green check:** missing data reads “Accessibility unknown. Call ahead”, with a backup place.
- **Change any day:** **+ / −** on a stop to stay longer or shorter, **Start at** for set times, **Change times** for that day’s leave / back-by times. Save trips in the browser.
- **Compare** a day with what a normal map app would plan for the same places, with every problem listed.

**2. Checked again before you go**
- A trip planned weeks ahead uses routes for a typical weekday and says so. Opening a saved trip re-checks **today’s and tomorrow’s** days against fresh data: opening hours for that date, elevator outages, reports and real routes. **Check again** works on any day.
- Each re-check lists what changed in plain words (“Art Museum: Closes at 3:00 PM.”, “Getting to the Aquarium: bus 39 instead of Red Line.”) or says nothing changed.

**3. On the day: Start today**
- One card per journey, not per step: “Get to the Aquarium” lists every roll and ride, highlights the current one and ticks off finished ones, with GPS (or the timetable without GPS).
- **Next thing to do** tells you when you need the phone again (“Board the bus B43 at Main St · about 11:02”). Alerts only when it’s time to act: board, **get off soon** (about 400 m before your stop), arrived. **Buzz** and **Read aloud** can be turned on or off.
- Previous / now / next cards with smooth animations (off with “reduce motion”), a map with a “you are here” dot, and **“I’m at …”** once per place.
- Running late, a blocked ramp, an elevator out, or a stop to add: **Re-plan from here** keeps the places you’ve visited and plans the rest from where you are now.

Location stays between your phone and our server; it is never sent to Gemini. Phones only share location over HTTPS (or `localhost`).

---

## Quick start (no keys, sample data)

You need **Node.js 22.12 or newer** (tested on 24) and npm.

```bash
git clone https://github.com/RakeshReddyKondeti/EazyRoam.git
cd EazyRoam
npm install
npm run dev:demo
```

Open **http://localhost:3000**. Demo mode returns fixed sample data (`fixtures/*.json`) whatever you pick, so you can click through every screen, including **Start this day**, without any API keys.

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
| `GOOGLE_MAPS_API_KEY` | Places (New): top sights, places, hours, accessibility, addresses. Routes: transit | Planning returns an error naming the key |
| `GEMINI_API_KEY` | Explaining each re-plan in one sentence | Template sentences |
| `TRANSITLAND_API_KEY` | `wheelchair_boarding` for every transit stop | Stops shown as "Access unknown" |
| `ORS_API_KEY` | Wheelchair sidewalk routing (slope, kerbs) | Straight-line estimate marked "not checked" |
| `MONGODB_URI` | Atlas cache + "ramp blocked" / "elevator out" reports | In memory (lost on restart, not shared) |
| `TIGER_DATABASE_URL` | Elevator-outage history → station reliability | No reliability scores |
| `GEMINI_MODEL` | Model override | Default `gemini-3.1-flash-lite` |

---

## How it works

```
Browser (React, MapLibre)
  │  GET /api/attractions · POST /api/trip · /api/replan · /api/recheck · /api/compare · GET /api/geocode
  ▼
Next.js API routes (server; all keys stay here)
  ├─ Gemini ............ one-sentence explanation of each re-plan
  ├─ Google Places (New) top sights, opening hours, accessibility, addresses
  ├─ OpenStreetMap ..... wheelchair=* tags (cross-check)
  ├─ Google Routes ..... transit routes + alternatives
  ├─ Transitland ....... is each boarding/alighting stop step-free?
  ├─ OpenRouteService .. step-free sidewalk legs
  ├─ MBTA v3 ........... live elevator outages (Boston area)
  ├─ MongoDB Atlas ..... API cache, user reports
  └─ Tiger Data ........ outage history → reliability
```

The planner (`lib/planner`) finds each picked place, leaves out what isn’t accessible, groups the rest into days by area, then for each day tries every order of stops on rough travel times, builds real step-free legs for the best few, checks opening hours, set times and the back-by time, and picks the best plan. Re-planning (`events.ts`) runs the same solver from now with the change applied; **re-checking** (`recheck.ts`) runs it again on fresh data and lists the differences.

For trips more than two weeks out, transit is asked for the same weekday and time within the next two weeks (agencies publish schedules only a few weeks ahead); the day is checked again before you go.

`/api/plan` (plan one day from typed text, with Gemini parsing it) is still in the back end and its code is tested, but the app no longer has a screen for it.

**Server logs** print one line per step, so you can see what happened (never keys):
```
[eazyroam:places] top sights in "Chicago" → 15 (accessible 11)
[eazyroam:places] "Shedd Aquarium" → 1 found (accessible 1, partly 0, not 0, unknown 0)
[eazyroam:plan] EazyRoam: 6 options → 3 stops, 0 problems, home 17:40
[eazyroam:gemini] explain: ok with gemini-3.1-flash-lite in 640 ms
```
Set `EAZYROAM_LOG=0` to turn them off.

## Project layout

| Folder | What's there | Owner (PLAN.md) |
|---|---|---|
| `app/` | Pages and API routes | C |
| `components/` | UI: trip setup, trip days, live day (`LiveDay.tsx`, `live.ts`), map, change sheet, compare | C |
| `lib/ai/` | Gemini client, change explanations (and the request parser behind `/api/plan`) | C |
| `lib/planner/` | Solver, re-planning, re-checking, Compare, trips | A |
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

**You need**
- A **Vultr Cloud Compute** VM: Ubuntu, **2 GB RAM or more** (building Next.js in Docker can run out of memory on 1 GB; add swap if so), Docker with the compose plugin (`curl -fsSL https://get.docker.com | sh`), ports **80 and 443** open, SSH key login.
- A domain: in **GoDaddy Registry** DNS, point the **A record** (and `www`) at the VM’s IP **before** the first deploy, so Caddy can get the HTTPS certificate. HTTPS is required: phones only share location with HTTPS sites.
- `.env.production` on your laptop (git-ignored; the script copies it to the server): `USE_FIXTURES=0`, `GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`, and for the sponsor tracks `MONGODB_URI` and `TIGER_DATABASE_URL`. Optional: `ORS_API_KEY`, `TRANSITLAND_API_KEY`, `MBTA_API_KEY`.
- Provider settings: restrict the Google key by the **VM’s IP address** (the server calls Google, so a website restriction fails), allow the VM’s IP in Atlas **Network Access**, and set Google Cloud quotas and a budget alert.

**Deploy**
```bash
docker build .        # optional: check the image builds on your laptop first
VULTR_HOST=root@<vm-ip> DOMAIN=<your-domain> ./deploy/deploy.sh
```
The script syncs the code, uploads `.env.production`, and runs `docker compose up -d --build` (the app plus Caddy for HTTPS). Then open `https://<your-domain>` on a phone and try **Start today**.

---

## Troubleshooting

| You see | Fix |
|---|---|
| Sample places ("Draft Lunch Café") with `npm run dev` | Remove `USE_FIXTURES=1` from `.env.local` and restart |
| `places.googleapis.com 403: Permission denied` | Enable **Places API (New)** + **Routes API**, tick them under the key's API restrictions, check billing, wait 2–5 min |
| `GOOGLE_MAPS_API_KEY is not set` | Add it to `.env.local` and restart |
| "We couldn’t find top sights" | Add the state, e.g. “Portland, OR” |
| “Location off · following the timetable” on the live day | Allow location for the site; on a phone the site must be HTTPS |
| No buzz on iPhone | iPhones don’t let websites vibrate; turn on **Read aloud** |
| Map is blank | Restart `npm run dev` / rebuild (it copies `public/maplibre-gl-worker.mjs`), then hard-refresh |
| "Another next dev server is already running" | Only one dev server per folder: stop the other one |
| “You’re N min behind the plan” right after Start | The day was planned for earlier than now; tap **Re-plan the rest of my day** |
| Trip starts tomorrow, not today | A trip starting today after its leave time starts the next day |

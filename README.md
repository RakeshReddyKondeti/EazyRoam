# EazyRoam

Plan a whole day on public transit where every place, bus and sidewalk is wheelchair accessible, and re-plan live when something changes.

Built at HackUMass 19. **Team plan, ownership and contracts: [PLAN.md](PLAN.md).**

## Run it

```bash
npm install
cp .env.example .env.local   # fill in keys; or USE_FIXTURES=1 to run on sample data
npm run dev                  # http://localhost:3000
npm test                     # vitest
npm run build                # must pass before every merge to main
```

What each key unlocks (missing keys never produce a false "accessible"):

| Key | Used for | Without it |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | Places (New) search, hours, accessibility; Routes transit | Planning returns a 503 naming the key |
| `GEMINI_API_KEY` | Understanding the typed request; explaining changes | Keyword parser + template sentences |
| `ORS_API_KEY` | Wheelchair sidewalk routing (slope, kerbs) | Straight-line estimate marked "not checked" |
| `TRANSITLAND_API_KEY` | `wheelchair_boarding` for every stop | Stops shown as "unknown" |
| `MBTA_API_KEY` | Live elevator outages (Boston area) | Still works, lower rate limit |
| `MONGODB_URI` | Atlas cache + user reports | In-memory (lost on restart) |
| `TIGER_DATABASE_URL` | Outage history → station reliability | No reliability scores |

OpenStreetMap (Overpass) and map tiles (OpenFreeMap) need no key.

## Deploy (Vultr + GoDaddy domain)

1. Create a Vultr Cloud Compute VM with Docker (compose plugin included).
2. Point the domain's A record at the VM's IP in GoDaddy Registry DNS.
3. Create `.env.production` locally with real keys and `USE_FIXTURES=0`.
4. `VULTR_HOST=root@<vm-ip> DOMAIN=<your-domain> ./deploy/deploy.sh`

Caddy gets the HTTPS certificate automatically. See `Dockerfile` and `deploy/`.

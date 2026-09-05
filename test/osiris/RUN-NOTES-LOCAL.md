# OSIRIS — local run notes (sandbox, no Docker)

Cloned from https://github.com/simplifaisoul/osiris at commit `301e697` (master).

Docker is unavailable in this environment, so the compose stack was reproduced
natively as two Node processes.

## What is running

| Service | Command | Port | Bind |
|---|---|---|---|
| OSIRIS Web UI (Next.js 16) | `npm start` in `/home/user/osiris` | 3000 | 0.0.0.0 |
| OSIRIS Intel Layer (Express) | `npm start` in `/home/user/osiris/intel` | 4000 | 0.0.0.0 |

Optional compose services NOT started:
- `osiris-cache` (nginx on 8080) — a caching reverse proxy only.
- `umami_default` network / Umami analytics — `src/middleware.ts` beacons page
  views to `http://umami-umami-1:3000/api/send`. Those fetches are
  `.catch(() => {})` guarded, so a missing Umami is silent and harmless.

## The one change made to the clone

`.env` was created from `.env.example`, with one added line:

```
INTEL_URL=http://localhost:4000
```

Why: `src/app/api/entity/expand/route.ts` picks its upstream by environment —

```ts
const INTEL_URL = process.env.INTEL_URL || (
  process.env.NODE_ENV === 'production'
    ? 'http://osiris-intel:4000'   // compose service hostname
    : 'http://localhost:4000'
);
```

Running `next start` sets `NODE_ENV=production`, so the proxy defaulted to the
Docker service name `osiris-intel`, which does not resolve outside compose.
The route returned `502 {"error":"Intelligence layer unavailable"}` with
`[OSIRIS] Intel proxy error: fetch failed` in the log. Setting `INTEL_URL`
fixes it without touching source. No application source files were modified.

All API keys were left empty — the app is keyless by design.

## Restart commands

```bash
cd /home/user/osiris/intel && npm start &
cd /home/user/osiris && HOSTNAME=0.0.0.0 PORT=3000 npm start
```

A production build already exists in `.next/`. To rebuild: `npm run build`.

## Known-benign log lines

- `⚠ "next start" does not work with "output: standalone"` — Next.js prefers
  `node .next/standalone/server.js` (the Docker entrypoint). `next start`
  serves the same build correctly; verified below.
- `Failed to set Next.js data cache ... items over 2MB` — Next.js skips caching
  payloads above 2 MB (`/api/cctv` is ~7.7 MB). Informational, not an error.

## Expected limitations here

- **RECON toolkit → 503** by design. `/api/scanner` returns
  `{"error":"Scanner not configured","hint":"Set SCANNER_URL and SCANNER_KEY in .env"}`.
  The separate OSIRIS scanner backend is not part of this repo.
- **Turn-by-turn directions are slow on the first call.** `valhalla1.openstreetmap.de`
  is unreachable from this sandbox (connect hangs, HTTP 000 at 25 s), so the
  route burns two 20 s Valhalla attempts before the OSRM fallback answers.
  Driving routes still resolve; walking/cycling need Valhalla and will fail
  here. Verified: `/api/directions` across central London returned
  `{"provider":"osrm","distance":1901.8,"duration":316.8}` after ~61 s.
- `engine/` ships only `__pycache__/*.pyc` — the Python sources are not in the
  repo, so that component cannot be run from this clone.

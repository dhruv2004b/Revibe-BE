# ReVibe API

Backend for ReVibe, an AI-assisted mental wellness app: mood check-ins, insights, daily tasks, Vibe Coins, rewards, an anonymous moderated community, consultation booking and helplines.

Node 20–22, TypeScript, Express 5. API contract: [docs/api.md](docs/api.md).

## Run locally

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

The server listens on `http://localhost:8080`. With the defaults it needs no accounts:
- in-memory store, wiped on restart
- mock sign-in: `Authorization: Bearer dev:<any-id>`
- offline sentiment scoring (set `HF_TOKEN` to use Hugging Face)

```powershell
curl http://localhost:8080/health
curl -H "Authorization: Bearer dev:demo1" http://localhost:8080/v1/me
```

## Test

```powershell
npm test          # unit + API tests
npm run typecheck
npm run build     # compiles to dist/
```

## How it is put together

| Folder | Contents |
|---|---|
| `src/domain` | Types, catalogs (tasks, rewards, helplines), coin and streak rules, time handling |
| `src/services` | Crisis detection, sentiment (Hugging Face with offline fallback), recommender, moderation, insights |
| `src/store` | `Store` interface, `MemoryStore` (local/demo), `FirestoreStore` (production) |
| `src/http` | Auth, validation, error format, routes |
| `src/keepalive.ts` | Self-ping that keeps a Render free instance awake |

Rules that hold everywhere:
- Only the server changes coins, streaks and rewards. Firestore rules block client writes.
- The crisis check is local and runs before any AI call.
- If Hugging Face is missing, slow or failing, the offline scorer answers instead.
- Day boundaries use `APP_TIME_ZONE` (default Asia/Kolkata).
- Production refuses mock sign-in and the memory store unless `ALLOW_DEMO_MODE=true`.

## Deploy on Render (free tier)

1. Render dashboard > **New > Blueprint** > select this repository. `render.yaml` creates the `revibe-api` free web service.
2. Wait for the first deploy, then open `https://<service>.onrender.com/health`.

What the blueprint sets up for the free tier:
- **Build** `npm ci --include=dev && npm run build`, **start** `npm start`, **health check** `/health`.
- **Memory**: `NODE_OPTIONS=--max-old-space-size=384` keeps Node under the 512 MB limit.
- **Shutdown**: the server finishes in-flight requests on `SIGTERM`, which Render sends on deploys.
- **Never sleeps**: free services sleep after 15 minutes without traffic. The server pings its own public `/health` (Render sets `RENDER_EXTERNAL_URL`) every 10 minutes. An always-on free service uses about 744 of the 750 free hours a month, so keep only one such service on the account. Turn it off with `KEEP_ALIVE=false`.
- **Backup ping**: `.github/workflows/keep-alive.yml` hits `/health` every 30 minutes from GitHub Actions (inside the free Actions minutes, even for a private repo), which also wakes the service after a restart. Enable it by adding a repository variable `RENDER_HEALTH_URL` = `https://<service>.onrender.com/health` (Settings > Secrets and variables > Actions > Variables).

### Demo mode (current) vs live

The blueprint starts in **demo mode** (`ALLOW_DEMO_MODE=true`, `AUTH_MODE=mock`, `STORE_MODE=memory`) so the app can be tested before Firebase exists. In demo mode anyone can act as any user, and data is lost on every redeploy or restart. Do not use it with real users.

To go live, in the Render dashboard:
1. Set `AUTH_MODE=firebase`, `STORE_MODE=firestore`, `ALLOW_DEMO_MODE=false`.
2. Set `FIREBASE_CREDENTIALS` to the service account JSON (Firebase console > Project settings > Service accounts), pasted as one line.
3. Optionally set `HF_TOKEN`.
4. Deploy `firestore.rules` and `firestore.indexes.json` with the Firebase CLI.

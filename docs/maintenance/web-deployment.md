# Web Deployment

How to deploy the SPEX web demo to production.

## Architecture

```
User Browser
  └─ https://REDACTED_WEB_APP (Cloudflare Pages - static)
       ├─ API calls → https://REDACTED_BACKEND_URL (Render - FastAPI)
       │                 └─ DB → Neon PostgreSQL (free tier)
       ├─ Agora calls → https://REDACTED_TOKEN_SERVER (existing Worker)
       └─ Error reports → Worker /report-error → Discord webhook (proxied, rate-limited)
```

**Cost: $0/month** (all free tiers)

## Redeploying the Web App

```bash
./scripts/deploy-web.sh
```

This script:
1. Loads `.env.production` (must exist at project root)
2. Runs `npx expo export --platform web`
3. Strips any source maps from the build
4. Deploys `dist/` to Cloudflare Pages (`spex-demo` project)

**Prerequisites:**
- `.env.production` exists (see below)
- `npx wrangler login` has been run at least once
- Cloudflare Pages project `spex-demo` exists (`npx wrangler pages project create spex-demo`)

## Environment Variables

### Web App (.env.production)

| Variable | Value |
|----------|-------|
| `EXPO_PUBLIC_AGORA_APP_ID` | Agora app ID |
| `EXPO_PUBLIC_AGORA_TOKEN_SERVER_URL` | `https://REDACTED_TOKEN_SERVER/` |
| `EXPO_PUBLIC_SPEX_VIEWER_URL_BASE` | `https://REDACTED_VIEWER_URL/view/` |
| `EXPO_PUBLIC_BACKEND_URL` | `https://REDACTED_BACKEND_URL` |
| `EXPO_PUBLIC_TAGGING_API_URL` | `https://REDACTED_BACKEND_URL` |

Note: `EXPO_PUBLIC_DISCORD_WEBHOOK_URL` is **not** set in the web bundle. Error reports go through the Worker proxy (`/report-error`) instead.

### Backend (Render Dashboard)

Set these in Render's Environment settings:

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Neon PostgreSQL connection string (`postgresql+asyncpg://...`) |
| `GOOGLE_API_KEY` | Gemini AI |
| `OPENAI_API_KEY` | Transcription + embeddings |
| `COHERE_API_KEY` | Reranking |
| `PINECONE_API_KEY` | RAG vector DB |
| `PINECONE_INDEX_NAME` | |
| `PINECONE_INDEX_HOST` | |
| `AWS_ACCESS_KEY_ID` | DynamoDB conversation history |
| `AWS_SECRET_ACCESS_KEY` | |
| `AWS_REGION` | |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Google Drive uploads |
| `GOOGLE_PRIVATE_KEY` | Multiline - paste carefully |
| `GOOGLE_PROJECT_ID` | |
| `GOOGLE_GEOCODING` | |
| `BRAVE_API_KEY` | Web search tool |
| `SECRET_KEY` | JWT signing (generate a new random value!) |

### Cloudflare Worker Secrets

```bash
cd cloudflare-workers
npx wrangler secret put DISCORD_WEBHOOK_URL
# Paste the Discord webhook URL when prompted
```

## Services

| Service | Dashboard | URL |
|---------|-----------|-----|
| Web app | [Cloudflare Pages](https://dash.cloudflare.com/) | `https://REDACTED_WEB_APP` |
| Backend | [Render](https://dashboard.render.com/) | `https://REDACTED_BACKEND_URL` |
| Database | [Neon](https://console.neon.tech/) | Connection string in Render env vars |
| Agora Worker | [Cloudflare Workers](https://dash.cloudflare.com/) | `https://REDACTED_TOKEN_SERVER/` |

## Troubleshooting

### Render cold starts
After 15 min idle, first request takes ~30-50s. Subsequent requests are fast. This is normal for the free tier.

### CORS errors
The backend has `allow_origins=["*"]`. If CORS errors appear, check that the backend is actually running (not in cold start).

### Database tables missing
The backend uses `create_all()` in its lifespan handler. Tables should auto-create on first request. If not, check Render logs for SQLAlchemy errors and verify the `DATABASE_URL` format uses `postgresql+asyncpg://`.

### Source maps visible in DevTools
The deploy script strips `.map` files. If they still appear, check that `expo export` isn't generating inline source maps. Run `./scripts/deploy-web.sh` again.

### Error reports not reaching Discord
1. Check the Worker has `DISCORD_WEBHOOK_URL` secret set (`npx wrangler secret list`)
2. Check the Worker is deployed (`cd cloudflare-workers && npm run deploy`)
3. Check rate limiting isn't blocking (max 10 reports per IP per minute)

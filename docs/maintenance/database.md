# Database

## Overview

The backend uses **PostgreSQL** hosted on **Neon** (serverless Postgres). The backend (FastAPI) runs on **Render** and connects to Neon via the `DATABASE_URL` environment variable set in the Render dashboard.

- **Provider**: Neon (neon.tech)
- **Region**: EU West 2 (London)
- **Database name**: `neondb`
- **ORM**: SQLAlchemy (async) with `asyncpg` driver
- **Connection string format**: `postgresql+asyncpg://user:pass@host/db?ssl=require`

## Schema

All models live in `~/coding/backend-with-testing-frontend/SuperSpexWins/models/`. The database is created via `Base.metadata.create_all()` in the init script.

### Enum Types

| Type | Values |
|------|--------|
| `plantype` | free, solo, team, enterprise |
| `memberrole` | owner, admin, member |
| `memberpermission` | full, half |
| `invitestate` | pending, accepted, expired, cancelled |
| `billingcycle` | monthly, yearly |
| `cancellationreason` | user_request, payment_failed, admin_action, other |
| `braintypeenum` | community, private |

### Tables (dependency order)

**Tier 1 — No foreign keys:**

| Table | Model file | Purpose |
|-------|-----------|---------|
| `users` | `user.py` | User accounts (email, password, stripe, firebase) |
| `blacklisted_tokens` | `blacklist.py` | JWT invalidation |
| `subscription_plans` | `subscription.py` | Plan definitions (free/solo/team/enterprise) |
| `userbrainuploadstatus` | `brain_upload_status_tables.py` | User-facing brain upload tracking |
| `adminbrainuploadstatus` | `brain_upload_status_tables.py` | Admin-facing brain upload tracking |

**Tier 2 — Depends on users / subscription_plans:**

| Table | Model file | Purpose |
|-------|-----------|---------|
| `user_subscriptions` | `subscription.py` | Active user subscriptions (Stripe) |
| `user_settings` | `user_settings.py` | User preferences (tone, expertise, notifications) |

**Tier 3 — Depends on users + user_subscriptions:**

| Table | Model file | Purpose |
|-------|-----------|---------|
| `payment_history` | `subscription.py` | Stripe payment records |
| `subscription_cancellations` | `subscription.py` | Cancellation records with refund tracking |
| `organizations` | `organization.py` | Org with owner, industry, subscription link |

**Tier 4 — Depends on organizations:**

| Table | Model file | Purpose |
|-------|-----------|---------|
| `org_seats` | `organization.py` | Purchased seats (Stripe payment per seat) |
| `org_memberships` | `organization.py` | User-org membership with role/permission |
| `org_invites` | `organization.py` | Pending invites with token + expiry |
| `org_google_drive_folders` | `organization.py` | Linked Google Drive folders per org |
| `organization_branding` | `organization_branding.py` | Logo + customizable card content |
| `tips_and_tricks` | `tips_and_tricks.py` | User-created tips with categories/tags |
| `tip_reactions` | `tips_and_tricks.py` | Likes on tips (unique per user per tip) |
| `tea_colour_preferences` | `tea_colour_preference.py` | Tea colour analysis results (YOLO + S3 image) |

### Key Relationships

- `users` 1:1 `user_settings`, 1:1 `user_subscriptions`
- `organizations` → `users` (owner), → `user_subscriptions` (subscription)
- `org_memberships` → `organizations`, `users`, `org_seats`
- `tea_colour_preferences` → `users` (PK is user_id), → `organizations` (optional)

### DynamoDB Tables (not in PostgreSQL)

`metadata_lookup_tables.py` defines Pydantic models (not SQLAlchemy) for two DynamoDB tables:
- `CommunityDocumentMetadata` — metadata for community brain uploads
- `PrivateDocumentMetadata` — metadata for private/org brain uploads

These are managed via AWS SDK, not the PostgreSQL database.

## Initialization

### Init Script

```
~/coding/backend-with-testing-frontend/SuperSpexWins/scripts/init_fake_db.py
```

This script:
1. Calls `Base.metadata.create_all()` — creates all tables (idempotent, skips existing)
2. Seeds a dev user (`dev@example.com` / `devpassword123`), user settings, dev org (`DevOrg`), and owner membership

### Running Against Neon (from local machine)

```bash
cd ~/coding/backend-with-testing-frontend/SuperSpexWins
source .venv/bin/activate
DATABASE_URL="postgresql+asyncpg://<user>:<pass>@<host>/<db>?ssl=require" PYTHONPATH=. python3 scripts/init_fake_db.py
```

**Important**: Use `postgresql+asyncpg://` scheme (not `postgresql://`) and `ssl=require` (not `sslmode=require`) — asyncpg uses different SSL parameter names.

### Fresh Setup (if DB is empty or corrupted)

1. In Neon SQL console: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`
2. Run the init script above
3. The script is idempotent — safe to re-run (checks for existing dev user by email)

### Render Integration

- Render's **free tier** does not support Shell or Pre-Deploy commands
- The Dockerfile (`CMD`) only starts gunicorn — no DB init step
- DB must be initialized manually via the local init script or Neon SQL console
- The `DATABASE_URL` env var is set in Render's dashboard (Environment section)
- On every deploy, Render rebuilds the Docker image and starts the server — the Neon DB persists independently

## Gotchas

- **CORS on DB errors**: If the backend hits an unhandled DB exception (e.g., missing table), the 500 response may not include CORS headers. The browser reports this as "CORS Missing Allow Origin" — but the root cause is the DB error, not CORS config.
- **Sequence gaps**: If you manually insert rows then delete them, PostgreSQL sequences don't reset. The next auto-generated ID will skip numbers. Use `SELECT setval('tablename_id_seq', (SELECT MAX(id) FROM tablename));` to fix.
- **Free tier cold starts**: Render free tier sleeps after 15 min. Neon free tier also suspends after 5 min of inactivity. First request after sleep may be slow (30-60s) as both services wake up.

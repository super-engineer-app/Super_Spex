#!/usr/bin/env bash
#
# Deploy SPEX web app to Cloudflare Pages.
#
# Usage:
#   ./scripts/deploy-web.sh
#
# Prerequisites:
#   - .env.production exists at project root
#   - wrangler is authenticated (npx wrangler login)
#   - Cloudflare Pages project "spex-demo" exists
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

# ── 1. Load production environment ──────────────────────────────────────────

ENV_FILE=".env.production"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found. Create it first (see docs/maintenance/web-deployment.md)."
  exit 1
fi

echo "Loading $ENV_FILE..."
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

# ── 2. Clean previous build ────────────────────────────────────────────────

echo "Cleaning dist/..."
rm -rf dist

# ── 3. Export static web build ──────────────────────────────────────────────

echo "Building web app..."
npx expo export --platform web

# ── 4. Verify no source maps leaked ────────────────────────────────────────

MAP_COUNT=$(find dist -name '*.map' 2>/dev/null | wc -l)
if [[ "$MAP_COUNT" -gt 0 ]]; then
  echo "WARNING: Found $MAP_COUNT source map files in dist/. Removing..."
  find dist -name '*.map' -delete
fi

# ── 5. Verify _redirects exists ─────────────────────────────────────────────

if [[ ! -f "dist/_redirects" ]]; then
  echo "WARNING: _redirects not found in dist/. Copying from public/..."
  cp public/_redirects dist/_redirects
fi

# ── 6. Deploy to Cloudflare Pages ──────────────────────────────────────────

echo "Deploying to Cloudflare Pages..."
npx wrangler pages deploy dist/ --project-name=spex-demo

echo ""
echo "Deploy complete! App available at: https://spex-demo.pages.dev"

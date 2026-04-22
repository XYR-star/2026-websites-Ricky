#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
TARGET_DIR="/var/www/ricky-site"

cd "$PROJECT_ROOT"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> Building site"
  npm run build
fi

echo "==> Preparing target directory"
mkdir -p "$TARGET_DIR"

echo "==> Syncing files"
cp -r "$DIST_DIR"/. "$TARGET_DIR"/

echo "==> Reloading nginx"
systemctl reload nginx

if [[ "${SKIP_ADMIN_RESTART:-0}" != "1" ]]; then
  echo "==> Restarting admin service"
  systemctl restart ricky-admin.service
fi

echo "==> Deploy complete"

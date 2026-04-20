#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$PROJECT_ROOT/dist"
TARGET_DIR="/var/www/ricky-site"

echo "==> Building site"
cd "$PROJECT_ROOT"
npm run build

echo "==> Preparing target directory"
mkdir -p "$TARGET_DIR"

echo "==> Syncing files"
cp -r "$DIST_DIR"/. "$TARGET_DIR"/

echo "==> Reloading nginx"
systemctl reload nginx

echo "==> Deploy complete"

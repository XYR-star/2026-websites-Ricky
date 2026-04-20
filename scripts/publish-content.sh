#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$PROJECT_ROOT"
rm -rf .astro
echo "==> Building site"
npm run build

echo "==> Deploying site"
SKIP_BUILD=1 bash scripts/deploy.sh

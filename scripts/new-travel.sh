#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEMPLATE="$PROJECT_ROOT/templates/travel-post.md"
TARGET_DIR="$PROJECT_ROOT/src/content/travel"
DATE_PREFIX="$(date +%F)"
SLUG="${1:-untitled-trip}"
TARGET_FILE="$TARGET_DIR/${DATE_PREFIX}-${SLUG}.md"

if [[ -e "$TARGET_FILE" ]]; then
  echo "File already exists: $TARGET_FILE" >&2
  exit 1
fi

cp "$TEMPLATE" "$TARGET_FILE"
echo "Created: $TARGET_FILE"

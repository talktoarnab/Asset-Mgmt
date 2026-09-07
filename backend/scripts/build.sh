#!/usr/bin/env bash
# Copy the Lambda source into artifacts/api for Terraform's archive_file.
# boto3 ships in the Python Lambda runtime, so there is nothing to bundle.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/artifacts/api"

rm -rf "$ROOT/artifacts"
mkdir -p "$DEST"
cp "$ROOT/src/handler.py" "$DEST/"
cp -R "$ROOT/src/lib" "$DEST/lib"
cp -R "$ROOT/src/domain" "$DEST/domain"

find "$DEST" -type d -name '__pycache__' -exec rm -rf {} +
find "$DEST" -type f ! -name '*.py' -delete

echo "copied api -> artifacts/api (handler.py)"

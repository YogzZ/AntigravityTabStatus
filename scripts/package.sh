#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

resolve_node() {
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi
  local candidate=""
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node; do
    if [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done
  echo "Error: Node.js not found on PATH or under \$HOME/.nvm" >&2
  return 1
}

NODE_BIN="$(resolve_node)"

echo "[1/3] Running verification suite..."
"$NODE_BIN" "$ROOT_DIR/scripts/verify.mjs"

VERSION="$("$NODE_BIN" -e '
const fs = require("fs");
const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (!m.version || !/^\d+\.\d+\.\d+/.test(m.version)) {
  throw new Error("Invalid manifest version: " + m.version);
}
process.stdout.write(m.version);
' "$ROOT_DIR/manifest.json")"

DIST_DIR="$ROOT_DIR/dist"
OUT_ZIP="$DIST_DIR/antigravity-tab-status-v${VERSION}.zip"
STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT

echo "[2/3] Staging clean runtime files for v${VERSION}..."
RUNTIME_FILES=(
  manifest.json
  background.js
  i18n.js
  page-bridge.js
  scanner.js
  content.js
  frame-detector.js
  popup.html
  sidepanel.html
  popup.css
  popup.js
)

for f in "${RUNTIME_FILES[@]}"; do
  cp "$ROOT_DIR/$f" "$STAGE_DIR/$f"
  chmod 0644 "$STAGE_DIR/$f"
done

mkdir -p "$STAGE_DIR/icons" "$STAGE_DIR/_locales" "$DIST_DIR"
chmod 0755 "$STAGE_DIR/icons" "$STAGE_DIR/_locales"

for icon in icon16.png icon32.png icon48.png icon128.png; do
  cp "$ROOT_DIR/icons/$icon" "$STAGE_DIR/icons/$icon"
  chmod 0644 "$STAGE_DIR/icons/$icon"
done

for locale_dir in "$ROOT_DIR"/_locales/*; do
  [ -d "$locale_dir" ] || continue
  loc_name="$(basename "$locale_dir")"
  mkdir -p "$STAGE_DIR/_locales/$loc_name"
  chmod 0755 "$STAGE_DIR/_locales/$loc_name"
  cp "$locale_dir/messages.json" "$STAGE_DIR/_locales/$loc_name/messages.json"
  chmod 0644 "$STAGE_DIR/_locales/$loc_name/messages.json"
done

rm -f "$OUT_ZIP"

echo "[3/3] Building $OUT_ZIP..."
if command -v zip >/dev/null 2>&1; then
  (cd "$STAGE_DIR" && zip -rqX "$OUT_ZIP" .)
elif command -v python3 >/dev/null 2>&1; then
  python3 - "$STAGE_DIR" "$OUT_ZIP" <<'PY'
import os
import sys
import zipfile

stage_dir, out_zip = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for root, dirs, files in os.walk(stage_dir):
        dirs.sort()
        for name in sorted(files):
            full = os.path.join(root, name)
            rel = os.path.relpath(full, stage_dir).replace(os.sep, "/")
            zf.write(full, rel)
PY
else
  echo "Error: neither zip nor python3 is installed to create archive." >&2
  exit 1
fi

FILE_COUNT="$("$NODE_BIN" -e '
const fs = require("fs");
const path = require("path");
function count(dir) {
  let total = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    total += e.isDirectory() ? count(p) : 1;
  }
  return total;
}
process.stdout.write(String(count(process.argv[1])));
' "$STAGE_DIR")"

SIZE_BYTES="$(wc -c < "$OUT_ZIP" | tr -d ' ')"
echo "Built $OUT_ZIP (${SIZE_BYTES} bytes, ${FILE_COUNT} runtime files)."

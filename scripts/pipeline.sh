#!/bin/bash
# Full Gent 3D tile pipeline: fetch → unzip → convert
# Usage: npm run pipeline:gent3d [-- --dry-run] [-- --force] [-- --limit=N]
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

DWG_DIR="$PROJECT_DIR/data/dwg"
GENT3D_DIR="$PROJECT_DIR/data/gent3d"

# ── Step 1: Fetch and download all tile zips ──────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Step 1: Downloading Gent 3D tile zips"
echo "═══════════════════════════════════════════════════════════"
npm --prefix "$PROJECT_DIR" run fetch:gent3d -- "$@"

# ── Step 2: Extract DWG files from zips ──────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Step 2: Extracting DWG files from zips"
echo "═══════════════════════════════════════════════════════════"
mkdir -p "$DWG_DIR"

if ! command -v unzip &> /dev/null; then
  echo "Error: 'unzip' is not installed. Please run: brew install unzip" >&2
  exit 1
fi

found_zips=0
for zip in "$GENT3D_DIR"/*.zip; do
  [ -e "$zip" ] || continue
  found_zips=$((found_zips + 1))
  echo "Extracting $(basename "$zip")..."
  # -j: junk paths (no subdirs), -o: overwrite, extract .dwg only
  unzip -jo "$zip" "*.dwg" "*.DWG" -d "$DWG_DIR" 2>/dev/null || true
done

if [ "$found_zips" -eq 0 ]; then
  echo "No zip files found in $GENT3D_DIR — nothing to extract."
  exit 0
fi

dwg_count=$(find "$DWG_DIR" -maxdepth 1 -name "*.dwg" -o -name "*.DWG" 2>/dev/null | wc -l | tr -d ' ')
echo "Extracted $dwg_count DWG file(s) into $DWG_DIR"

# ── Step 3: Build converter image if absent ───────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Step 3: Checking converter Docker image"
echo "═══════════════════════════════════════════════════════════"
if ! docker image inspect dwg-converter > /dev/null 2>&1; then
  echo "Image not found — building dwg-converter..."
  docker build -t dwg-converter -f "$PROJECT_DIR/Dockerfile.converter" "$PROJECT_DIR"
else
  echo "dwg-converter image already present."
fi

# ── Step 4: Convert DWG → GLB ────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Step 4: Converting DWG files to GLB"
echo "═══════════════════════════════════════════════════════════"
cd "$PROJECT_DIR"
bash scripts/convert-all.sh

echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Pipeline complete. GLB files are in public/tiles/"
echo "═══════════════════════════════════════════════════════════"

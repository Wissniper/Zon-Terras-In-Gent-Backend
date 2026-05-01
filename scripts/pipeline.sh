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
  echo "Error: 'unzip' is not installed." >&2
  echo "  macOS: brew install unzip" >&2
  echo "  Ubuntu/Debian: sudo apt-get install -y unzip" >&2
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

# ── Step 3: Check/install native converter dependencies ───────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo " Step 3: Checking converter dependencies"
echo "═══════════════════════════════════════════════════════════"

if ! command -v dwg2dxf &> /dev/null; then
  echo "LibreDWG not found — installing..."
  sudo bash "$SCRIPT_DIR/install-libredwg.sh"
else
  echo "dwg2dxf already installed."
fi

if ! python3 -c "import ezdxf" 2>/dev/null; then
  echo "ezdxf not found — installing..."
  pip3 install --quiet --break-system-packages ezdxf
else
  echo "ezdxf already installed."
fi

if ! command -v obj2gltf &> /dev/null; then
  echo "obj2gltf not found — installing..."
  sudo npm install -g obj2gltf gltf-pipeline
else
  echo "obj2gltf already installed."
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

#!/bin/bash
# Convert DWG files to GLB.
# Usage:
#   ./convert-all.sh              — convert missing or stale files
#   ./convert-all.sh a.dwg b.dwg — convert specific files only

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

INPUT_DIR="data/dwg"
OUTPUT_DIR="public/tiles"

mkdir -p "$OUTPUT_DIR"

needs_conversion() {
    local dwg="$1"
    local glb="$2"
    # Convert if GLB is missing or DWG is newer than GLB
    [ ! -f "$glb" ] || [ "$dwg" -nt "$glb" ]
}

convert_file() {
    local f="$1"
    local filename
    filename=$(basename -- "$f")
    local stem="${filename%.*}"
    local glb="$OUTPUT_DIR/$stem.glb"

    if needs_conversion "$f" "$glb"; then
        echo "Converting $filename..."
        bash "$SCRIPT_DIR/entrypoint.sh" "$f" "$glb"
    else
        echo "Skipping $filename (up to date)"
    fi
}

if [ "$#" -gt 0 ]; then
    # Specific files passed (e.g. from GitHub Actions diff)
    for f in "$@"; do
        convert_file "$INPUT_DIR/$(basename -- "$f")"
    done
else
    # No args: scan all DWGs
    for f in "$INPUT_DIR"/*.dwg; do
        [ -e "$f" ] && convert_file "$f"
    done
fi

echo "Batch conversion complete."

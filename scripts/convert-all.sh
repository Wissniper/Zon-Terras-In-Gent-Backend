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
    # Specific files passed
    for f in "$@"; do
        convert_file "$INPUT_DIR/$(basename -- "$f")"
    done
else
    # No args: scan all DWGs
    success_count=0
    fail_count=0
    skip_count=0

    # Sort files to ensure predictable progress
    files=$(find "$INPUT_DIR" -maxdepth 1 -name "*.dwg" -o -name "*.DWG" | sort)
    total=$(echo "$files" | wc -l)
    current=0

    for f in $files; do
        current=$((current + 1))
        filename=$(basename "$f")
        echo "[$current/$total] Processing $filename..."
        
        if convert_file "$f"; then
            if [ $? -eq 0 ]; then
                success_count=$((success_count + 1))
            fi
        else
            fail_count=$((fail_count + 1))
        fi
    done
fi

echo ""
echo "Batch conversion complete."
echo "Summary: $success_count succeeded, $fail_count failed, $skip_count skipped."

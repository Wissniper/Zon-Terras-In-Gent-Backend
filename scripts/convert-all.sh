#!/bin/bash
# Batch convert all DWGs in data/dwg to public/tiles

INPUT_DIR="data/dwg"
OUTPUT_DIR="public/tiles"

mkdir -p "$OUTPUT_DIR"

for f in "$INPUT_DIR"/*.dwg; do
    if [ -e "$f" ]; then
        filename=$(basename -- "$f")
        basename="${filename%.*}"
        echo "Processing $filename..."

        docker run --rm \
            -v "$(pwd)/Zon-Terras-In-Gent-Backend/data/dwg":/data/in \
            -v "$(pwd)/Zon-Terras-In-Gent-Backend/public/tiles":/data/out \
            dwg-converter "/data/in/$filename" "/data/out/$basename.glb"
    fi
done

echo "Batch conversion complete."

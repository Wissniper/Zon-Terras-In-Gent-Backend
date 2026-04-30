#!/bin/bash
set -e

DWG_IN="$1"
GLB_OUT="$2"
TEMP_DXF="/tmp/temp.dxf"
TEMP_OBJ="/tmp/temp.obj"
TEMP_GLB="/tmp/temp.glb"

if [ -z "$DWG_IN" ] || [ -z "$GLB_OUT" ]; then
    echo "Usage: $0 <input.dwg> <output.glb>" >&2
    exit 1
fi

echo "Phase 1: Converting DWG → DXF..."
dwg2dxf "$DWG_IN" -o "$TEMP_DXF"
ls -lh "$TEMP_DXF"

echo "Phase 2: Converting DXF → OBJ via ezdxf..."
python3 /app/convert.py --input "$TEMP_DXF" --output "$TEMP_OBJ"
ls -lh "$TEMP_OBJ"

echo "Phase 3: Converting OBJ → GLB..."
obj2gltf -i "$TEMP_OBJ" -o "$TEMP_GLB"
ls -lh "$TEMP_GLB"

echo "Phase 4: Applying Draco compression..."
gltf-pipeline -i "$TEMP_GLB" -o "$GLB_OUT" -d

rm -f "$TEMP_DXF" "$TEMP_OBJ" "$TEMP_GLB"
echo "Done: $GLB_OUT"

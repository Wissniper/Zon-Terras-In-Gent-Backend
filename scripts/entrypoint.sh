#!/bin/bash
# Robust conversion script: continues on error, logs failures.

DWG_IN="$1"
GLB_OUT="$2"
TEMP_DXF="/tmp/temp_$(basename "$DWG_IN").dxf"
TEMP_OBJ="/tmp/temp_$(basename "$DWG_IN").obj"
TEMP_GLB="/tmp/temp_$(basename "$DWG_IN").glb"

if [ -z "$DWG_IN" ] || [ -z "$GLB_OUT" ]; then
    echo "Usage: $0 <input.dwg> <output.glb>" >&2
    exit 1
fi

echo "  Phase 1: DWG → DXF..."
if ! dwg2dxf -y "$DWG_IN" -o "$TEMP_DXF" 2>/tmp/dwg2dxf_err.log; then
    echo "  ERROR: dwg2dxf failed for $DWG_IN" >&2
    rm -f "$TEMP_DXF"
    exit 1
fi

echo "  Phase 2: DXF → OBJ..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! python3 "$SCRIPT_DIR/convertDwgToGlb.py" --input "$TEMP_DXF" --output "$TEMP_OBJ"; then
    echo "  ERROR: DXF to OBJ conversion failed for $DWG_IN" >&2
    rm -f "$TEMP_DXF" "$TEMP_OBJ"
    exit 1
fi

echo "  Phase 3: OBJ → GLB..."
if ! obj2gltf -i "$TEMP_OBJ" -o "$TEMP_GLB" 2>/tmp/obj2gltf_err.log; then
    echo "  ERROR: obj2gltf failed for $DWG_IN" >&2
    rm -f "$TEMP_DXF" "$TEMP_OBJ" "$TEMP_GLB"
    exit 1
fi

echo "  Phase 4: Draco compression..."
if gltf-pipeline -i "$TEMP_GLB" -o "$GLB_OUT" -d 2>/dev/null; then
    echo "  Draco compression applied."
else
    echo "  Warning: Draco failed, using uncompressed GLB." >&2
    cp "$TEMP_GLB" "$GLB_OUT"
fi

rm -f "$TEMP_DXF" "$TEMP_OBJ" "$TEMP_GLB"
echo "  Done: $(basename "$GLB_OUT")"
exit 0

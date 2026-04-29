import sys
import os
import argparse

# FreeCAD imports (assumes environment is set up via Docker)
import FreeCAD as App
import Mesh
import importDWG

def convert(input_path, output_path):
    if not os.path.isfile(input_path):
        print(f"Error: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Converting {input_path} to {output_path}...")

    doc = App.newDocument("Conversion")

    try:
        importDWG.insert(input_path, "Conversion")
    except Exception as e:
        print(f"Error: failed to import DWG: {e}", file=sys.stderr)
        sys.exit(1)

    doc.recompute()

    objs = [obj for obj in doc.Objects if hasattr(obj, "Shape") or hasattr(obj, "Mesh")]

    if not objs:
        print("Error: no renderable objects found in DWG.", file=sys.stderr)
        sys.exit(1)

    try:
        Mesh.export(objs, output_path)
    except Exception as e:
        print(f"Error: failed to export GLB: {e}", file=sys.stderr)
        sys.exit(1)

    print("Intermediate GLB exported successfully.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert DWG to GLB using FreeCAD")
    parser.add_argument("--input", required=True, help="Path to input DWG")
    parser.add_argument("--output", required=True, help="Path to output GLB")
    args = parser.parse_args()
    
    convert(args.input, args.output)

import sys
import os
import argparse

# FreeCAD imports (assumes environment is set up via Docker)
import FreeCAD as App
import Mesh
import importDWG

def convert(input_path, output_path):
    print(f"Converting {input_path} to {output_path}...")
    
    # Create new document
    doc = App.newDocument("Conversion")
    
    # Import DWG
    importDWG.insert(input_path, "Conversion")
    doc.recompute()
    
    # Collect all meshable objects
    objs = []
    for obj in doc.Objects:
        if hasattr(obj, "Shape") or hasattr(obj, "Mesh"):
            objs.append(obj)
    
    if not objs:
        print("No renderable objects found in DWG.")
        sys.exit(1)
        
    # Export to intermediate GLB (FreeCAD Mesh module handles this)
    Mesh.export(objs, output_path)
    print("Intermediate GLB exported successfully.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert DWG to GLB using FreeCAD")
    parser.add_argument("--input", required=True, help="Path to input DWG")
    parser.add_argument("--output", required=True, help="Path to output GLB")
    args = parser.parse_args()
    
    convert(args.input, args.output)

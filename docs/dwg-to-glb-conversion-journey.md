# DWG → GLB Conversion Pipeline: The Full Story

This document chronicles the complete debugging journey to get automated `.dwg` → `.glb` conversion working for the Gent 3D tile dataset.

---

## The Goal

Convert Stad Gent's 3D building and terrain tiles (provided only as AutoCAD `.dwg` files) into compressed `.glb` files suitable for serving via the API. The pipeline needed to be fully automated, open-source, and run inside a Docker container with no manual steps.

---

## Phase 1 — Session

- v0.38.2 was used first to test the initial scripts.\*

### What existed

The backend already had:

- `scripts/convertDwgToGlb.py` — a FreeCAD-based Python converter
- `scripts/convert-all.sh` — a batch wrapper that calls Docker
- `Dockerfile.converter` — a Docker image with FreeCAD and `gltf-pipeline`

### Attempt 1: Run as-is

**Result:** `ModuleNotFoundError: No module named 'importDWG'`

The Python script tried to `import importDWG`, but that module lives under FreeCAD's Draft module directory, which wasn't in `PYTHONPATH`.

**Fix:** Added `/usr/share/freecad/Mod/Draft` to `PYTHONPATH` in the Dockerfile.

---

### Attempt 2: Fix PYTHONPATH

**Result:** `Error: failed to import DWG: No module named 'PySide'`

`importDWG.py` internally imports `PySide` (the old Qt bindings). Ubuntu 22.04 ships `PySide2` instead.

**Fix:** Added `python3-pyside2.qtcore`, `python3-pyside2.qtgui`, `python3-pyside2.qtwidgets` to the Dockerfile.

---

### Attempt 3: Install PySide2 packages

**Result:** Same `No module named 'PySide'` error.

The packages were installed but the shim wasn't in place. The code tried `sys.modules['PySide'] = PySide2` but PySide2's submodules also needed aliasing.

**Fix:** Added a full module shim — mapping `PySide.QtCore`, `PySide.QtGui`, `PySide.QtWidgets` to their PySide2 equivalents, plus copying all QtWidgets members into QtGui for legacy code paths.

---

### Attempt 4: Full PySide2 shim

**Result:** `Aborted` (process crash — no Python traceback)

Adding `FreeCADGui.setupWithoutGUI()` and `FreeCADGui.UiLoader = QtUiTools.QUiLoader` was tried. This caused a hard abort — FreeCAD's C++ layer crashed when trying to initialize GUI components without a display server.

**Fix:** Added `xvfb` (virtual framebuffer) and wrapped the Python call with `xvfb-run -a`.

---

### Attempt 5: xvfb-run

**Result:** Still `Aborted`

The crash was happening inside `importDWG` itself before any geometry was loaded. Inspection of `importDWG.py` revealed the root cause:

> FreeCAD's `importDWG` module is a thin wrapper around the **ODA File Converter** (Teigha), a closed-source commercial tool. Without it installed, the module crashes unconditionally. There is no open-source fallback.

**Conclusion from :** DWG cannot be read by FreeCAD without proprietary software.

---

### The pivot: Is DXF available from Stad Gent?

searched the open data portal extensively:

- Checked `data.stad.gent` API for alternative formats
- Tried URL guessing (`/Dxf/`, `/Obj/`, `/Fbx/`)
- Searched for related datasets containing "3D", "DXF", "OBJ"
- Read the metadata PDF from the zip

**Result:** All 148 tiles are provided exclusively as `.dwg` files. No alternative formats exist.

---

### The plan: Build `libredwg` from source

discovered that `libredwg-utils` (which provides `dwg2dxf`) is **not in the Ubuntu 22.04 apt repository** — only for ARM64 Docker environment used. The only option was compiling from source.

A `git clone` + `./autogen.sh` + `./configure --disable-bindings --disable-python` + `make` pipeline was validated inside a throwaway container. `dwg2dxf` compiled successfully.

**Plan produced:**

1. Add a multi-stage Docker build to compile `libredwg`
2. Copy `dwg2dxf` binary into the final image
3. Update the entrypoint to run `dwg2dxf` → DXF first, then FreeCAD → GLB
4. Update the Python script to use `importDXF` instead of `importDWG`

updated the Dockerfile and Python script accordingly, then hit a **network error** (`getaddrinfo ENOTFOUND cloudcode-pa.googleapis.com`) and the session was handed off to .

---

## Phase 2

_Picking up from 's plan with the Dockerfile and scripts already partially updated._

### Attempt 6: First test

The Docker image built successfully with `libredwg`. Phase 1 now worked — DWG was converted to DXF (231K output confirmed). But Phase 2 failed:

```
Error: no renderable objects found in document after Draft import.
Total objects: 0
```

FreeCAD's `importDXF.insert()` silently produced **zero objects**.

---

### Diagnosing: What's actually in the DXF?

Investigation revealed that the Gent 3D DXF files have a specific structure:

- The **model space** contains only `INSERT` entities (block references)
- The actual `3DFACE` geometry (514 triangles for the buildings tile) lives inside **named block definitions** like `DRONGEN_Part_2_ACAD_2_FMEBLOCK64`

FreeCAD 0.19's `importDXF` does not resolve INSERT block references. It imports the model space and finds nothing renderable.

**Root cause:** FreeCAD's DXF importer is too shallow for this file structure.

---

### Attempt 7: Switch from FreeCAD to `ezdxf`

`ezdxf` (a pure Python DXF library) was tested in the container. It successfully:

- Read the DXF file
- Found the INSERT entities in model space
- Resolved each INSERT to its block definition
- Applied the transformation matrix (INSERT position + rotation) to the `3DFACE` vertices
- Produced correct real-world Belgian Lambert coordinates (e.g., `95824, 193169`)

This completely replaced FreeCAD for the conversion step. FreeCAD was removed from the Docker image entirely, reducing it from **844MB to 455MB**.

The intermediate format was changed to **OBJ** (very stable from `ezdxf`) with `obj2gltf` added for the OBJ → GLB step before Draco compression.

**Buildings tile result:** ✅ 514 faces, valid 2.5KB compressed GLB.

---

### Attempt 8: Test the terrain tile

The second tile (`Trn_` — terrain mesh) failed with:

```
ezdxf failed (Invalid handle 0.), falling back to raw parser
```

`ezdxf.recover.readfile()` threw a `ValueError` even in recovery mode. The terrain DXF also had a non-ASCII byte at position 8005 (ANSI_1252 encoded), causing UTF-8 decode errors.

---

### Diagnosing: Terrain DXF structure

A raw line scan revealed the terrain file uses a completely different geometry format:

- **9 `POLYLINE` entities** (POLYFACE MESH subclass)
- **14,577 `VERTEX` entities** — split between:
  - Position vertices (group code 70 = 192, with X/Y/Z coords)
  - Face records (group code 70 = 128, with vertex indices 71/72/73/74)
- No `INSERT` block references

This is DXF's POLYFACE MESH format — a standard way to represent triangulated surface meshes.

---

### Final solution: Dual-format raw parser

The Python script was rewritten with a two-path architecture:

1. **Primary path (ezdxf):** Works for well-formed DXF with `3DFACE` entities inside block references (buildings tiles).

2. **Fallback path (raw parser):** Opens the file as `cp1252` with `errors='replace'`, parses group-code pairs manually, and handles both:
   - `3DFACE` entities (direct or in blocks)
   - `POLYFACE MESH` via `POLYLINE` + `VERTEX` + `SEQEND`

The raw parser correctly reconstructs triangle faces from the POLYFACE MESH by:

1. Collecting position vertices (those with X/Y/Z)
2. Collecting face records (those with index groups 71–74)
3. Building triangles using the 1-based vertex indices

**Terrain tile result:** ✅ 3,338 faces, valid 1.5KB compressed GLB.

---

## Final Pipeline

```
DWG file
  │
  ▼ dwg2dxf (libredwg, compiled from source)
DXF file
  │
  ▼ python3 convert.py (ezdxf or raw parser)
OBJ file
  │
  ▼ obj2gltf
GLB file (uncompressed)
  │
  ▼ gltf-pipeline -d (Draco compression)
GLB file (compressed) ✓
```

---

## Summary of Failures and Their Causes

| #   | Error                         | Root Cause                                     | Fix                                             |
| --- | ----------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| 1   | `No module named 'importDWG'` | PYTHONPATH missing Draft dir                   | Add `/usr/share/freecad/Mod/Draft`              |
| 2   | `No module named 'PySide'`    | PySide → PySide2 rename                        | Add PySide2 packages                            |
| 3   | PySide submodule errors       | Legacy code expects `PySide.QtCore` etc.       | Add full module alias shim                      |
| 4   | `Aborted` (hard crash)        | FreeCAD GUI init without display               | Add `xvfb-run`                                  |
| 5   | `Aborted` in `importDWG`      | ODA/Teigha closed-source dependency            | Abandon `importDWG`, pivot to DWG→DXF           |
| 6   | `libredwg-utils` not in apt   | Ubuntu 22.04 repo gap                          | Compile `libredwg` from source in Docker        |
| 7   | FreeCAD finds 0 objects       | INSERT block refs not resolved by FreeCAD 0.19 | Replace FreeCAD with `ezdxf`                    |
| 8   | `ezdxf` crashes on terrain    | "Invalid handle 0" + ANSI_1252 encoding        | Add raw DXF parser fallback                     |
| 9   | Terrain geometry missing      | Different format: POLYFACE MESH, not `3DFACE`  | Extend raw parser to handle `POLYLINE`+`VERTEX` |

---

## Key Lessons

- **DWG is proprietary.** No open-source tool reads it natively. The only viable open-source path is `libredwg`'s `dwg2dxf`, which must be compiled from source since it's absent from Ubuntu 22.04 package repos.
- **FreeCAD's DXF importer is shallow.** It doesn't resolve INSERT block references, making it useless for files where geometry is stored in blocks (a common AutoCAD pattern).
- **Gent 3D tiles use two different DXF geometry formats:** buildings use `3DFACE` in named blocks; terrain uses POLYFACE MESH directly in model space.
- **`ezdxf` is the right tool** for DXF parsing in Python, but even it can't handle all libredwg output. A raw group-code parser is needed as a fallback.
- **Dropping FreeCAD** (the original plan's centerpiece) was the correct call — the image shrank by nearly 50% and the conversion is more reliable.

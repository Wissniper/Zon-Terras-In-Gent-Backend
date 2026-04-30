# DWG to GLB Conversion Pipeline

## Overview

The pipeline converts AutoCAD DWG files into Draco-compressed GLB files for web rendering. It uses four purpose-built tools chained together, all running inside Docker.

```
.dwg → [LibreDWG: dwg2dxf] → .dxf → [Python: ezdxf] → .obj → [obj2gltf] → .glb → [gltf-pipeline] → compressed .glb
```

---

## Files

| File | Role |
|------|------|
| `scripts/pipeline.sh` | End-to-end entry point — fetch → unzip → convert |
| `scripts/fetchGent3d.ts` | Downloads tile zips from Stad Gent open data API |
| `scripts/convert-all.sh` | Batch DWG → GLB orchestrator (runs on host) |
| `scripts/entrypoint.sh` | Orchestrates the four stages inside the container |
| `scripts/convertDwgToGlb.py` | DXF → OBJ conversion (Python) |
| `Dockerfile.converter` | Builds the conversion environment |

---

## 1. `convertDwgToGlb.py` — DXF → OBJ

The script's sole job is extracting 3D face geometry from DXF and writing it as OBJ. It does not touch DWG or GLB directly.

### Two parsers with automatic fallback

At startup the script attempts to import `ezdxf`. If unavailable it falls back to the built-in raw parser. At runtime inside Docker `ezdxf` is always present, but the fallback makes the script usable outside Docker too.

```python
if EZDXF_AVAILABLE:
    try:
        faces = _faces_via_ezdxf(input_path)
    except Exception as e:
        print(f"ezdxf failed ({e}), falling back to raw parser", ...)

if not faces:
    faces = _faces_via_raw(input_path)
```

---

### `_faces_via_ezdxf()` — Primary parser

Uses `ezdxf.recover.readfile()` rather than `readfile()` — the recover variant tolerates structural errors in the DXF (which can occur when LibreDWG produces imperfect output) and logs warnings instead of crashing.

Architectural DWG files typically store geometry inside **blocks** — reusable components (walls, doors, columns) inserted via `INSERT` entities. `virtual_entities()` explodes those block references into their actual geometry. Without this, most of the geometry in a building model would be missed.

Only `3DFACE` entities are collected. A `3DFACE` is a quad (4 vertices) defining a flat polygon in 3D space — the fundamental unit of mesh geometry in DXF.

---

### `_faces_via_raw()` — Fallback parser

A hand-written DXF parser for when ezdxf cannot handle the file. DXF is a text format of group-code/value pairs:

```
0        ← group code
3DFACE   ← value
10
3.5      ← X coordinate of vertex 0
20
1.2      ← Y coordinate of vertex 0
```

`_read_pairs()` reads the file and pairs lines. `_faces_via_raw()` scans for two entity types:

**3DFACE** — group codes 10/11/12/13 are X coords, 20/21/22/23 are Y, 30/31/32/33 are Z for the four vertices.

**POLYFACE MESH** — a `POLYLINE` with two types of `VERTEX` records:
- Position vertices: X/Y/Z coordinates (group codes 10/20/30)
- Face index vertices: reference back into the position vertex list (group codes 71/72/73/74, 1-based)
- `SEQEND` marks the end of the mesh

---

### `_write_obj()` — Output

Quads from both parsers are split into triangles (required by OBJ/GLB). If `v2 == v3` (a degenerate quad that is actually a triangle), only one triangle is emitted.

Output is plain OBJ — vertex list (`v x y z`) followed by face list (`f i j k`, 1-based indices). Handles both ezdxf `Vec3` objects (`.x`/`.y`/`.z` attributes) and plain tuples from the raw parser.

---

## 2. `Dockerfile.converter` — Multi-stage Build

Uses a two-stage build so the final image does not carry the C build toolchain used to compile LibreDWG.

### Stage 1: Builder

Compiles LibreDWG from source — it is not in Ubuntu's apt repos. Requires `gcc`, `autoconf`, `automake`, `libtool`, `texinfo`. These add ~300MB that are discarded after this stage.

```dockerfile
RUN git clone --depth 1 https://github.com/LibreDWG/libredwg.git /tmp/libredwg \
    && cd /tmp/libredwg \
    && ./autogen.sh \
    && ./configure --disable-bindings --disable-python \
    && make -j$(nproc) \
    && make install
```

`--disable-bindings --disable-python` skips language bindings that aren't needed.  
`-j$(nproc)` parallelizes the compile across all CPU cores.

### Stage 2: Runtime image

Fresh Ubuntu 22.04 — none of the builder's bloat carries over.

```dockerfile
COPY --from=builder /usr/local/bin/dwg2dxf /usr/local/bin/
COPY --from=builder /usr/local/lib/libredwg* /usr/local/lib/
RUN ldconfig
```

Only the compiled binary and shared library are copied across. `ldconfig` refreshes the dynamic linker so the OS finds the new library.

```dockerfile
RUN pip3 install --no-cache-dir ezdxf
RUN npm install -g obj2gltf gltf-pipeline
```

| Package | Role |
|---------|------|
| `ezdxf` | Python DXF parser |
| `obj2gltf` | Converts OBJ to binary GLB |
| `gltf-pipeline` | Applies Draco compression to GLB |

---

## 3. `entrypoint.sh` — Four-stage Pipeline

Runs inside the container. `set -e` ensures any failed stage aborts immediately rather than silently passing empty files to the next stage.

```
input.dwg
  → dwg2dxf            → /tmp/temp.dxf
  → convert.py (ezdxf) → /tmp/temp.obj
  → obj2gltf           → /tmp/temp.glb   (uncompressed)
  → gltf-pipeline -d   → output.glb      (Draco-compressed, ~10x smaller)
  → rm intermediates
```

`ls -lh` after each phase logs the intermediate file sizes, useful for debugging.

The `-d` flag on `gltf-pipeline` enables Draco compression — it compresses mesh geometry (vertex positions, normals, UVs) using Google's Draco algorithm, typically reducing file size 70–90%.

---

## 4. `convert-all.sh` — Batch Orchestrator

Runs on the host. Decides which files to convert and launches Docker for each one.

### Skipping up-to-date files

```bash
needs_conversion() {
    [ ! -f "$glb" ] || [ "$dwg" -nt "$glb" ]
}
```

Converts a file if the GLB is missing, or the DWG is **newer than** the GLB (`-nt`). Skips everything else.

### Two modes

| Invocation | Behaviour |
|------------|-----------|
| `./convert-all.sh` | Scans all DWGs, skips up-to-date ones (timestamp check) |
| `./convert-all.sh a.dwg b.dwg` | Converts only the named files (used by CI) |

### Docker volume mounts

```bash
docker run --rm \
    -v "$(pwd)/data/dwg":/data/in \
    -v "$(pwd)/public/tiles":/data/out \
    dwg-converter "/data/in/$filename" "/data/out/$stem.glb"
```

`--rm` deletes the container after exit. The two `-v` flags bind the host directories into the container. The path arguments become `$1` and `$2` inside `entrypoint.sh`.

---

## 5. `pipeline.sh` — Full End-to-End Automation

Run with:

```bash
npm run pipeline:gent3d
```

Optional flags are forwarded to `fetchGent3d.ts`:

| Flag | Effect |
|------|--------|
| `-- --dry-run` | Fetch metadata only, skip downloads and conversion |
| `-- --force` | Re-download and re-convert even already-done tiles |
| `-- --limit=N` | Process only the first N tiles |

### The four steps it runs

**Step 1 — Download zips** (`npm run fetch:gent3d`)  
Hits the Stad Gent open data API, builds a tile index, and downloads each `.zip` into `data/gent3d/`. Tracks status per tile in MongoDB (`pending` → `downloading` → `done`). Skips tiles already marked `done` unless `--force` is passed.

**Step 2 — Unzip DWG files**  
Extracts only `.dwg` files from every zip in `data/gent3d/` into `data/dwg/`. Uses `unzip -jo` (junk paths, overwrite) so files land flat with no subdirectories.

**Step 3 — Ensure converter image exists**  
Checks for the `dwg-converter` Docker image. Builds it from `Dockerfile.converter` if absent. Skipped on subsequent runs since the image is cached.

**Step 4 — Convert DWG → GLB** (`convert-all.sh`)  
Iterates every DWG in `data/dwg/`. Skips files whose GLB is already newer (timestamp check). Runs the four-stage Docker pipeline for each file that needs conversion.

### Why the GitHub Actions workflow was removed

The previous `.github/workflows/convert-tiles.yml` was triggered by pushing `.dwg` files to the repo. DWG files are in `.gitignore` (they are large binary assets), so the trigger condition could never be met. The workflow was dead code. All conversion now happens locally via `npm run pipeline:gent3d`.

---

## 6. `services/tilePipeline.ts` — Automatic Server Startup

The pipeline runs automatically on server boot via `services/tilePipeline.ts`, called from `app.ts` after the MongoDB connection is established — the same place `startWeatherCron` is called.

```ts
mongoose.connect(mongoURI).then(() => {
  startWeatherCron(io);
  startTilePipeline();   // ← runs pipeline.sh if no GLBs present
});
```

### Logic

`startTilePipeline()` checks how many `.glb` files exist in `public/tiles/`:

- **Files present** → logs the count and returns immediately. No pipeline run.
- **No files** → spawns `pipeline.sh` as a background child process and returns. The server is available immediately without waiting for conversion to finish.

### Background execution

```ts
const child = spawn("bash", [PIPELINE], {
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
child.unref();
```

`detached: true` lets the child outlive the parent process if needed. `unref()` tells Node not to keep the event loop alive waiting for it. Pipeline stdout/stderr is streamed to the server logs prefixed with `[Tiles]` so progress is visible.

### Behaviour across restarts

| Situation | Result |
|-----------|--------|
| First boot, no GLBs | Pipeline runs in background, tiles appear as they convert |
| Subsequent boots, GLBs present | Skipped — `[Tiles] N GLB file(s) already present` |
| Tiles deleted manually | Pipeline re-runs on next boot |

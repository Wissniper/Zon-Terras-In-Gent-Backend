import sys
import os
import argparse

try:
    import ezdxf
    import ezdxf.recover
    EZDXF_AVAILABLE = True
except ImportError:
    EZDXF_AVAILABLE = False


# ── ezdxf path (well-formed DXF) ──────────────────────────────────────────────

def _faces_via_ezdxf(path):
    """Return list of (v0,v1,v2,v3) tuples via ezdxf, resolving INSERT refs."""
    doc, auditor = ezdxf.recover.readfile(path)
    if auditor.has_errors:
        print(f"Warning: {len(auditor.errors)} DXF recovery errors", file=sys.stderr)

    msp = doc.modelspace()
    faces = []
    for entity in msp:
        if entity.dxftype() == "INSERT":
            for sub in entity.virtual_entities():
                if sub.dxftype() == "3DFACE":
                    faces.append((sub.dxf.vtx0, sub.dxf.vtx1,
                                  sub.dxf.vtx2, sub.dxf.vtx3))
        elif entity.dxftype() == "3DFACE":
            faces.append((entity.dxf.vtx0, entity.dxf.vtx1,
                          entity.dxf.vtx2, entity.dxf.vtx3))
    return faces


# ── raw fallback parser (handles malformed DXF from libredwg) ─────────────────

def _read_pairs(path):
    with open(path, encoding="cp1252", errors="replace") as f:
        lines = [l.rstrip() for l in f]
    pairs = []
    i = 0
    while i + 1 < len(lines):
        pairs.append((lines[i].strip(), lines[i + 1].strip()))
        i += 2
    return pairs


def _faces_via_raw(path):
    """Parse 3DFACE and POLYFACE MESH entities without ezdxf."""
    pairs = _read_pairs(path)
    faces = []

    i = 0
    while i < len(pairs):
        code, val = pairs[i]

        # ── 3DFACE ──────────────────────────────────────────────────────────
        if code == "0" and val == "3DFACE":
            verts = {}
            j = i + 1
            while j < len(pairs) and pairs[j][0] != "0":
                c, v = pairs[j]
                if c in ("10", "11", "12", "13"):
                    verts[f"x{int(c)-10}"] = float(v)
                elif c in ("20", "21", "22", "23"):
                    verts[f"y{int(c)-20}"] = float(v)
                elif c in ("30", "31", "32", "33"):
                    verts[f"z{int(c)-30}"] = float(v)
                j += 1
            v0 = (verts.get("x0", 0), verts.get("y0", 0), verts.get("z0", 0))
            v1 = (verts.get("x1", 0), verts.get("y1", 0), verts.get("z1", 0))
            v2 = (verts.get("x2", 0), verts.get("y2", 0), verts.get("z2", 0))
            v3 = (verts.get("x3", 0), verts.get("y3", 0), verts.get("z3", 0))
            faces.append((v0, v1, v2, v3))
            i = j
            continue

        # ── POLYFACE MESH (POLYLINE + VERTEXes + SEQEND) ────────────────────
        if code == "0" and val == "POLYLINE":
            pos_verts = []   # 3D position vertices
            face_recs = []   # face index records
            j = i + 1
            while j < len(pairs):
                c, v = pairs[j]
                if c == "0" and v == "SEQEND":
                    j += 1
                    break
                if c == "0" and v == "VERTEX":
                    vdata = {}
                    k = j + 1
                    while k < len(pairs) and pairs[k][0] != "0":
                        vc, vv = pairs[k]
                        if vc == "10":  vdata["x"]   = float(vv)
                        elif vc == "20": vdata["y"]  = float(vv)
                        elif vc == "30": vdata["z"]  = float(vv)
                        elif vc == "70": vdata["fl"] = int(vv)
                        elif vc == "71": vdata["i0"] = int(vv)
                        elif vc == "72": vdata["i1"] = int(vv)
                        elif vc == "73": vdata["i2"] = int(vv)
                        elif vc == "74": vdata["i3"] = int(vv)
                        k += 1
                    
                    # A VERTEX in a Polyface Mesh is either a location (flag 64) or a face record (flag 128)
                    # We use the presence of coordinates as a heuristic for locations.
                    if any(c in vdata for c in ["x", "y", "z"]):
                        pos_verts.append((vdata.get("x", 0.0), vdata.get("y", 0.0), vdata.get("z", 0.0)))
                    
                    if any(c in vdata for c in ["i0", "i1", "i2", "i3"]):
                        face_recs.append(vdata)
                    j = k
                    continue
                j += 1

            for fr in face_recs:
                # Indices in DXF are 1-based. abs() because negative means hidden edge.
                fi = [abs(fr.get(f"i{n}", 0)) for n in range(4)]
                
                # Safety check: must have at least 3 valid vertex indices
                if all(0 < i <= len(pos_verts) for i in fi[:3]):
                    v0 = pos_verts[fi[0] - 1]
                    v1 = pos_verts[fi[1] - 1]
                    v2 = pos_verts[fi[2] - 1]
                    # v3 is optional (can be 0 or same as v2)
                    v3 = pos_verts[fi[3] - 1] if (0 < fi[3] <= len(pos_verts)) else v2
                    faces.append((v0, v1, v2, v3))
                else:
                    # Log skip for debugging if needed
                    pass
            i = j
            continue

        i += 1

    return faces


# ── OBJ writer ────────────────────────────────────────────────────────────────

def _is_degenerate(a, b, c):
    ax = a.x if hasattr(a, "x") else a[0]
    ay = a.y if hasattr(a, "y") else a[1]
    az = a.z if hasattr(a, "z") else a[2]
    bx = b.x if hasattr(b, "x") else b[0]
    by = b.y if hasattr(b, "y") else b[1]
    bz = b.z if hasattr(b, "z") else b[2]
    cx = c.x if hasattr(c, "x") else c[0]
    cy = c.y if hasattr(c, "y") else c[1]
    cz = c.z if hasattr(c, "z") else c[2]
    ux, uy, uz = bx - ax, by - ay, bz - az
    vx, vy, vz = cx - ax, cy - ay, cz - az
    nx = uy * vz - uz * vy
    ny = uz * vx - ux * vz
    nz = ux * vy - uy * vx
    return (nx * nx + ny * ny + nz * nz) < 1e-10


def _write_obj(faces, output_path):
    vertices = []
    triangles = []
    for v0, v1, v2, v3 in faces:
        base = len(vertices)
        vertices.extend([v0, v1, v2, v3])
        if not _is_degenerate(v0, v1, v2):
            triangles.append((base, base + 1, base + 2))
        if v2 != v3 and not _is_degenerate(v0, v2, v3):
            triangles.append((base, base + 2, base + 3))

    with open(output_path, "w") as f:
        for v in vertices:
            # v may be a Vec3 (ezdxf) or a plain tuple
            x = v.x if hasattr(v, "x") else v[0]
            y = v.y if hasattr(v, "y") else v[1]
            z = v.z if hasattr(v, "z") else v[2]
            f.write(f"v {x} {y} {z}\n")
        for t in triangles:
            f.write(f"f {t[0]+1} {t[1]+1} {t[2]+1}\n")
    return len(triangles)


# ── main ──────────────────────────────────────────────────────────────────────

def convert(input_path, output_path):
    if not os.path.isfile(input_path):
        print(f"Error: input file not found: {input_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Reading {input_path}...")

    faces = None
    if EZDXF_AVAILABLE:
        try:
            faces = _faces_via_ezdxf(input_path)
            print(f"ezdxf: found {len(faces)} faces")
        except Exception as e:
            print(f"ezdxf failed ({e}), falling back to raw parser", file=sys.stderr)

    if not faces:
        print("Using raw DXF parser...")
        faces = _faces_via_raw(input_path)
        print(f"raw parser: found {len(faces)} faces")

    if not faces:
        print("Error: no geometry found in DXF.", file=sys.stderr)
        sys.exit(1)

    tri_count = _write_obj(faces, output_path)
    print(f"Wrote {tri_count} triangles to {output_path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert DXF to OBJ (3DFACE + POLYFACE MESH)")
    parser.add_argument("--input", required=True, help="Path to input .dxf")
    parser.add_argument("--output", required=True, help="Path to output .obj")
    args = parser.parse_args()
    convert(args.input, args.output)

import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import https from "https";
import http from "http";
import Gent3dTile from "../models/gent3dTileModel.js";

dotenv.config();

// ─── CLI flags ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN  = args.includes("--dry-run") || args.includes("--only-meta");
const FORCE    = args.includes("--force");
const limitArg = args.find((a) => a.startsWith("--limit="));
const LIMIT    = limitArg ? parseInt(limitArg.split("=")[1], 10) : Infinity;

// ─── Config ───────────────────────────────────────────────────────────────────

const DOWNLOAD_DIR = path.resolve(
  process.env.GENT3D_DOWNLOAD_DIR ?? "./data/gent3d"
);
const MONGO_URI =
  process.env.MONGODB_URI ?? "mongodb://localhost:27017/zon-terras-db";

// ─── Data source URLs (ordered: primary → fallbacks) ─────────────────────────

const CSV_URL =
  "https://data.stad.gent/api/explore/v2.1/catalog/datasets/gent-in-3d/exports/csv";
const JSON_URL =
  "https://data.stad.gent/api/explore/v2.1/catalog/datasets/gent-in-3d/exports/json";
const GEOJSON_URL =
  "https://gent.opendatasoft.com/api/v2/catalog/datasets/gent-in-3d/exports/geojson";
const V1_URL =
  "https://data.stad.gent/api/records/1.0/search/?dataset=gent-in-3d&rows=100";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedTile {
  vaknummer:   string;
  downloadUrl: string;
  fileName:    string;
  xCoord:      number;
  yCoord:      number;
  year:        number | undefined;
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

/** "099_193" → { xCoord: 99000, yCoord: 193000 } (Lambert 72 grid, metres) */
function parseCoordsFromVaknummer(vak: string): { xCoord: number; yCoord: number } {
  const [xStr, yStr] = vak.split("_");
  return {
    xCoord: parseInt(xStr, 10) * 1000,
    yCoord: parseInt(yStr, 10) * 1000,
  };
}

/** Extract year from filename, e.g. "..._N_2013.zip" → 2013 */
function parseYear(filename: string): number | undefined {
  const match = filename.match(/_(\d{4})\.zip$/i);
  return match ? parseInt(match[1], 10) : undefined;
}

/** Build a ParsedTile from raw vaknummer + URL strings. Returns null if input is unusable. */
function normalizeTile(vaknummer: unknown, rawUrl: unknown): ParsedTile | null {
  if (typeof vaknummer !== "string" || !vaknummer) return null;
  if (typeof rawUrl !== "string" || !rawUrl) return null;
  const fileName = rawUrl.split("/").pop() ?? "";
  const coords = parseCoordsFromVaknummer(vaknummer);
  if (isNaN(coords.xCoord) || isNaN(coords.yCoord)) return null;
  return {
    vaknummer:   vaknummer.trim(),
    downloadUrl: rawUrl.trim(),
    fileName,
    ...coords,
    year: parseYear(fileName),
  };
}

// ─── Fetch strategies ─────────────────────────────────────────────────────────

async function fetchFromCsv(): Promise<ParsedTile[]> {
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const text = await res.text();
  const lines = text.trim().split("\n").filter(Boolean);
  if (lines.length < 2) throw new Error("CSV has no data rows");

  // OpenDataSoft may use ';' or ',' — detect from header
  const sep = lines[0].includes(";") ? ";" : ",";
  const header = lines[0].split(sep).map((h) => h.replace(/"/g, "").trim());
  const vakIdx = header.indexOf("vaknummer");
  const urlIdx = header.indexOf("link_naar_open_data");
  if (vakIdx === -1 || urlIdx === -1) throw new Error("Expected columns not found in CSV header");

  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(sep);
      return normalizeTile(
        cols[vakIdx]?.replace(/"/g, "").trim(),
        cols[urlIdx]?.replace(/"/g, "").trim()
      );
    })
    .filter((t): t is ParsedTile => t !== null);
}

async function fetchFromJson(): Promise<ParsedTile[]> {
  const res = await fetch(JSON_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = (await res.json()) as any[];
  if (!Array.isArray(data)) throw new Error("Expected JSON array");
  return data
    .map((r) => normalizeTile(r.vaknummer, r.link_naar_open_data))
    .filter((t): t is ParsedTile => t !== null);
}

async function fetchFromGeojson(): Promise<ParsedTile[]> {
  const res = await fetch(GEOJSON_URL);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const data = (await res.json()) as { features: { properties: any }[] };
  if (!Array.isArray(data?.features)) throw new Error("Expected GeoJSON FeatureCollection");
  return data.features
    .map((f) => normalizeTile(f.properties?.vaknummer, f.properties?.link_naar_open_data))
    .filter((t): t is ParsedTile => t !== null);
}

async function fetchFromV1(): Promise<ParsedTile[]> {
  const PAGE_SIZE = 100;
  const tiles: ParsedTile[] = [];
  let start = 0;

  while (true) {
    const res = await fetch(`${V1_URL}&start=${start}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { records: { fields: any }[] };
    const records = data.records ?? [];

    for (const r of records) {
      const tile = normalizeTile(r.fields?.vaknummer, r.fields?.link_naar_open_data);
      if (tile) tiles.push(tile);
    }

    if (records.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
    console.log(`[Gent3D] API v1: fetched ${tiles.length} tiles so far...`);
  }

  return tiles;
}

/** Try each source in order; returns the first successful non-empty result. */
async function fetchTileIndex(): Promise<ParsedTile[]> {
  const sources: [string, () => Promise<ParsedTile[]>][] = [
    ["CSV export (API v2)", fetchFromCsv],
    ["JSON export (API v2)", fetchFromJson],
    ["GeoJSON (OpenDataSoft)", fetchFromGeojson],
    ["Records API v1 (paginated)", fetchFromV1],
  ];

  for (const [name, fetcher] of sources) {
    try {
      console.log(`[Gent3D] Trying source: ${name}...`);
      const tiles = await fetcher();
      if (tiles.length > 0) {
        console.log(`[Gent3D] ✓ Fetched ${tiles.length} tiles from "${name}".`);
        return tiles;
      }
      console.warn(`[Gent3D] Source "${name}" returned 0 tiles. Trying next...`);
    } catch (err: any) {
      console.warn(`[Gent3D] Source "${name}" failed: ${err.message}. Trying next...`);
    }
  }

  throw new Error("All data sources failed — cannot fetch tile index.");
}

// ─── File download ────────────────────────────────────────────────────────────

/**
 * Stream a file from url to destPath, following redirects.
 * Logs progress every 10 MB.
 * Returns the total number of bytes written.
 */
function downloadFile(url: string, destPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const tmpPath = `${destPath}.tmp`;
    const file = fs.createWriteStream(tmpPath);

    const cleanup = () => fs.unlink(tmpPath, () => {});

    const doRequest = (requestUrl: string, redirects = 0) => {
      if (redirects > 5) {
        cleanup();
        reject(new Error("Too many redirects"));
        return;
      }

      const lib = requestUrl.startsWith("https") ? https : http;
      const req = lib.get(requestUrl, (response) => {
        // Follow redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const location = response.headers.location;
          if (!location) {
            cleanup();
            reject(new Error("Redirect with no Location header"));
            return;
          }
          response.resume(); // drain the response body
          doRequest(location, redirects + 1);
          return;
        }

        if (response.statusCode !== 200) {
          cleanup();
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }

        const totalBytes = parseInt(response.headers["content-length"] ?? "0", 10);
        let downloadedBytes = 0;
        let lastLoggedMB = -1;

        response.on("data", (chunk: Buffer) => {
          downloadedBytes += chunk.length;
          const mb = Math.floor(downloadedBytes / (1024 * 1024));
          if (mb >= lastLoggedMB + 10) {
            lastLoggedMB = mb;
            const totalMB = totalBytes
              ? ` / ${Math.round(totalBytes / (1024 * 1024))} MB`
              : "";
            console.log(`[Gent3D]   ${mb} MB${totalMB} downloaded...`);
          }
        });

        response.pipe(file);

        file.on("finish", () => {
          file.close(() => {
            try {
              fs.renameSync(tmpPath, destPath);
              resolve(downloadedBytes);
            } catch (renameErr) {
              reject(renameErr);
            }
          });
        });
      });

      req.on("error", (err) => {
        cleanup();
        reject(err);
      });
    };

    file.on("error", (err) => {
      cleanup();
      reject(err);
    });

    doRequest(url);
  });
}

/** Retry downloadFile up to maxRetries times with exponential backoff (1s, 2s, 4s). */
async function downloadWithRetry(
  url: string,
  destPath: string,
  maxRetries = 3
): Promise<number> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await downloadFile(url, destPath);
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      const delayMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
      console.warn(
        `[Gent3D]   Attempt ${attempt}/${maxRetries} failed: ${err.message}. Retrying in ${delayMs / 1000}s...`
      );
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error("Max retries exceeded");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function fetchGent3d() {
  const startTime = Date.now();
  console.log("[Gent3D] ─────────────────────────────────────────────");
  console.log("[Gent3D] Starting Gent 3D tile fetch...");
  if (DRY_RUN) console.log("[Gent3D] Mode: DRY RUN — metadata only, no file downloads.");
  if (FORCE)   console.log("[Gent3D] Mode: FORCE — re-downloading already completed tiles.");
  if (isFinite(LIMIT)) console.log(`[Gent3D] Mode: LIMIT=${LIMIT} tiles.`);

  try {
    await mongoose.connect(MONGO_URI);
    console.log("[Gent3D] Connected to MongoDB.");

    // ── Phase 1+2: Fetch and parse tile index ──────────────────────────────
    let tiles = await fetchTileIndex();

    if (isFinite(LIMIT)) {
      tiles = tiles.slice(0, LIMIT);
      console.log(`[Gent3D] Limited to ${tiles.length} tiles.`);
    }

    // ── Phase 3: Upsert metadata ──────────────────────────────────────────
    console.log(`[Gent3D] Upserting metadata for ${tiles.length} tiles...`);
    let metaCreated = 0;
    let metaUpdated = 0;
    let metaUnchanged = 0;

    for (const tile of tiles) {
      const result = await Gent3dTile.updateOne(
        { vaknummer: tile.vaknummer },
        {
          $set: {
            xCoord:      tile.xCoord,
            yCoord:      tile.yCoord,
            downloadUrl: tile.downloadUrl,
            fileName:    tile.fileName,
            year:        tile.year,
          },
          $setOnInsert: {
            downloadStatus: "pending",
          },
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0)     metaCreated++;
      else if (result.modifiedCount > 0) metaUpdated++;
      else                               metaUnchanged++;
    }

    console.log(
      `[Gent3D] Metadata upserted: ${metaCreated} created, ${metaUpdated} updated, ${metaUnchanged} unchanged.`
    );

    if (DRY_RUN) {
      console.log("[Gent3D] Dry run complete — skipping file downloads.");
      return;
    }

    // ── Phase 4: Download files ───────────────────────────────────────────
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    console.log(`[Gent3D] Download directory: ${DOWNLOAD_DIR}`);
    console.log("[Gent3D] Starting file downloads...");

    let downloaded  = 0;
    let skipped     = 0;
    let errors      = 0;

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const position = `[${i + 1}/${tiles.length}]`;

      // Skip already-done tiles unless --force
      if (!FORCE) {
        const existing = await Gent3dTile.findOne({ vaknummer: tile.vaknummer }).lean();
        if (existing?.downloadStatus === "done") {
          console.log(`[Gent3D] ${position} Skipping ${tile.vaknummer} (already done).`);
          skipped++;
          continue;
        }
      }

      const destPath = path.join(DOWNLOAD_DIR, tile.fileName);
      console.log(`[Gent3D] ${position} Downloading ${tile.vaknummer} → ${tile.fileName}`);

      // Mark as in-progress
      await Gent3dTile.updateOne(
        { vaknummer: tile.vaknummer },
        { $set: { downloadStatus: "downloading" } }
      );

      try {
        const fileSize = await downloadWithRetry(tile.downloadUrl, destPath);

        await Gent3dTile.updateOne(
          { vaknummer: tile.vaknummer },
          {
            $set: {
              downloadStatus:  "done",
              localPath:       destPath,
              fileSize,
              lastDownloadedAt: new Date(),
            },
            $unset: { errorMessage: "" },
          }
        );

        downloaded++;
        console.log(
          `[Gent3D] ✓ ${tile.vaknummer} — ${(fileSize / (1024 * 1024)).toFixed(1)} MB`
        );
      } catch (err: any) {
        await Gent3dTile.updateOne(
          { vaknummer: tile.vaknummer },
          { $set: { downloadStatus: "error", errorMessage: err.message } }
        );
        errors++;
        console.error(`[Gent3D] ✗ ${tile.vaknummer} — ${err.message}`);
      }

      // Overall progress after each tile
      const done = downloaded + skipped + errors;
      console.log(
        `[Gent3D] Progress: ${done}/${tiles.length} processed` +
        ` | Downloaded: ${downloaded} | Skipped: ${skipped} | Errors: ${errors}`
      );
    }

    // ── Phase 5: Final stats ──────────────────────────────────────────────
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log("[Gent3D] ─────────────────────────────────────────────");
    console.log(
      `[Gent3D] Done. Total: ${tiles.length} | Downloaded: ${downloaded} | Skipped: ${skipped} | Errors: ${errors}`
    );
    console.log(`[Gent3D] Time elapsed: ${elapsed}s`);
  } catch (err) {
    console.error("[Gent3D] Fatal error:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
    process.exit(process.exitCode ?? 0);
  }
}

fetchGent3d();

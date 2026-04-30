import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TILES_DIR = path.resolve(__dirname, "../public/tiles");
const PIPELINE = path.resolve(__dirname, "../scripts/pipeline.sh");

function glbCount(): number {
  try {
    return fs.readdirSync(TILES_DIR).filter((f) => f.endsWith(".glb")).length;
  } catch {
    return 0;
  }
}

export function startTilePipeline(): void {
  if (glbCount() > 0) {
    console.log(`[Tiles] ${glbCount()} GLB file(s) already present — skipping pipeline.`);
    return;
  }

  console.log("[Tiles] No GLB files found — starting conversion pipeline in background...");

  const child = spawn("bash", [PIPELINE], {
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (d) => process.stdout.write(`[Tiles] ${d}`));
  child.stderr?.on("data", (d) => process.stderr.write(`[Tiles] ${d}`));

  child.on("close", (code) => {
    if (code === 0) {
      console.log(`[Tiles] Pipeline finished — ${glbCount()} GLB file(s) ready.`);
    } else {
      console.error(`[Tiles] Pipeline exited with code ${code}.`);
    }
  });

  child.unref();
}

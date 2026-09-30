/**
 * Post-install:
 *  1. Copies the MediaPipe tasks-vision WASM runtime into /public/mediapipe/wasm
 *     so the app never depends on a third-party CDN at runtime.
 *  2. Best-effort download of the pose landmark model into /public/models.
 *     If the download fails (offline build), the app falls back to the CDN URL
 *     configured via NEXT_PUBLIC_POSE_MODEL_URL.
 */
import { cp, mkdir, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wasmSrc = path.join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const wasmDest = path.join(root, "public", "mediapipe", "wasm");
const modelDir = path.join(root, "public", "models");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

async function copyWasm() {
  if (!existsSync(wasmSrc)) {
    console.warn("[postinstall] @mediapipe/tasks-vision not installed yet; skipping wasm copy.");
    return;
  }
  await mkdir(wasmDest, { recursive: true });
  await cp(wasmSrc, wasmDest, { recursive: true });
  console.log("[postinstall] MediaPipe WASM copied to public/mediapipe/wasm");
}

async function fetchModel() {
  const dest = path.join(modelDir, "pose_landmarker_lite.task");
  if (existsSync(dest)) {
    const s = await stat(dest);
    if (s.size > 1_000_000) {
      console.log("[postinstall] Pose model already present.");
      return;
    }
  }
  try {
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1_000_000) throw new Error("suspiciously small download");
    await mkdir(modelDir, { recursive: true });
    await writeFile(dest, buf);
    console.log(`[postinstall] Pose model downloaded (${(buf.length / 1e6).toFixed(1)} MB).`);
  } catch (err) {
    console.warn(
      `[postinstall] Could not download pose model (${err.message}).\n` +
        "  The app will fall back to the CDN URL at runtime. To self-host later, run:\n" +
        "  curl -L -o public/models/pose_landmarker_lite.task " + MODEL_URL
    );
  }
}

await copyWasm();
await fetchModel();

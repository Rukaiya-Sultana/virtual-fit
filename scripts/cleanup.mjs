// Standalone cleanup job — run from cron, e.g.:
//   17 * * * * cd /var/www/virtual-fit && node scripts/cleanup.mjs >> /var/log/virtual-fit-cleanup.log 2>&1
// (The app also runs cleanup opportunistically; cron is defense in depth.)

import { promises as fs } from "node:fs";
import path from "node:path";

try {
  const env = await fs.readFile(".env", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env — use defaults */ }

const root = path.resolve(process.env.STORAGE_ROOT?.trim() || "./.storage");
const TTL = {
  temp: Number(process.env.TEMP_TTL_HOURS || 1) * 3600_000,
  uploads: Number(process.env.UPLOAD_TTL_HOURS || 24) * 3600_000,
  results: Number(process.env.RESULT_TTL_HOURS || 24) * 3600_000,
};

async function* walk(dir) {
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (e.isFile()) yield full;
  }
}

async function cleanTree(dir, ttl) {
  let removed = 0;
  let bytes = 0;
  for await (const f of walk(dir)) {
    const st = await fs.stat(f).catch(() => null);
    if (st && Date.now() - st.mtimeMs > ttl) {
      await fs.rm(f, { force: true });
      removed++;
      bytes += st.size;
    }
  }
  // Prune now-empty session directories.
  try {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const sub = path.join(dir, e.name);
      const files = await fs.readdir(sub).catch(() => null);
      if (files && files.length === 0) await fs.rm(sub, { recursive: true }).catch(() => {});
    }
  } catch { /* best effort */ }
  return { removed, bytes };
}

const [temp, uploads, results] = await Promise.all([
  cleanTree(path.join(root, "temp"), TTL.temp),
  cleanTree(path.join(root, "uploads", "sessions"), TTL.uploads),
  cleanTree(path.join(root, "results", "sessions"), TTL.results),
]);

const totalBytes = temp.bytes + uploads.bytes + results.bytes;
console.log(
  `[cleanup ${new Date().toISOString()}] temp:${temp.removed} uploads:${uploads.removed} results:${results.removed} freed:${(totalBytes / 1e6).toFixed(2)}MB`
);

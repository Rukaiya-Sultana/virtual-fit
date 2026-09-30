import { promises as fs } from "node:fs";
import path from "node:path";
import { config } from "./config";
import { getStorage } from "./storage/fs-storage";

// ─────────────────────────────────────────────────────────────────────────────
// Retention / cleanup for transient files.
//  - temp/*                      → TEMP_TTL_HOURS   (default 1h)
//  - uploads/sessions/<id>/*     → UPLOAD_TTL_HOURS (default 24h)
//  - results/sessions/<id>/*     → RESULT_TTL_HOURS (default 24h)
// Garment catalog assets are NEVER touched.
// ─────────────────────────────────────────────────────────────────────────────

export interface CleanupReport {
  tempFiles: number;
  uploadSessions: number;
  resultSessions: number;
  freedBytes: number;
  errors: number;
}

const HOUR_MS = 3600_000;

async function* walkFiles(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

async function deleteIfExpired(
  file: string,
  ttlMs: number,
  report: CleanupReport
): Promise<void> {
  try {
    const st = await fs.stat(file);
    if (Date.now() - st.mtimeMs > ttlMs) {
      await fs.rm(file, { force: true });
      report.freedBytes += st.size;
    }
  } catch {
    report.errors += 1;
  }
}

async function cleanSessions(
  baseDir: string,
  ttlMs: number,
  counter: keyof CleanupReport,
  report: CleanupReport
): Promise<void> {
  let sessions;
  try {
    sessions = await fs.readdir(baseDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const s of sessions) {
    if (!s.isDirectory()) continue;
    const dir = path.join(baseDir, s.name);
    try {
      const st = await fs.stat(dir);
      if (Date.now() - st.mtimeMs > ttlMs) {
        // Only remove the session directory when every file inside is expired.
        let allOld = true;
        for await (const f of walkFiles(dir)) {
          const fst = await fs.stat(f);
          if (Date.now() - fst.mtimeMs <= ttlMs) allOld = false;
        }
        if (allOld) {
          await fs.rm(dir, { recursive: true, force: true });
          (report[counter] as number) += 1;
        }
      }
    } catch {
      report.errors += 1;
    }
  }
}

/** Run one cleanup sweep. Safe to call concurrently; cheap enough for cron. */
export async function runCleanup(): Promise<CleanupReport> {
  const report: CleanupReport = {
    tempFiles: 0,
    uploadSessions: 0,
    resultSessions: 0,
    freedBytes: 0,
    errors: 0,
  };
  const root = getStorage().root();

  for await (const file of walkFiles(path.join(root, "temp"))) {
    await deleteIfExpired(file, config.tempTtlHours * HOUR_MS, report);
    report.tempFiles += 1;
  }

  await cleanSessions(
    path.join(root, "uploads", "sessions"),
    config.uploadTtlHours * HOUR_MS,
    "uploadSessions",
    report
  );
  await cleanSessions(
    path.join(root, "results", "sessions"),
    config.resultTtlHours * HOUR_MS,
    "resultSessions",
    report
  );

  return report;
}

let lastSweep = 0;

/**
 * Opportunistic cleanup — triggered at most every 15 minutes from API routes,
 * so deployment does not strictly require a cron job (though one is nice).
 */
export async function opportunisticCleanup(): Promise<void> {
  if (Date.now() - lastSweep < 15 * 60_000) return;
  lastSweep = Date.now();
  void runCleanup()
    .then((r) => {
      if (r.uploadSessions + r.resultSessions + r.tempFiles > 0) {
        console.log(
          `[cleanup] removed ${r.uploadSessions} upload sessions, ` +
            `${r.resultSessions} result sessions, freed ${(r.freedBytes / 1e6).toFixed(1)} MB`
        );
      }
    })
    .catch((err) => console.error("[cleanup] failed:", err));
}

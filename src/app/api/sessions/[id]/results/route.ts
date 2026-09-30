import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getStorage, InvalidPathError } from "@/lib/storage/fs-storage";
import { normalizeUpload, ImageValidationError, assertDiskAvailable } from "@/lib/image";
import { config } from "@/lib/config";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const SESSION_ID_RE = /^[a-f0-9-]{10,64}$/;

/** POST /api/sessions/:id/results — persist a generated try-on composite. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const rl = rateLimit(clientKey(req, "result"), config.uploadRateLimitPerMinute);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const id = params.id ?? "";
  if (!SESSION_ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await req.arrayBuffer());
    await assertDiskAvailable();
    const normalized = await normalizeUpload(buf, { maxDimension: 1600, quality: 90 });

    const storage = getStorage();
    const fileName = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.webp`;
    const stored = await storage.save({
      area: "results",
      subPath: path.posix.join("sessions", id, fileName),
      data: normalized.buffer,
      ext: "webp",
    });

    return NextResponse.json({
      ok: true,
      url: `/api/assets/${stored.relativePath}`,
      expiresInSeconds: config.resultTtlHours * 3600,
    });
  } catch (err) {
    if (err instanceof ImageValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof InvalidPathError) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }
    console.error("[sessions] result save failed:", err);
    return NextResponse.json({ error: "Could not save result" }, { status: 500 });
  }
}

/** GET /api/sessions/:id/results — list saved results for a session. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const id = params.id ?? "";
  if (!SESSION_ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }
  try {
    const storage = getStorage();
    const dirAbs = storage.resolveSafe(path.posix.join("results", "sessions", id));
    const entries = await fs.readdir(dirAbs).catch(() => [] as string[]);
    const files = entries
      .filter((f) => f.endsWith(".webp"))
      .sort()
      .reverse();
    return NextResponse.json({
      results: files.map((f) => ({
        url: `/api/assets/results/sessions/${id}/${f}`,
        name: f,
      })),
    });
  } catch (err) {
    if (err instanceof InvalidPathError) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }
    console.error("[sessions] list results failed:", err);
    return NextResponse.json({ error: "Could not list results" }, { status: 500 });
  }
}

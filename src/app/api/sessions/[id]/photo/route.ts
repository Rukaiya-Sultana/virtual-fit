import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getStorage, InvalidPathError } from "@/lib/storage/fs-storage";
import { normalizeUpload, ImageValidationError } from "@/lib/image";
import { config } from "@/lib/config";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { assertDiskAvailable } from "@/lib/image";

export const dynamic = "force-dynamic";

const SESSION_ID_RE = /^[a-f0-9-]{10,64}$/;

/**
 * PUT /api/sessions/:id/photo — store (or replace) the user photo for a session.
 * The raw body must be an image; it is validated, re-encoded to WebP and
 * stored under a generated name. Filenames from clients are never used.
 */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const rl = rateLimit(clientKey(req, "upload"), config.uploadRateLimitPerMinute);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many uploads. Try again shortly." },
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
    const normalized = await normalizeUpload(buf, { maxDimension: 1600 });

    const storage = getStorage();
    const stored = await storage.save({
      area: "uploads",
      subPath: path.posix.join("sessions", id, "original.webp"),
      data: normalized.buffer,
      ext: "webp",
    });
    // The save() 'wx' flag avoids overwriting; if a collision occurred a unique
    // suffix was written instead, so remove any previous file explicitly.
    const canonical = path.posix.join("uploads", "sessions", id, "original.webp");
    if (stored.relativePath !== canonical) {
      await fs.rename(stored.absolutePath, storage.resolveSafe(canonical)).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      url: `/api/assets/${canonical}`,
      width: normalized.width,
      height: normalized.height,
      expiresInSeconds: config.uploadTtlHours * 3600,
    });
  } catch (err) {
    if (err instanceof ImageValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    if (err instanceof InvalidPathError) {
      return NextResponse.json({ error: "Invalid session" }, { status: 400 });
    }
    console.error("[sessions] photo upload failed:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

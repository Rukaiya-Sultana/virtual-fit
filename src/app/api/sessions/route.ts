import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { getStorage } from "@/lib/storage/fs-storage";
import { config } from "@/lib/config";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { opportunisticCleanup } from "@/lib/cleanup";

export const dynamic = "force-dynamic";

/** POST /api/sessions — create a session directory for uploads/results. */
export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "session"), config.uploadRateLimitPerMinute);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  try {
    await getStorage().ensureLayout();
    const id = randomUUID();
    const abs = getStorage().resolveSafe(path.join("uploads", "sessions", id, ".keep"));
    await fs.mkdir(path.dirname(abs), { recursive: true });

    void opportunisticCleanup();

    return NextResponse.json({
      sessionId: id,
      uploadUrl: `/api/sessions/${id}/photo`,
      ttlHours: config.uploadTtlHours,
    });
  } catch (err) {
    console.error("[sessions] create failed:", err);
    return NextResponse.json({ error: "Could not create session" }, { status: 500 });
  }
}

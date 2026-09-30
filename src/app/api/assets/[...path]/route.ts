import { NextResponse } from "next/server";
import { getStorage, NotFoundError, InvalidPathError } from "@/lib/storage/fs-storage";
import { opportunisticCleanup } from "@/lib/cleanup";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  webp: "image/webp",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

// Controlled asset serving. The storage root is NEVER exposed as a static
// directory; files are streamed individually with a validated path and a
// whitelisted extension.
export async function GET(
  _req: Request,
  { params }: { params: { path: string[] } }
) {
  const segments = params.path ?? [];
  if (segments.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const area = segments[0];
  const allowedAreas = new Set(["garments", "uploads", "results", "temp"]);
  if (!allowedAreas.has(area)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rel = segments.join("/");
  const ext = rel.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[ext];
  if (!contentType) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const storage = getStorage();
  try {
    const buf = await storage.get(rel);
    // Catalog assets are immutable → cache hard. User files are transient.
    const cache =
      area === "garments"
        ? "public, max-age=86400, stale-while-revalidate=604800"
        : "private, max-age=600";
    if (area === "uploads" || area === "results") void opportunisticCleanup();
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(buf.byteLength),
        "Cache-Control": cache,
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof NotFoundError || err instanceof InvalidPathError) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    console.error("[assets] serve failed:", err);
    return NextResponse.json({ error: "Failed to read asset" }, { status: 500 });
  }
}

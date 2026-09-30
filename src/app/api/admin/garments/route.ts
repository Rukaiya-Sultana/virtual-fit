import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { isAdminRequest } from "@/lib/admin-auth";
import { getStorage } from "@/lib/storage/fs-storage";
import { upsertGarment, removeGarment, GarmentSchema, GarmentAnchorsSchema } from "@/lib/catalog";
import { normalizeUpload, ImageValidationError, assertDiskAvailable } from "@/lib/image";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const MetaSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase hyphenated slug")
    .max(64),
  name: z.string().min(1).max(80),
  category: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase category slug").max(40),
  color: z.string().min(1).max(40),
  colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fit: z.enum(["slim", "regular", "oversized"]),
  sleeve: z.enum(["short", "long", "none"]),
  style: z.array(z.string().min(1).max(30)).max(8),
  formality: z.coerce.number().int().min(1).max(5),
  occasions: z.array(z.string().min(1).max(40)).max(10),
  /** 0 = use the category default. */
  lengthFactor: z.coerce.number().min(0).max(2.5),
  anchors: GarmentAnchorsSchema,
  // Ecommerce
  price: z.coerce.number().min(0).max(100000).optional(),
  description: z.string().max(1000).optional(),
  sizes: z.array(z.string().min(1).max(8)).max(12).optional(),
  badge: z.string().max(20).optional(),
  stock: z.coerce.number().int().min(0).max(1000000).optional(),
});

const LENGTH_FACTOR_BY_CATEGORY: Record<string, number> = {
  tshirt: 1.0,
  polo: 1.02,
  shirt: 1.08,
  sweatshirt: 1.12,
  hoodie: 1.22,
  jacket: 1.15,
};

function formatMetadataIssues(error: z.ZodError): string {
  const labels: Record<string, string> = {
    id: "Product ID", name: "Name", category: "Category", color: "Color", colorHex: "Color hex",
    fit: "Fit", sleeve: "Sleeve", style: "Style tags", occasions: "Occasions", formality: "Formality",
    lengthFactor: "Length factor", price: "Price", stock: "Stock", sizes: "Sizes", anchors: "Anchor coordinates",
  };
  return error.issues.slice(0, 3).map((issue) => {
    const key = String(issue.path[0] ?? "metadata");
    const label = labels[key] ?? key;
    if (issue.code === "invalid_type" && issue.received === "undefined") return `${label} is required.`;
    return `${label}: ${issue.message}`;
  }).join(" ");
}

/**
 * POST /api/admin/garments — multipart form:
 *   image: garment PNG/WebP (transparent background strongly recommended)
 *   meta: JSON string matching MetaSchema
 *
 * Pipeline: validate → store original → alpha-trim + resize (processed) →
 * thumbnail → catalog entry. Anchors are interpreted relative to the
 * PROCESSED image; when not supplied they default to a sane torso quad.
 */
export async function POST(req: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rl = rateLimit(clientKey(req, "admin-garment"), 20);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  try {
    await assertDiskAvailable();
    const form = await req.formData();
    const file = form.get("image");
    const metaRaw = form.get("meta");
    if (!(file instanceof File) || typeof metaRaw !== "string") {
      return NextResponse.json({ error: "Missing image or metadata" }, { status: 400 });
    }
    if (file.size > 12 * 1024 * 1024) {
      return NextResponse.json({ error: "Image exceeds 12 MB" }, { status: 422 });
    }

    let metaRawObject: unknown;
    try {
      metaRawObject = JSON.parse(metaRaw);
    } catch {
      return NextResponse.json({ error: "Garment metadata must be valid JSON." }, { status: 400 });
    }
    const parsedMeta = MetaSchema.safeParse(metaRawObject);
    if (!parsedMeta.success) {
      return NextResponse.json({ error: formatMetadataIssues(parsedMeta.error) }, { status: 400 });
    }
    const meta = parsedMeta.data;
    const category = await prisma.category.findUnique({ where: { name: meta.category } });
    if (!category) {
      return NextResponse.json({ error: "Category does not exist. Create it in the Categories section first." }, { status: 400 });
    }

    const raw = Buffer.from(await file.arrayBuffer());
    let normalized;
    try {
      normalized = await normalizeUpload(raw, { maxDimension: 1200, quality: 95 });
    } catch (err) {
      if (err instanceof ImageValidationError) {
        return NextResponse.json({ error: err.message }, { status: 422 });
      }
      throw err;
    }
    if (!normalized.buffer.length) {
      return NextResponse.json({ error: "Empty image" }, { status: 422 });
    }

    const storage = getStorage();
    await storage.ensureLayout();

    // Store the untouched original for future re-processing.
    await storage.save({
      area: "garments",
      subPath: path.posix.join("original", `${meta.id}.webp`),
      data: normalized.buffer,
      ext: "webp",
    });

    // Processed: trim to the alpha bounding box so the mesh maps content.
    const processed = await sharp(normalized.buffer)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize({ width: 900, height: 1400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 92, alphaQuality: 100 })
      .toBuffer({ resolveWithObject: true });

    const processedRel = path.posix.join("garments", "processed", `${meta.id}.webp`);
    await fs.writeFile(storage.resolveSafe(processedRel), processed.data);

    const thumb = await sharp(processed.data)
      .resize({ width: 384, height: 480, fit: "inside" })
      .webp({ quality: 82 })
      .toBuffer();
    const thumbRel = path.posix.join("garments", "thumbnails", `${meta.id}.webp`);
    await fs.writeFile(storage.resolveSafe(thumbRel), thumb);

    // Scale anchors from the uploaded coordinate space (0..1 of the original
    // upload) into the trimmed/resized processed space when the client
    // provides anchors against the uploaded image. The admin UI sends
    // anchors already normalized to the trimmed preview it displays; both
    // spaces are equivalent because the preview IS the trimmed image.
    const garment = GarmentSchema.parse({
      id: meta.id,
      name: meta.name,
      category: meta.category,
      color: meta.color,
      colorHex: meta.colorHex,
      fit: meta.fit,
      sleeve: meta.sleeve,
      style: meta.style,
      formality: meta.formality,
      occasions: meta.occasions,
      lengthFactor:
        meta.lengthFactor > 0
          ? meta.lengthFactor
          : LENGTH_FACTOR_BY_CATEGORY[meta.category] ?? 1,
      assetPath: processedRel,
      originalPath: path.posix.join("garments", "original", `${meta.id}.webp`),
      thumbnailPath: thumbRel,
      anchors: meta.anchors,
      width: processed.info.width,
      height: processed.info.height,
      createdAt: new Date().toISOString(),
      price: meta.price,
      description: meta.description || undefined,
      sizes: meta.sizes && meta.sizes.length > 0 ? meta.sizes : undefined,
      badge: meta.badge || undefined,
      stock: meta.stock ?? 100,
    });

    await upsertGarment(garment);
    return NextResponse.json({ ok: true, garment });
  } catch (err) {
    console.error("[admin/garments] create failed:", err);
    return NextResponse.json({ error: "Could not save garment" }, { status: 500 });
  }
}

/** DELETE /api/admin/garments?id=... — removes metadata (files kept). */
export async function DELETE(req: Request) {
  if (!(await isAdminRequest())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const referenced = await prisma.orderItem.count({ where: { productId: id } });
  if (referenced) return NextResponse.json({ error: "This product is referenced by existing orders and cannot be deleted." }, { status: 409 });
  const removed = await removeGarment(id);
  if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** PATCH /api/admin/garments — update validated product metadata without replacing its image assets. */
export async function PATCH(req: Request) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = z.object({ garment: GarmentSchema }).safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid product data." }, { status: 400 });
  const existing = await prisma.product.findUnique({ where: { id: body.data.garment.id } });
  if (!existing) return NextResponse.json({ error: "Product not found." }, { status: 404 });
  await upsertGarment({ ...body.data.garment, assetPath: existing.assetPath, originalPath: existing.originalPath, thumbnailPath: existing.thumbnailPath, width: existing.width, height: existing.height, createdAt: existing.createdAt.toISOString() });
  return NextResponse.json({ ok: true });
}

import sharp from "sharp";
import { config } from "./config";

// ─────────────────────────────────────────────────────────────────────────────
// Server-side image validation & normalization.
// Uploaded files are untrusted: verify magic bytes with sharp (not just the
// declared MIME), enforce dimensions, strip metadata, re-encode to WebP.
// ─────────────────────────────────────────────────────────────────────────────

export class ImageValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageValidationError";
  }
}

const ALLOWED_INPUT_TYPES = new Set(["jpeg", "png", "webp"]);

export interface NormalizedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * Validate an uploaded image buffer and normalize it:
 * - real format sniffing (magic bytes) — extensions/MIME headers are ignored
 * - rejects tiny (< 64px) and huge (> config.maxImageDimension) images
 * - strips EXIF/metadata, re-encodes as lossy WebP (alpha preserved)
 */
export async function normalizeUpload(
  input: Buffer,
  opts: { maxBytes?: number; maxDimension?: number; quality?: number } = {}
): Promise<NormalizedImage> {
  const maxBytes = opts.maxBytes ?? config.maxUploadBytes;
  const maxDim = opts.maxDimension ?? config.maxImageDimension;

  if (input.byteLength === 0) throw new ImageValidationError("Empty file.");
  if (input.byteLength > maxBytes) {
    throw new ImageValidationError(
      `File is too large (${(input.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is ${Math.round(maxBytes / 1024 / 1024)} MB.`
    );
  }

  let meta;
  try {
    meta = await sharp(input).metadata();
  } catch {
    throw new ImageValidationError("File is not a valid image.");
  }
  if (!meta.format || !ALLOWED_INPUT_TYPES.has(meta.format)) {
    throw new ImageValidationError("Unsupported image format. Use JPEG, PNG or WebP.");
  }
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < 64 || height < 64) {
    throw new ImageValidationError("Image is too small (minimum 64×64 pixels).");
  }
  if (width > 12000 || height > 12000) {
    throw new ImageValidationError("Image dimensions are unreasonably large.");
  }

  try {
    const pipeline = sharp(input)
      .rotate() // respect EXIF orientation, then strip it
      .resize({
        width: Math.min(width, maxDim),
        height: Math.min(height, maxDim),
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: opts.quality ?? 88 });

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch (err) {
    console.error("[image] normalize failed:", err);
    throw new ImageValidationError("Could not process the image.");
  }
}

/** Free-disk check helper — refuses writes when the disk is nearly full. */
export async function assertDiskAvailable(minBytes = 500 * 1024 * 1024): Promise<void> {
  try {
    const fsp = (await import("node:fs")).promises as unknown as {
      statfs?: (p: string) => Promise<{ bavail?: number; bsize?: number }>;
    };
    if (typeof fsp.statfs === "function") {
      const st = await fsp.statfs("/");
      if (
        st &&
        typeof st.bavail === "number" &&
        typeof st.bsize === "number" &&
        st.bavail * st.bsize < minBytes
      ) {
        throw new ImageValidationError("Server storage is nearly full. Try again later.");
      }
    }
    // statfs unsupported on this platform — skip the check.
  } catch (err) {
    if (err instanceof ImageValidationError) throw err;
    // Best effort: ignore other failures.
  }
}

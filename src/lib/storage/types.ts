// ─────────────────────────────────────────────────────────────────────────────
// Storage abstraction. The rest of the app depends only on this interface;
// the initial implementation targets the Lightsail VPS filesystem.
// ─────────────────────────────────────────────────────────────────────────────

export type StorageArea = "garments" | "uploads" | "results" | "temp";

export interface SaveImageOptions {
  /** Storage area (top-level directory). */
  area: StorageArea;
  /** Sub-path inside the area. MUST already be sanitized (generated IDs). */
  subPath: string;
  /** File contents. */
  data: Buffer;
  /** File extension WITHOUT a dot, e.g. "webp". Validated against a whitelist. */
  ext: string;
}

export interface StoredImage {
  /** Path relative to the storage root, usable with ImageStorage.get/delete. */
  relativePath: string;
  /** Absolute filesystem path (server-side only). */
  absolutePath: string;
  bytes: number;
}

export interface ImageStorage {
  /** Persist an image buffer. Returns metadata about the stored file. */
  save(opts: SaveImageOptions): Promise<StoredImage>;
  /** Read an image buffer. Throws NotFoundError if missing. */
  get(relativePath: string): Promise<Buffer>;
  /** Check existence. */
  exists(relativePath: string): Promise<boolean>;
  /** Delete a file (or empty directory when relativePath ends with '/'). */
  delete(relativePath: string): Promise<void>;
  /** Ensure the standard directory layout exists. */
  ensureLayout(): Promise<void>;
  /** Root directory (absolute). */
  root(): string;
  /** Parse & validate an asset URL path into a safe absolute path. */
  resolveSafe(relativePath: string): string;
}

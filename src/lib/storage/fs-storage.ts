import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ImageStorage,
  SaveImageOptions,
  StoredImage,
  StorageArea,
} from "./types";

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class InvalidPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPathError";
  }
}

const AREAS: readonly StorageArea[] = ["garments", "uploads", "results", "temp"] as const;
const ALLOWED_EXTENSIONS = new Set(["webp", "png", "jpg", "jpeg"]);

/**
 * Filesystem-backed image storage for a single-VPS deployment.
 *
 * Security model:
 *  - Every path is resolved against a fixed root and checked with a prefix
 *    comparison, so traversal ("../") can never escape the root.
 *  - Only whitelisted areas and extensions can be written.
 *  - Callers must pass generated sub-paths (UUIDs); user filenames are never used.
 */
export class FileSystemImageStorage implements ImageStorage {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  root(): string {
    return this.rootDir;
  }

  /** Resolve a relative path to an absolute path, rejecting traversal attempts. */
  resolveSafe(relativePath: string): string {
    if (typeof relativePath !== "string" || relativePath.length === 0) {
      throw new InvalidPathError("Empty path");
    }
    // Reject null bytes and explicit traversal segments early.
    if (relativePath.includes("\0")) throw new InvalidPathError("Null byte in path");
    const segments = relativePath.split(/[\\/]+/).filter(Boolean);
    if (segments.some((s) => s === "." || s === "..")) {
      throw new InvalidPathError("Traversal segment in path");
    }
    const abs = path.resolve(this.rootDir, ...segments);
    const rootWithSep = this.rootDir.endsWith(path.sep)
      ? this.rootDir
      : this.rootDir + path.sep;
    if (abs !== this.rootDir && !abs.startsWith(rootWithSep)) {
      throw new InvalidPathError("Path escapes storage root");
    }
    return abs;
  }

  async ensureLayout(): Promise<void> {
    const dirs = [
      path.join(this.rootDir, "garments", "original"),
      path.join(this.rootDir, "garments", "processed"),
      path.join(this.rootDir, "garments", "thumbnails"),
      path.join(this.rootDir, "uploads", "sessions"),
      path.join(this.rootDir, "results", "sessions"),
      path.join(this.rootDir, "temp"),
    ];
    await Promise.all(dirs.map((d) => fs.mkdir(d, { recursive: true })));
  }

  async save(opts: SaveImageOptions): Promise<StoredImage> {
    const { area, subPath, data, ext } = opts;
    if (!AREAS.includes(area)) throw new InvalidPathError(`Unknown storage area: ${area}`);
    if (!ALLOWED_EXTENSIONS.has(ext)) throw new InvalidPathError(`Extension not allowed: .${ext}`);

    const segments = subPath.split(/[\\/]+/).filter(Boolean);
    if (segments.length === 0) throw new InvalidPathError("Empty subPath");
    if (segments.some((s) => s === "." || s === "..")) {
      throw new InvalidPathError("Traversal segment in subPath");
    }

    const fileName = segments[segments.length - 1];
    if (!/^[A-Za-z0-9._-]+$/.test(fileName)) {
      throw new InvalidPathError("Unsafe file name");
    }

    const relativePath = [area, ...segments].join("/");
    const abs = this.resolveSafe(relativePath);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, data, { flag: "wx" }).catch(async (err: NodeJS.ErrnoException) => {
      if (err.code === "EEXIST") {
        // Retry once with a unique suffix — never overwrite an existing file.
        const unique = `${randomUUID()}-${fileName}`;
        const retryRel = [area, ...segments.slice(0, -1), unique].join("/");
        const retryAbs = this.resolveSafe(retryRel);
        await fs.writeFile(retryAbs, data, { flag: "wx" });
        return retryAbs;
      }
      throw err;
    });
    const finalAbs = (await fs.stat(abs).catch(() => null)) ? abs : abs; // abs written or retried path found below
    // Determine the actually-written file (writeFile with wx either wrote abs or the retry path)
    const writtenAbs = (await fs.stat(abs)).isFile()
      ? abs
      : finalAbs;
    return {
      relativePath,
      absolutePath: writtenAbs,
      bytes: data.byteLength,
    };
  }

  async get(relativePath: string): Promise<Buffer> {
    const abs = this.resolveSafe(relativePath);
    try {
      return await fs.readFile(abs);
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code === "ENOENT") throw new NotFoundError(`Not found: ${relativePath}`);
      throw e;
    }
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      const abs = this.resolveSafe(relativePath);
      await fs.access(abs);
      return true;
    } catch {
      return false;
    }
  }

  async delete(relativePath: string): Promise<void> {
    const abs = this.resolveSafe(relativePath);
    await fs.rm(abs, { recursive: false, force: true }).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== "ENOENT") throw err;
    });
  }
}

let instance: ImageStorage | null = null;

/** Get the process-wide storage instance (filesystem implementation). */
export function getStorage(): ImageStorage {
  if (!instance) {
    const root = process.env.STORAGE_ROOT?.trim() || "./.storage";
    instance = new FileSystemImageStorage(root);
  }
  return instance;
}

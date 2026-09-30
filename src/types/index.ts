// ─────────────────────────────────────────────────────────────────────────────
// Shared domain types for Virtual Fit
// ─────────────────────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

/** Landmark as reported by a pose detector (normalized image coordinates). */
export interface Landmark extends Point {
  /** 0..1 visibility / confidence score */
  visibility: number;
}

/**
 * Clean internal representation of detected body geometry.
 * Naming follows MediaPipe semantics: `leftShoulder` is the *subject's* left
 * shoulder, which appears on the RIGHT side of the image from the viewer's
 * perspective (like a mirror). The fitting engine converts to viewer-space
 * explicitly, see `lib/fitting/engine.ts`.
 */
export interface BodyLandmarks {
  leftShoulder: Landmark;
  rightShoulder: Landmark;
  leftElbow: Landmark;
  rightElbow: Landmark;
  leftWrist: Landmark;
  rightWrist: Landmark;
  leftHip: Landmark;
  rightHip: Landmark;
}

/** Category names are database-managed lowercase slugs (for example, `coat`). */
export type GarmentCategory = string;
export type FitType = "slim" | "regular" | "oversized";
export type SleeveType = "short" | "long" | "none";

/**
 * Garment anchors are defined in *image space* of the processed garment asset,
 * normalized to 0..1 relative to the image dimensions:
 *   - leftShoulder = shoulder seam at the LEFT edge of the garment image
 *     (this sits on the subject's RIGHT shoulder when worn, viewer-left).
 *   - hems are the bottom corners of the garment body.
 */
export interface GarmentAnchors {
  leftShoulder: Point;
  rightShoulder: Point;
  leftHem: Point;
  rightHem: Point;
}

export interface Garment {
  id: string;
  name: string;
  category: GarmentCategory;
  color: string;
  colorHex: string;
  fit: FitType;
  sleeve: SleeveType;
  style: string[];
  formality: number; // 1 (very casual) .. 5 (formal)
  occasions: string[];
  /** Garment hem distance below shoulder line, as a multiple of the torso length. */
  lengthFactor: number;
  /** Path relative to STORAGE_ROOT, e.g. garments/processed/blue-hoodie.webp */
  assetPath: string;
  originalPath: string;
  thumbnailPath: string;
  anchors: GarmentAnchors;
  width: number;
  height: number;
  createdAt: string;

  // ── Ecommerce fields (optional so try-on-only garments still work) ──────
  /** Price in the store currency (USD). */
  price?: number;
  /** Short product description for the shop. */
  description?: string;
  /** Available sizes, e.g. ["S","M","L","XL","XXL"]. */
  sizes?: string[];
  /** Merchandising badge, e.g. "new" | "bestseller". */
  badge?: string;
  /** Available inventory. Omitted only for older API consumers. */
  stock?: number;
}

/** Manual adjustments applied on top of the automatic fit. */
export interface Adjustments {
  /** Horizontal offset, in fractions of shoulder width. +x = viewer right. */
  offsetX: number;
  /** Vertical offset, in fractions of torso length. +y = down. */
  offsetY: number;
  /** Width multiplier applied to the auto-computed garment width. */
  widthScale: number;
  /** Height multiplier applied to the auto-computed garment height. */
  heightScale: number;
  /** Additional rotation in degrees (clockwise). */
  rotationDeg: number;
  /** Garment layer opacity 0..1 */
  opacity: number;
  /** Sleeve drape extension multiplier (1 = neutral). */
  sleeveLength: number;
  /** Fit width factor preset, layered under widthScale. */
  fit: FitType;
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  offsetX: 0,
  offsetY: 0,
  widthScale: 1,
  heightScale: 1,
  rotationDeg: 0,
  opacity: 1,
  sleeveLength: 1,
  fit: "regular",
};

/** Fit → width/looseness factors used by the fitting engine. */
export const FIT_FACTORS: Record<FitType, { width: number; hem: number; waist: number }> = {
  slim: { width: 0.97, hem: 0.92, waist: 0.9 },
  regular: { width: 1.04, hem: 1.02, waist: 0.97 },
  oversized: { width: 1.16, hem: 1.22, waist: 1.12 },
};

export interface SessionRecord {
  id: string;
  createdAt: number;
  expiresAt: number;
  photoCount: number;
  resultCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Garment geometry engine.
//
// Pipeline:
//  1. Body landmarks (MediaPipe, subject-space) → viewer-space torso frame.
//  2. Garment anchors (image-space quad) + fit preset + manual adjustments
//     → destination quad on the photo.
//  3. A full-image grid mesh is deformed: a base affine transform (from the
//     shoulder/hem anchor triangle) plus an inverse-distance-weighted
//     displacement field driven by control points (hem residual, waist
//     shaping, sleeve drape along arm directions).
//  4. The renderer draws the mesh with piecewise-affine triangle mapping.
//
// This is geometric garment transformation — NOT generative/diffusion VTO.
// ─────────────────────────────────────────────────────────────────────────────

import type { Adjustments, BodyLandmarks, Garment } from "@/types";
import { FIT_FACTORS } from "@/types";
import {
  type Quad,
  type Vec,
  add,
  affineFromTriangles,
  applyAffine,
  clamp,
  dot,
  len,
  lerpVec,
  normalize,
  perpDown,
  quadPoint,
  rotateAround,
  scale as vscale,
  sub,
} from "./geometry";

export interface TorsoFrame {
  /** Viewer-left shoulder (= subject's RIGHT shoulder, MediaPipe lm 12). */
  shoulderL: Vec;
  shoulderR: Vec;
  hipL: Vec;
  hipR: Vec;
  elbowL: Vec;
  elbowR: Vec;
  center: Vec;
  xAxis: Vec; // unit, viewer-left → viewer-right
  yAxis: Vec; // unit, shoulder → hip ("down")
  shoulderWidth: number; // px
  torsoLength: number; // px, shoulder midpoint → hip midpoint
  hipsVisible: boolean;
}

/**
 * Convert subject-space landmarks into a viewer-space torso frame.
 * Missing/low-confidence hips are imputed from anthropometric ratios and the
 * frame is flagged so the UI can warn the user.
 */
export function buildTorsoFrame(
  body: BodyLandmarks,
  imageWidth: number,
  imageHeight: number
): TorsoFrame {
  // Viewer-left = subject's right side (mirror semantics).
  const shoulderL = { x: body.rightShoulder.x * imageWidth, y: body.rightShoulder.y * imageHeight };
  const shoulderR = { x: body.leftShoulder.x * imageWidth, y: body.leftShoulder.y * imageHeight };
  const hipL = { x: body.rightHip.x * imageWidth, y: body.rightHip.y * imageHeight };
  const hipR = { x: body.leftHip.x * imageWidth, y: body.leftHip.y * imageHeight };
  const elbowL = { x: body.rightElbow.x * imageWidth, y: body.rightElbow.y * imageHeight };
  const elbowR = { x: body.leftElbow.x * imageWidth, y: body.leftElbow.y * imageHeight };

  const center = lerpVec(shoulderL, shoulderR, 0.5);
  const shoulderWidth = Math.max(len(sub(shoulderR, shoulderL)), 1);

  const hipsVisible =
    (body.leftHip.visibility ?? 0) >= 0.5 && (body.rightHip.visibility ?? 0) >= 0.5;

  const shoulderVec = normalize(sub(shoulderR, shoulderL));
  let xAxis = shoulderVec;
  let torsoLength = shoulderWidth * 1.5;
  let hipMid = add(center, vscale(perpDown(shoulderVec), torsoLength));

  if (hipsVisible) {
    const hipMidActual = lerpVec(hipL, hipR, 0.5);
    const hipVec = normalize(sub(hipR, hipL));
    // Blend shoulder & hip directions for a stable torso axis.
    xAxis = normalize(add(vscale(shoulderVec, 0.65), vscale(hipVec, 0.35)));
    torsoLength = clamp(len(sub(hipMidActual, center)), shoulderWidth * 0.8, shoulderWidth * 2.5);
    hipMid = add(center, vscale(normalize(sub(hipMidActual, center)), torsoLength));
  }

  let yAxis = perpDown(xAxis);
  if (hipsVisible) {
    const toHips = sub(hipMid, center);
    if (dot(yAxis, toHips) < 0) yAxis = vscale(yAxis, -1);
  }

  return {
    shoulderL,
    shoulderR,
    hipL: hipsVisible ? hipL : sub(hipMid, vscale(xAxis, shoulderWidth * 0.42)),
    hipR: hipsVisible ? hipR : add(hipMid, vscale(xAxis, shoulderWidth * 0.42)),
    elbowL,
    elbowR,
    center,
    xAxis,
    yAxis,
    shoulderWidth,
    torsoLength,
    hipsVisible,
  };
}

export interface Placement {
  /** Grid dimensions. */
  cols: number;
  rows: number;
  /** Source mesh vertices in garment-image pixels (cols+1)×(rows+1), row-major. */
  srcPts: Vec[];
  /** Destination mesh vertices in photo pixels, same indexing. */
  dstPts: Vec[];
  /** Triangle indices into the vertex arrays. */
  triangles: Array<[number, number, number]>;
}

interface ControlPoint {
  src: Vec;
  disp: Vec;
}

/** Garment source anchors in pixel space + derived ratios. */
function garmentSourceQuad(garment: Garment): Quad {
  const { width, height, anchors } = garment;
  return {
    tl: { x: anchors.leftShoulder.x * width, y: anchors.leftShoulder.y * height },
    tr: { x: anchors.rightShoulder.x * width, y: anchors.rightShoulder.y * height },
    bl: { x: anchors.leftHem.x * width, y: anchors.leftHem.y * height },
    br: { x: anchors.rightHem.x * width, y: anchors.rightHem.y * height },
  };
}

/**
 * Compute the warped garment placement for the current body, garment,
 * fit preset and manual adjustments.
 */
export function computePlacement(
  frame: TorsoFrame,
  garment: Garment,
  adj: Adjustments,
  photoSize: { width: number; height: number }
): Placement {
  const cols = 8;
  const rows = 10;
  const srcQuad = garmentSourceQuad(garment);
  const fit = FIT_FACTORS[adj.fit];

  // ── Destination quad ───────────────────────────────────────────────────────
  const widthMul = fit.width * adj.widthScale;
  const dstShoulderSpan = frame.shoulderWidth * widthMul;

  const srcShoulderSpan = Math.max(len(sub(srcQuad.tr, srcQuad.tl)), 1);
  const srcHemSpan = Math.max(len(sub(srcQuad.br, srcQuad.bl)), 1);
  const hemRatio = clamp(srcHemSpan / srcShoulderSpan, 0.5, 1.6);

  const hemDist = frame.torsoLength * garment.lengthFactor * adj.heightScale;
  const dstHemSpan = dstShoulderSpan * hemRatio * fit.hem;

  // Slight vertical drop so the collar sits just below the shoulder line.
  const drop = vscale(frame.yAxis, frame.shoulderWidth * 0.02);
  const offset = add(
    vscale(frame.xAxis, adj.offsetX * frame.shoulderWidth),
    vscale(frame.yAxis, adj.offsetY * frame.torsoLength)
  );

  const shoulderMid = add(frame.center, add(drop, offset));
  const hemMid = add(shoulderMid, vscale(frame.yAxis, hemDist));

  let dstQuad: Quad = {
    tl: sub(shoulderMid, vscale(frame.xAxis, dstShoulderSpan / 2)),
    tr: add(shoulderMid, vscale(frame.xAxis, dstShoulderSpan / 2)),
    bl: sub(hemMid, vscale(frame.xAxis, dstHemSpan / 2)),
    br: add(hemMid, vscale(frame.xAxis, dstHemSpan / 2)),
  };

  if (Math.abs(adj.rotationDeg) > 0.01) {
    const pivot = lerpVec(dstQuad.tl, dstQuad.tr, 0.5);
    dstQuad = {
      tl: rotateAround(dstQuad.tl, pivot, adj.rotationDeg),
      tr: rotateAround(dstQuad.tr, pivot, adj.rotationDeg),
      bl: rotateAround(dstQuad.bl, pivot, adj.rotationDeg),
      br: rotateAround(dstQuad.br, pivot, adj.rotationDeg),
    };
  }

  // ── Base affine: exact mapping of the shoulder/hem anchor triangle ────────
  const baseAffine =
    affineFromTriangles(srcQuad.tl, srcQuad.tr, srcQuad.bl, dstQuad.tl, dstQuad.tr, dstQuad.bl) ??
    [1, 0, 0, 1, dstQuad.tl.x - srcQuad.tl.x, dstQuad.tl.y - srcQuad.tl.y];

  const controls: ControlPoint[] = [];

  // Anchor residuals (three are ~0 by construction; the hem spread residual
  // adapts the garment's taper to the destination quad exactly).
  const anchorPairs: Array<[Vec, Vec]> = [
    [srcQuad.tl, dstQuad.tl],
    [srcQuad.tr, dstQuad.tr],
    [srcQuad.bl, dstQuad.bl],
    [srcQuad.br, dstQuad.br],
  ];
  for (const [s, d] of anchorPairs) {
    controls.push({ src: s, disp: sub(d, applyAffine(baseAffine, s)) });
  }

  // Waist shaping — pulls the garment's side seams toward the torso axis,
  // differentiating slim (tapered) from oversized (boxy) silhouettes.
  const waistU = 0.58;
  for (const u of [0, 1] as const) {
    const srcP = quadPoint(srcQuad, u, waistU);
    const axisSrc = quadPoint(srcQuad, 0.5, waistU);
    const targetEdge = applyAffine(baseAffine, srcP);
    const targetAxis = applyAffine(baseAffine, axisSrc);
    const lateral = sub(targetEdge, targetAxis);
    controls.push({
      src: srcP,
      disp: vscale(lateral, clamp(fit.waist * (adj.widthScale + 1) / 2, 0.7, 1.35) - 1),
    });
  }

  // Sleeve drape — control points near the sleeve tips extend along the arm
  // direction (shoulder → elbow), weighted by the sleeve-length adjustment.
  const sleeveWeight = garment.sleeve === "long" ? 1 : garment.sleeve === "short" ? 0.45 : 0;
  const effectiveSleeve = 1 + (adj.sleeveLength - 1) * sleeveWeight;
  if (Math.abs(effectiveSleeve - 1) > 0.001) {
    const extension = frame.torsoLength * 0.32 * (effectiveSleeve - 1);
    const armDirL = normalizeWithFallback(sub(frame.elbowL, frame.shoulderL), frame.yAxis);
    const armDirR = normalizeWithFallback(sub(frame.elbowR, frame.shoulderR), frame.yAxis);
    controls.push({ src: quadPoint(srcQuad, 0.08, 0.16), disp: vscale(armDirL, extension) });
    controls.push({ src: quadPoint(srcQuad, 0.92, 0.16), disp: vscale(armDirR, extension) });
  }

  // ── Deform the grid mesh ───────────────────────────────────────────────────
  const w = garment.width;
  const h = garment.height;
  const eps = Math.pow(0.02 * Math.hypot(w, h), 2) + 1;

  const srcPts: Vec[] = [];
  const dstPts: Vec[] = [];

  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const p: Vec = { x: (c / cols) * w, y: (r / rows) * h };
      let target = applyAffine(baseAffine, p);
      if (controls.length > 0) {
        let wSum = 0;
        let dx = 0;
        let dy = 0;
        for (const ctrl of controls) {
          const d2 = (p.x - ctrl.src.x) ** 2 + (p.y - ctrl.src.y) ** 2;
          const weight = 1 / (d2 + eps);
          wSum += weight;
          dx += weight * ctrl.disp.x;
          dy += weight * ctrl.disp.y;
        }
        target = { x: target.x + dx / wSum, y: target.y + dy / wSum };
      }
      srcPts.push(p);
      dstPts.push(target);
    }
  }

  const triangles: Array<[number, number, number]> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * (cols + 1) + c;
      triangles.push([i, i + cols + 1, i + 1]);
      triangles.push([i + 1, i + cols + 1, i + cols + 2]);
    }
  }

  return { cols, rows, srcPts, dstPts, triangles };
}

function normalizeWithFallback(v: Vec, fallback: Vec): Vec {
  const n = normalize(v);
  return len(n) < 0.5 ? fallback : n;
}

/** Diagnostic summary (shown in the debug landmark overlay). */
export function frameSummary(frame: TorsoFrame): {
  shoulderWidthPx: number;
  torsoLengthPx: number;
  hipsVisible: boolean;
} {
  return {
    shoulderWidthPx: Math.round(frame.shoulderWidth),
    torsoLengthPx: Math.round(frame.torsoLength),
    hipsVisible: frame.hipsVisible,
  };
}

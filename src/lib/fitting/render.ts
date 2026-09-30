"use client";

// Piecewise-affine mesh warp renderer (Canvas 2D).
// Each mesh cell is split into two triangles; every triangle is drawn by
// computing the affine transform from its source to its destination vertices,
// clipping to the destination triangle, and drawing the full garment image
// under that transform. Destination triangles are expanded a fraction of a
// pixel to avoid hairline seams between cells.

import type { Placement } from "./engine";
import type { Vec } from "./geometry";

function expandTriangle(a: Vec, b: Vec, c: Vec, amount: number): [Vec, Vec, Vec] {
  const centroid: Vec = {
    x: (a.x + b.x + c.x) / 3,
    y: (a.y + b.y + c.y) / 3,
  };
  const push = (p: Vec): Vec => {
    const dx = p.x - centroid.x;
    const dy = p.y - centroid.y;
    const l = Math.hypot(dx, dy);
    if (l < 1e-6) return p;
    const k = (l + amount) / l;
    return { x: centroid.x + dx * k, y: centroid.y + dy * k };
  };
  return [push(a), push(b), push(c)];
}

export interface RenderOptions {
  opacity: number;
  /** Soft drop shadow under the garment (0 = disabled). */
  shadowBlur: number;
  shadowAlpha: number;
}

/**
 * Draw the warped garment onto ctx. The context must already carry the
 * correct base transform (e.g. devicePixelRatio scaling) and be sized to the
 * photo dimensions in CSS pixels.
 */
export function drawGarmentMesh(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  placement: Placement,
  opts: RenderOptions
): void {
  const { opacity, shadowBlur, shadowAlpha } = opts;
  const { srcPts, dstPts, triangles } = placement;

  // Render the warped garment to an offscreen layer first so opacity and
  // shadow apply to the composite, not per triangle.
  const layer = document.createElement("canvas");
  layer.width = ctx.canvas.width;
  layer.height = ctx.canvas.height;
  const lctx = layer.getContext("2d");
  if (!lctx) return;

  // The layer matches the canvas backing store 1:1 and every coordinate below
  // is in canvas pixel space — no additional DPR scaling applies here.
  lctx.setTransform(1, 0, 0, 1, 0, 0);

  const seam = 0.4;
  for (const [i0, i1, i2] of triangles) {
    const s0 = srcPts[i0], s1 = srcPts[i1], s2 = srcPts[i2];
    const [d0, d1, d2] = expandTriangle(dstPts[i0], dstPts[i1], dstPts[i2], seam);

    // affine mapping source triangle → destination triangle
    const x1 = s1.x - s0.x, y1 = s1.y - s0.y;
    const x2 = s2.x - s0.x, y2 = s2.y - s0.y;
    const det = x1 * y2 - x2 * y1;
    if (Math.abs(det) < 1e-9) continue;
    const u1 = d1.x - d0.x, v1 = d1.y - d0.y;
    const u2 = d2.x - d0.x, v2 = d2.y - d0.y;
    const a = (u1 * y2 - u2 * y1) / det;
    const b = (v1 * y2 - v2 * y1) / det;
    const c = (u2 * x1 - u1 * x2) / det;
    const d = (v2 * x1 - v1 * x2) / det;
    const e = d0.x - a * s0.x - c * s0.y;
    const f = d0.y - b * s0.x - d * s0.y;

    lctx.save();
    lctx.beginPath();
    lctx.moveTo(d0.x, d0.y);
    lctx.lineTo(d1.x, d1.y);
    lctx.lineTo(d2.x, d2.y);
    lctx.closePath();
    lctx.clip();
    lctx.transform(a, b, c, d, e, f);
    lctx.drawImage(image, 0, 0);
    lctx.restore();
  }

  // Composite: soft shadow (silhouette blur) beneath the garment, then the
  // garment itself at the requested opacity.
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (shadowBlur > 0 && shadowAlpha > 0) {
    try {
      ctx.globalAlpha = shadowAlpha;
      ctx.filter = `blur(${Math.round(shadowBlur)}px) brightness(0)`;
      ctx.drawImage(layer, 4, 7);
      ctx.filter = "none";
    } catch {
      // canvas filter unsupported — skip shadow gracefully
    }
    ctx.globalAlpha = 1;
  }
  ctx.globalAlpha = opacity;
  ctx.drawImage(layer, 0, 0);
  ctx.restore();
}

/** Draw the detected skeleton overlay for the debug view. */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  body: {
    leftShoulder: { x: number; y: number };
    rightShoulder: { x: number; y: number };
    leftElbow: { x: number; y: number };
    rightElbow: { x: number; y: number };
    leftWrist: { x: number; y: number };
    rightWrist: { x: number; y: number };
    leftHip: { x: number; y: number };
    rightHip: { x: number; y: number };
  }
): void {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const P = (p: { x: number; y: number }) => ({ x: p.x * w, y: p.y * h });

  const bones: Array<[keyof typeof body, keyof typeof body]> = [
    ["leftShoulder", "rightShoulder"],
    ["leftShoulder", "leftElbow"],
    ["leftElbow", "leftWrist"],
    ["rightShoulder", "rightElbow"],
    ["rightElbow", "rightWrist"],
    ["leftShoulder", "leftHip"],
    ["rightShoulder", "rightHip"],
    ["leftHip", "rightHip"],
  ];

  ctx.save();
  ctx.strokeStyle = "rgba(201, 242, 77, 0.9)";
  ctx.lineWidth = 2;
  for (const [a, b] of bones) {
    const pa = P(body[a]);
    const pb = P(body[b]);
    ctx.beginPath();
    ctx.moveTo(pa.x, pa.y);
    ctx.lineTo(pb.x, pb.y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(201, 242, 77, 1)";
  for (const key of Object.keys(body) as Array<keyof typeof body>) {
    const p = P(body[key]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

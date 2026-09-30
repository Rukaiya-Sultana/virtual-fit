// Small 2D geometry helpers shared by the fitting engine.

export interface Vec {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec): number => Math.hypot(a.x, a.y);

export function normalize(a: Vec): Vec {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

export function lerpVec(a: Vec, b: Vec, t: number): Vec {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Perpendicular of v, rotated so it points "downward" (positive y preference). */
export function perpDown(v: Vec): Vec {
  const p = { x: -v.y, y: v.x };
  return p.y >= 0 ? p : { x: -p.x, y: -p.y };
}

/** Rotate point p around origin by deg degrees (clockwise in screen space). */
export function rotateAround(p: Vec, origin: Vec, deg: number): Vec {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const d = sub(p, origin);
  return {
    x: origin.x + d.x * c - d.y * s,
    y: origin.y + d.x * s + d.y * c,
  };
}

export interface Quad {
  tl: Vec;
  tr: Vec;
  br: Vec;
  bl: Vec;
}

/** Bilinear interpolation on a quad. u: 0=left 1=right, v: 0=top 1=bottom. */
export function quadPoint(q: Quad, u: number, v: number): Vec {
  const top = lerpVec(q.tl, q.tr, u);
  const bottom = lerpVec(q.bl, q.br, u);
  return lerpVec(top, bottom, v);
}

/**
 * Affine transform mapping triangle (s0,s1,s2) onto (d0,d1,d2).
 * Returns [a,b,c,d,e,f] for ctx.transform / matrix composition:
 *   [x'] = [a c e][x]
 *   [y']   [b d f][y]
 */
export function affineFromTriangles(
  s0: Vec, s1: Vec, s2: Vec,
  d0: Vec, d1: Vec, d2: Vec
): [number, number, number, number, number, number] | null {
  const x1 = s1.x - s0.x, y1 = s1.y - s0.y;
  const x2 = s2.x - s0.x, y2 = s2.y - s0.y;
  const det = x1 * y2 - x2 * y1;
  if (Math.abs(det) < 1e-9) return null;
  const u1 = d1.x - d0.x, v1 = d1.y - d0.y;
  const u2 = d2.x - d0.x, v2 = d2.y - d0.y;
  const a = (u1 * y2 - u2 * y1) / det;
  const b = (v1 * y2 - v2 * y1) / det;
  const c = (u2 * x1 - u1 * x2) / det;
  const d = (v2 * x1 - v1 * x2) / det;
  const e = d0.x - a * s0.x - c * s0.y;
  const f = d0.y - b * s0.x - d * s0.y;
  return [a, b, c, d, e, f];
}

export function applyAffine(
  m: [number, number, number, number, number, number],
  p: Vec
): Vec {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

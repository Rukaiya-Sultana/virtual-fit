"use client";

// Client-side garment image loading with caching.

const cache = new Map<string, HTMLImageElement>();
const pending = new Map<string, Promise<HTMLImageElement>>();

export function loadGarmentImage(assetPath: string): Promise<HTMLImageElement> {
  const hit = cache.get(assetPath);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(assetPath);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        cache.set(assetPath, img);
        pending.delete(assetPath);
        resolve(img);
      };
      img.onerror = () => {
        pending.delete(assetPath);
        reject(new Error(`Failed to load garment asset: ${assetPath}`));
      };
      img.src = `/api/assets/${assetPath}`;
    });
    pending.set(assetPath, p);
  }
  return p;
}

export function getCachedGarmentImage(assetPath: string): HTMLImageElement | undefined {
  return cache.get(assetPath);
}

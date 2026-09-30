// One-time import for a pre-existing JSON catalog. Safe to rerun; product IDs stay unchanged.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// Load .env manually (this script runs outside Next.js).
try {
  const env = await readFile(".env", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  /* no .env - fine */
}

const root = path.resolve(process.env.STORAGE_ROOT?.trim() || "./.storage");
const prisma = new PrismaClient();
const raw = JSON.parse(await readFile(path.join(root, "catalog", "catalog.json"), "utf8"));

for (const g of raw.garments ?? []) {
  const category = await prisma.category.upsert({ where: { name: g.category }, create: { name: g.category }, update: {} });
  const data = {
    name: g.name, description: g.description ?? null, price: g.price ?? 0, stock: 100, categoryId: category.id,
    color: g.color, colorHex: g.colorHex, fit: g.fit, sleeve: g.sleeve, styleJson: JSON.stringify(g.style), occasionsJson: JSON.stringify(g.occasions), formality: g.formality, lengthFactor: g.lengthFactor,
    assetPath: g.assetPath, originalPath: g.originalPath, thumbnailPath: g.thumbnailPath,
    leftShoulderX: g.anchors.leftShoulder.x, leftShoulderY: g.anchors.leftShoulder.y, rightShoulderX: g.anchors.rightShoulder.x, rightShoulderY: g.anchors.rightShoulder.y,
    leftHemX: g.anchors.leftHem.x, leftHemY: g.anchors.leftHem.y, rightHemX: g.anchors.rightHem.x, rightHemY: g.anchors.rightHem.y,
    width: g.width, height: g.height, sizesJson: g.sizes ? JSON.stringify(g.sizes) : null, badge: g.badge ?? null,
  };
  await prisma.product.upsert({ where: { id: g.id }, create: { id: g.id, ...data, createdAt: new Date(g.createdAt) }, update: data });
}
await prisma.$disconnect();
console.log(`Imported ${(raw.garments ?? []).length} catalog products into the database.`);

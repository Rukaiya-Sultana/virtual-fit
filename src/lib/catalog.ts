import { z } from "zod";
import type { Garment } from "@/types";
import { prisma } from "@/lib/prisma";

export const GarmentAnchorsSchema = z.object({
  leftShoulder: z.object({ x: z.number().min(-0.2).max(1.2), y: z.number().min(-0.2).max(1.2) }),
  rightShoulder: z.object({ x: z.number().min(-0.2).max(1.2), y: z.number().min(-0.2).max(1.2) }),
  leftHem: z.object({ x: z.number().min(-0.2).max(1.2), y: z.number().min(-0.2).max(1.2) }),
  rightHem: z.object({ x: z.number().min(-0.2).max(1.2), y: z.number().min(-0.2).max(1.2) }),
});

export const GarmentSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase slug").max(64),
  name: z.string().min(1).max(80), category: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase category slug").max(40),
  color: z.string().min(1).max(40), colorHex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  fit: z.enum(["slim", "regular", "oversized"]), sleeve: z.enum(["short", "long", "none"]),
  style: z.array(z.string().min(1).max(30)).max(8), formality: z.number().int().min(1).max(5), occasions: z.array(z.string().min(1).max(40)).max(10),
  lengthFactor: z.number().min(0.5).max(2.5), assetPath: z.string().min(1), originalPath: z.string().min(1), thumbnailPath: z.string().min(1), anchors: GarmentAnchorsSchema,
  width: z.number().int().positive().max(6000), height: z.number().int().positive().max(6000), createdAt: z.string(),
  price: z.number().min(0).max(100000).optional(), description: z.string().max(1000).optional(), sizes: z.array(z.string().min(1).max(8)).max(12).optional(), badge: z.string().max(20).optional(),
  stock: z.number().int().min(0).max(1000000).optional(),
});

function parseList(value: string | null) { try { return value ? JSON.parse(value) : undefined; } catch { return undefined; } }
function toGarment(p: Awaited<ReturnType<typeof prisma.product.findFirst>> & { category: { name: string } }): Garment {
  return {
    id: p.id, name: p.name, category: p.category.name as Garment["category"], color: p.color, colorHex: p.colorHex, fit: p.fit as Garment["fit"], sleeve: p.sleeve as Garment["sleeve"],
    style: parseList(p.styleJson) ?? [], formality: p.formality, occasions: parseList(p.occasionsJson) ?? [], lengthFactor: p.lengthFactor,
    assetPath: p.assetPath, originalPath: p.originalPath, thumbnailPath: p.thumbnailPath,
    anchors: { leftShoulder: { x: p.leftShoulderX, y: p.leftShoulderY }, rightShoulder: { x: p.rightShoulderX, y: p.rightShoulderY }, leftHem: { x: p.leftHemX, y: p.leftHemY }, rightHem: { x: p.rightHemX, y: p.rightHemY } },
    width: p.width, height: p.height, createdAt: p.createdAt.toISOString(), price: p.price, description: p.description ?? undefined, sizes: parseList(p.sizesJson), badge: p.badge ?? undefined, stock: p.stock,
  };
}

export async function listGarments(): Promise<Garment[]> {
  const products = await prisma.product.findMany({ include: { category: true }, orderBy: { name: "asc" } });
  return products.map(toGarment);
}
export async function getGarment(id: string): Promise<Garment | null> {
  const product = await prisma.product.findUnique({ where: { id }, include: { category: true } });
  return product ? toGarment(product) : null;
}
export async function upsertGarment(input: Garment): Promise<void> {
  const garment = GarmentSchema.parse(input);
  const category = await prisma.category.upsert({ where: { name: garment.category }, create: { name: garment.category }, update: {} });
  const data = { name: garment.name, description: garment.description ?? null, price: garment.price ?? 0, stock: garment.stock ?? 100, categoryId: category.id, color: garment.color, colorHex: garment.colorHex, fit: garment.fit, sleeve: garment.sleeve, styleJson: JSON.stringify(garment.style), occasionsJson: JSON.stringify(garment.occasions), formality: garment.formality, lengthFactor: garment.lengthFactor, assetPath: garment.assetPath, originalPath: garment.originalPath, thumbnailPath: garment.thumbnailPath, leftShoulderX: garment.anchors.leftShoulder.x, leftShoulderY: garment.anchors.leftShoulder.y, rightShoulderX: garment.anchors.rightShoulder.x, rightShoulderY: garment.anchors.rightShoulder.y, leftHemX: garment.anchors.leftHem.x, leftHemY: garment.anchors.leftHem.y, rightHemX: garment.anchors.rightHem.x, rightHemY: garment.anchors.rightHem.y, width: garment.width, height: garment.height, sizesJson: garment.sizes ? JSON.stringify(garment.sizes) : null, badge: garment.badge ?? null };
  await prisma.product.upsert({ where: { id: garment.id }, create: { id: garment.id, ...data, createdAt: new Date(garment.createdAt) }, update: data });
}
export async function removeGarment(id: string): Promise<Garment | null> {
  const existing = await getGarment(id); if (!existing) return null;
  await prisma.product.delete({ where: { id } }); return existing;
}

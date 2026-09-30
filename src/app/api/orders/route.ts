import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";
import { rateLimit, clientKey } from "@/lib/rate-limit";

const schema = z.object({ items: z.array(z.object({ garmentId: z.string().min(1).max(64), size: z.string().min(1).max(8), qty: z.number().int().min(1).max(10) })).min(1).max(20) });
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Please log in before checking out." }, { status: 401 });
  const rl = rateLimit(clientKey(req, "order"), 10); if (!rl.ok) return NextResponse.json({ error: "Too many orders. Try again shortly." }, { status: 429 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Your cart contains invalid items." }, { status: 400 });
  const ids = [...new Set(parsed.data.items.map((item) => item.garmentId))];
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  const productById = new Map(products.map((product) => [product.id, product]));
  const items = [] as Array<{ productId: string; quantity: number; size: string; price: number }>;
  for (const item of parsed.data.items) {
    const product = productById.get(item.garmentId);
    if (!product) return NextResponse.json({ error: `Unknown product: ${item.garmentId}` }, { status: 422 });
    const sizes = product.sizesJson ? JSON.parse(product.sizesJson) as string[] : [];
    if (sizes.length && !sizes.includes(item.size)) return NextResponse.json({ error: `Size ${item.size} is not available for ${product.name}.` }, { status: 422 });
    if (product.stock < item.qty) return NextResponse.json({ error: `${product.name} does not have enough stock.` }, { status: 422 });
    items.push({ productId: product.id, quantity: item.qty, size: item.size, price: product.price });
  }
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const order = await prisma.$transaction(async (tx) => {
    for (const item of items) {
      const update = await tx.product.updateMany({ where: { id: item.productId, stock: { gte: item.quantity } }, data: { stock: { decrement: item.quantity } } });
      if (update.count !== 1) throw new Error("STOCK_CHANGED");
    }
    return tx.order.create({ data: { userId: user.id, total, items: { create: items } } });
  }).catch((error) => error instanceof Error && error.message === "STOCK_CHANGED" ? null : Promise.reject(error));
  if (!order) return NextResponse.json({ error: "Stock changed while placing your order. Please try again." }, { status: 409 });
  return NextResponse.json({ ok: true, orderId: order.id, subtotal: order.total });
}

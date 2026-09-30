import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/auth";
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await currentUser(); if (!user) return NextResponse.json({ error: "Please log in to view orders." }, { status: 401 });
  const order = await prisma.order.findFirst({ where: { id: params.id, userId: user.id }, include: { items: { include: { product: true } }, user: { select: { name: true } } } });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  return NextResponse.json({ order: { id: order.id, createdAt: order.createdAt, status: order.status, name: order.user.name, items: order.items.map((item) => ({ garmentId: item.productId, name: item.product.name, size: item.size, qty: item.quantity, unitPrice: item.price })), subtotal: order.total, currency: "USD" } });
}

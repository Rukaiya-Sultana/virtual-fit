import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/admin-auth";

// Deleting a user also deletes their orders (order items cascade on order delete).
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: params.id }, select: { id: true, _count: { select: { orders: true } } } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  const { count } = await prisma.order.deleteMany({ where: { userId: params.id } });
  await prisma.user.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true, deletedOrders: count });
}

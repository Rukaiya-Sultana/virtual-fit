import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/admin-auth";
const statuses = ["PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"] as const;
const schema = z.object({ status: z.enum(statuses) });
export async function PATCH(req: Request, { params }: { params: { id: string } }) { if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const parsed = schema.safeParse(await req.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ error: "Invalid order status." }, { status: 400 }); const order = await prisma.order.findUnique({ where: { id: params.id } }); if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 }); if (order.status === "DELIVERED" || order.status === "CANCELLED") return NextResponse.json({ error: "A delivered or cancelled order cannot be changed." }, { status: 409 }); return NextResponse.json({ order: await prisma.order.update({ where: { id: params.id }, data: { status: parsed.data.status } }) }); }
export async function DELETE(_req: Request, { params }: { params: { id: string } }) { if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const order = await prisma.order.findUnique({ where: { id: params.id } }); if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 }); await prisma.order.delete({ where: { id: params.id } }); return NextResponse.json({ ok: true }); }

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminRequest } from "@/lib/admin-auth";
export async function GET() { if (!(await isAdminRequest())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const orders = await prisma.order.findMany({ include: { user: { select: { name: true, email: true } }, items: { include: { product: { select: { name: true } } } } }, orderBy: { createdAt: "desc" } }); return NextResponse.json({ orders }); }

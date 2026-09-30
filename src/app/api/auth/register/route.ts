import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_COOKIE, customerCookieOptions, issueCustomerSession } from "@/lib/auth";

const schema = z.object({ name: z.string().trim().min(2, "Name must be at least 2 characters.").max(80), email: z.string().trim().email("Enter a valid email address.").max(120), password: z.string().min(8, "Password must be at least 8 characters.").max(100) });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid registration details." }, { status: 400 });
  const email = parsed.data.email.toLowerCase();
  if (await prisma.user.findUnique({ where: { email } })) return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
  const user = await prisma.user.create({ data: { name: parsed.data.name, email, passwordHash: await bcrypt.hash(parsed.data.password, 12) } });
  const session = issueCustomerSession(user);
  if (!session) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  const res = NextResponse.json({ user: { name: user.name, email: user.email, role: user.role } }, { status: 201 });
  res.cookies.set(CUSTOMER_COOKIE, session, customerCookieOptions(req)); return res;
}

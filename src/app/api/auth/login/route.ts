import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { CUSTOMER_COOKIE, customerCookieOptions, issueCustomerSession } from "@/lib/auth";

const schema = z.object({ email: z.string().trim().email("Enter a valid email address.").max(120), password: z.string().min(1, "Enter your password.").max(100) });
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid login details." }, { status: 400 });
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return NextResponse.json({ error: "Email or password is incorrect." }, { status: 401 });
  const session = issueCustomerSession(user); if (!session) return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  const res = NextResponse.json({ user: { name: user.name, email: user.email, role: user.role } }); res.cookies.set(CUSTOMER_COOKIE, session, customerCookieOptions(req)); return res;
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPassword, issueCookieValue, ADMIN_COOKIE } from "@/lib/admin-auth";
import { requestIsSecure } from "@/lib/auth";
import { requireAdminPassword } from "@/lib/config";
import { rateLimit, clientKey } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const BodySchema = z.object({ password: z.string().min(1).max(200) });

export async function POST(req: Request) {
  const rl = rateLimit(clientKey(req, "admin-login"), 8);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }

  try {
    requireAdminPassword();
  } catch {
    return NextResponse.json(
      { error: "Admin is not configured. Set ADMIN_PASSWORD (min 8 chars) in the environment." },
      { status: 503 }
    );
  }

  let body;
  try {
    body = BodySchema.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  if (!verifyPassword(body.data.password)) {
    // Constant-ish delay to blunt brute force.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  const value = issueCookieValue();
  if (!value) return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE.name, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: requestIsSecure(req),
    maxAge: ADMIN_COOKIE.maxAge,
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE.name, "", { maxAge: 0, path: "/" });
  return res;
}

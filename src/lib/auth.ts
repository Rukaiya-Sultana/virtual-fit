import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

export const CUSTOMER_COOKIE = "vf_customer";
const MAX_AGE = 60 * 60 * 24 * 14;

function secret() {
  return process.env.AUTH_SECRET?.trim() || process.env.ADMIN_PASSWORD?.trim() || null;
}

function sign(value: string) {
  const key = secret();
  return key ? createHmac("sha256", key).update(value).digest("base64url") : null;
}

export function issueCustomerSession(user: { id: string; role: string }) {
  const payload = Buffer.from(JSON.stringify({ id: user.id, role: user.role, exp: Date.now() + MAX_AGE * 1000 })).toString("base64url");
  const signature = sign(payload);
  return signature ? `${payload}.${signature}` : null;
}

export async function currentUser() {
  const value = cookies().get(CUSTOMER_COOKIE)?.value;
  if (!value) return null;
  const [payload, signature] = value.split(".");
  const expected = payload && sign(payload);
  if (!payload || !signature || !expected || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString()) as { id: string; exp: number };
    if (!session.id || session.exp < Date.now()) return null;
    return await prisma.user.findUnique({ where: { id: session.id }, select: { id: true, name: true, email: true, role: true, createdAt: true } });
  } catch { return null; }
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("FORBIDDEN");
  return user;
}

/**
 * True when the request arrived over HTTPS (directly or behind a proxy that
 * sets x-forwarded-proto, e.g. Dokploy/Traefik/nginx). Secure cookies are
 * silently dropped by browsers on plain HTTP, which breaks login - so the
 * flag must follow the actual request protocol, not NODE_ENV.
 */
export function requestIsSecure(req: Request): boolean {
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  try {
    return new URL(req.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function customerCookieOptions(req: Request) {
  return {
    httpOnly: true, sameSite: "lax" as const, secure: requestIsSecure(req), maxAge: MAX_AGE, path: "/",
  };
}

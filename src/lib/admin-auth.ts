import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { currentUser } from "./auth";

// Minimal admin auth: a signed cookie derived from ADMIN_PASSWORD.
// The password itself is never stored in the cookie; the HMAC signature makes
// forgery impractical without the secret. Suitable for a single-admin VPS app.

const COOKIE_NAME = "vf_admin";
const MAX_AGE_SEC = 60 * 60 * 8;

function signature(password: string): string {
  return createHmac("sha256", `vf-admin-v1:${password}`).update("admin").digest("hex");
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected || expected.length < 8) return false;
  const a = Buffer.from(password);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function issueCookieValue(): string | null {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return null;
  return signature(expected);
}

export async function isAdminRequest(): Promise<boolean> {
  const user = await currentUser();
  if (user?.role === "ADMIN") return true;
  const jar = cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return false;
  const expected = issueCookieValue();
  if (!expected) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const ADMIN_COOKIE = {
  name: COOKIE_NAME,
  maxAge: MAX_AGE_SEC,
};

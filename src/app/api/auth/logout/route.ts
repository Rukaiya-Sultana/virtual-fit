import { NextResponse } from "next/server";
import { CUSTOMER_COOKIE, customerCookieOptions } from "@/lib/auth";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(CUSTOMER_COOKIE, "", { ...customerCookieOptions(req), maxAge: 0 });
  return res;
}

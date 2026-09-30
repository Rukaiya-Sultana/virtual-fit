import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { SiteFooter } from "@/components/shop/SiteHeader";
export default async function AccountPage() { const user = await currentUser(); if (!user) redirect("/login?next=/account"); return <div className="flex-1 flex flex-col"><main className="flex-1 mx-auto w-full max-w-3xl px-4 py-12"><p className="text-xs uppercase tracking-widest text-accent">Account</p><h1 className="mt-2 text-3xl font-semibold text-white">Hello, {user.name}</h1><p className="mt-2 text-zinc-500">{user.email}</p><Link href="/account/orders" className="focus-ring inline-block mt-8 rounded-lg bg-accent px-5 py-3 text-sm font-semibold text-zinc-950">View my orders</Link></main><SiteFooter /></div>; }

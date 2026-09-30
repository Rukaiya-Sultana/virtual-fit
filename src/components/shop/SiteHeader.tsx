"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { useCart } from "./CartProvider";

export function SiteHeader({ dark }: { dark?: boolean }) {
  const { count, setOpen } = useCart();
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<{ name: string } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((data) => setUser(data.user)).catch(() => setUser(null)); }, [pathname]);
  useEffect(() => { setMenuOpen(false); }, [pathname]);
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); setMenuOpen(false); router.push("/"); router.refresh(); };

  const links: Array<{ href: string; label: string }> = [
    { href: "/", label: "Shop" },
    { href: "/tryon", label: "Fitting Room" },
  ];

  const accountLinks = user ? (
    <>
      <Link href="/account" className="focus-ring rounded-md px-3 py-2 text-zinc-300 hover:text-white">Account</Link>
      <button onClick={logout} className="focus-ring rounded-md px-3 py-2 text-xs text-zinc-500 hover:text-zinc-200">Logout</button>
    </>
  ) : (
    <>
      <Link href="/login" className="focus-ring rounded-md px-3 py-2 text-zinc-300 hover:text-white">Login</Link>
      <Link href="/register" className="focus-ring rounded-md px-3 py-2 text-xs text-zinc-500 hover:text-zinc-200">Register</Link>
    </>
  );

  return (
    <header className="border-b border-line shrink-0 sticky top-0 z-40 bg-surface/90 backdrop-blur">
      <div className="mx-auto max-w-6xl px-4 md:px-6 h-16 flex items-center justify-between gap-3">
        <Link href="/" className="focus-ring flex items-center gap-2.5 rounded-md min-w-0">
          <span className="w-2.5 h-2.5 rounded-full bg-accent shrink-0" aria-hidden />
          <span className="font-semibold tracking-[0.22em] text-sm uppercase whitespace-nowrap">
            Virtual&nbsp;Fit
          </span>
          <span className="hidden lg:inline text-[10px] uppercase tracking-widest text-zinc-600 border border-line rounded-full px-2 py-0.5">
            demo store
          </span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex items-center gap-1 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "focus-ring rounded-md px-3 py-2 transition-colors",
                pathname === l.href
                  ? "text-white"
                  : "text-zinc-400 hover:text-zinc-100"
              )}
            >
              {l.label}
            </Link>
          ))}
          {accountLinks}
          <CartButton count={count} onOpen={() => setOpen(true)} />
        </nav>

        {/* Mobile: cart + hamburger */}
        <div className="flex sm:hidden items-center gap-1.5">
          <CartButton count={count} onOpen={() => setOpen(true)} />
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            className="focus-ring rounded-md border border-line bg-surface-overlay p-2.5 hover:border-zinc-500 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="text-zinc-300">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <nav className="sm:hidden border-t border-line bg-surface px-4 py-3 space-y-1 text-sm" onClick={() => setMenuOpen(false)}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={clsx(
                "focus-ring block rounded-md px-3 py-2.5 transition-colors",
                pathname === l.href
                  ? "text-white bg-surface-overlay"
                  : "text-zinc-400 hover:text-zinc-100"
              )}
            >
              {l.label}
            </Link>
          ))}
          <div className="pt-2 mt-1 border-t border-line flex flex-wrap items-center gap-x-4 gap-y-1">
            {accountLinks}
          </div>
        </nav>
      )}
    </header>
  );
}

function CartButton({ count, onOpen }: { count: number; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      aria-label={`Open cart (${count} items)`}
      className="focus-ring relative rounded-md border border-line bg-surface-overlay px-3 py-2 hover:border-zinc-500 transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="text-zinc-300">
        <path d="M6 7h12l1.2 12.2a1.5 1.5 0 01-1.5 1.8H6.3a1.5 1.5 0 01-1.5-1.8L6 7z" strokeLinejoin="round" />
        <path d="M9 10V6a3 3 0 016 0v4" strokeLinecap="round" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-accent text-zinc-950 text-[10px] font-bold grid place-items-center">
          {count}
        </span>
      )}
    </button>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line mt-auto">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-zinc-500">
        <div>
          <span className="font-semibold tracking-[0.2em] uppercase text-zinc-400">
            Virtual Fit
          </span>
          <p className="mt-1.5 max-w-md leading-relaxed">
            Demo storefront for a university project. Checkout is simulated — no
            payment is processed and no real orders ship.
          </p>
        </div>
        <nav className="flex items-center gap-4">
          <Link href="/" className="focus-ring rounded hover:text-zinc-200">Shop</Link>
          <Link href="/tryon" className="focus-ring rounded hover:text-zinc-200">Fitting room</Link>
          <Link href="/admin" className="focus-ring rounded hover:text-zinc-200">Catalog admin</Link>
        </nav>
      </div>
    </footer>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteFooter } from "@/components/shop/SiteHeader";
import { useCart } from "@/components/shop/CartProvider";
import { formatPrice } from "@/lib/price";
import { Button, EmptyState, Spinner } from "@/components/ui";

const inputCls =
  "focus-ring w-full rounded-md bg-surface-overlay border border-line px-3 py-2.5 text-sm text-zinc-200 placeholder:text-zinc-600";

export default function CheckoutPage() {
  const { items, subtotal, count, clear } = useCart();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    address: "",
    city: "",
    country: "",
  });

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((data) => setAuthenticated(Boolean(data.user))).catch(() => setAuthenticated(false));
  }, []);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid =
    form.name.trim().length > 1 &&
    /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email) &&
    form.address.trim().length > 3 &&
    form.city.trim().length > 1 &&
    form.country.trim().length > 1;

  const placeOrder = async () => {
    if (!authenticated) { router.push("/login?next=/checkout"); return; }
    if (!valid || busy || items.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            garmentId: i.garmentId,
            size: i.size,
            qty: i.qty,
          })),
          customer: form,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Order failed");
      clear();
      router.push(`/order/${data.orderId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col">

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 md:px-6 py-10">
        <h1 className="text-2xl md:text-3xl font-semibold text-white">Checkout</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Demo checkout — no payment is processed, no card details are collected,
          nothing ships. The order is stored on this server to demonstrate the flow.
        </p>

        {items.length === 0 ? (
          <div className="mt-10 rounded-xl border border-line bg-surface-raised/60">
            <EmptyState title="Your cart is empty">
              Add something from the collection first.
            </EmptyState>
          </div>
        ) : (
          <div className="mt-8 grid md:grid-cols-[1.1fr_0.9fr] gap-8 items-start">
            {/* Form */}
            <section className="rounded-xl border border-line bg-surface-raised/60 p-6 space-y-4">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                Delivery details
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs text-zinc-500">Full name</span>
                  <input className={inputCls} value={form.name} onChange={set("name")} autoComplete="name" placeholder="Alex Doe" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs text-zinc-500">Email</span>
                  <input className={inputCls} value={form.email} onChange={set("email")} autoComplete="email" type="email" placeholder="alex@example.com" />
                </label>
                <label className="block sm:col-span-2">
                  <span className="mb-1.5 block text-xs text-zinc-500">Address</span>
                  <input className={inputCls} value={form.address} onChange={set("address")} autoComplete="street-address" placeholder="42 Sample Street" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-zinc-500">City</span>
                  <input className={inputCls} value={form.city} onChange={set("city")} autoComplete="address-level2" placeholder="Dhaka" />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-xs text-zinc-500">Country</span>
                  <input className={inputCls} value={form.country} onChange={set("country")} autoComplete="country-name" placeholder="Bangladesh" />
                </label>
              </div>

              <div className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-4 py-3 text-xs text-amber-300/90 leading-relaxed">
                This is a university demo. There is no payment step by design —
                placing the order simply records it so the confirmation flow can
                be demonstrated end to end.
              </div>

              {authenticated === false && (
                <p className="text-sm text-amber-300">Please log in to place this order. Your cart will remain here.</p>
              )}

              {error && (
                <p className="text-sm text-red-400" role="alert">{error}</p>
              )}

              <Button
                variant="accent"
                className="w-full py-3"
                disabled={!valid || busy || authenticated === null}
                onClick={placeOrder}
              >
                {busy ? <Spinner className="border-zinc-700 border-t-zinc-900" /> : `Place demo order · ${formatPrice(subtotal)}`}
              </Button>
            </section>

            {/* Summary */}
            <aside className="rounded-xl border border-line bg-surface-raised/60 p-6">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-4">
                Order summary · {count} item{count === 1 ? "" : "s"}
              </h2>
              <ul className="space-y-3">
                {items.map((i) => (
                  <li key={`${i.garmentId}:${i.size}`} className="flex gap-3 items-center">
                    <div className="w-10 h-12 rounded bg-surface grid place-items-center shrink-0 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/api/assets/${i.thumbnailPath}`} alt={i.name} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{i.name}</p>
                      <p className="text-xs text-zinc-500">Size {i.size} × {i.qty}</p>
                    </div>
                    <span className="text-sm text-zinc-300 tabular-nums">
                      {formatPrice(i.price * i.qty)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 pt-4 border-t border-line space-y-1.5 text-sm">
                <div className="flex justify-between text-zinc-400">
                  <span>Shipping</span>
                  <span className="text-accent">Free (forever)</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>Taxes</span>
                  <span>Waived (it&apos;s a demo)</span>
                </div>
                <div className="flex justify-between text-white font-semibold pt-1.5">
                  <span>Total</span>
                  <span className="tabular-nums">{formatPrice(subtotal)}</span>
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

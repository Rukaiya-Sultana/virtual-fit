"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiteFooter } from "@/components/shop/SiteHeader";
import { formatPrice } from "@/lib/price";
import { Spinner } from "@/components/ui";

interface OrderView {
  id: string;
  createdAt: string;
  status: string;
  name?: string;
  city?: string;
  items: Array<{ garmentId: string; name: string; size: string; qty: number; unitPrice: number }>;
  subtotal: number;
  currency: string;
}

export default function OrderPage({ params }: { params: { id: string } }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/orders/${encodeURIComponent(params.id)}`)
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Order not found");
        setOrder(d.order);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Order not found"));
  }, [params.id]);

  return (
    <div className="flex-1 flex flex-col">

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 md:px-6 py-12">
        {error && (
          <div className="rounded-xl border border-red-900/60 bg-red-950/20 p-8 text-center">
            <p className="text-lg font-medium text-red-300">{error}</p>
            <Link href="/" className="focus-ring inline-block mt-4 text-sm text-zinc-400 hover:text-white underline">
              Back to the shop
            </Link>
          </div>
        )}

        {!error && !order && (
          <div className="grid place-items-center py-24">
            <Spinner className="w-6 h-6" />
          </div>
        )}

        {order && (
          <div className="animate-fadein">
            <div className="text-center">
              <span className="inline-grid place-items-center w-14 h-14 rounded-full bg-accent/15 border border-accent/40 text-accent text-2xl">
                ✓
              </span>
              <h1 className="mt-5 text-3xl font-semibold text-white">
                Order confirmed
              </h1>
              <p className="mt-2.5 text-sm text-zinc-500">
                Thanks{order.name ? `, ${order.name}` : ""} — demo order
                <span className="text-zinc-300 font-medium"> {order.id} </span>
                was received{order.city ? ` for ${order.city}` : ""}. Nothing will
                ship, because nothing is real. That&apos;s the deal.
              </p>
            </div>

            <div className="mt-8 rounded-xl border border-line bg-surface-raised/60 overflow-hidden">
              <div className="px-6 py-4 border-b border-line flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                  Items
                </h2>
                <span className="text-[11px] uppercase tracking-wider text-accent">
                  {order.status}
                </span>
              </div>
              <ul className="divide-y divide-line">
                {order.items.map((i) => (
                  <li key={`${i.garmentId}:${i.size}`} className="px-6 py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={`/product/${i.garmentId}`} className="focus-ring rounded text-sm text-zinc-200 hover:text-white truncate block">
                        {i.name}
                      </Link>
                      <p className="text-xs text-zinc-500">Size {i.size} × {i.qty}</p>
                    </div>
                    <span className="text-sm text-zinc-300 tabular-nums shrink-0">
                      {formatPrice(i.unitPrice * i.qty)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="px-6 py-4 bg-surface-overlay/40 flex items-center justify-between">
                <span className="text-sm text-zinc-400">Total</span>
                <span className="text-lg font-semibold text-white tabular-nums">
                  {formatPrice(order.subtotal)}
                </span>
              </div>
            </div>

            <div className="mt-8 flex justify-center gap-3">
              <Link
                href="/"
                className="focus-ring rounded-lg bg-accent px-6 py-3 text-sm font-semibold text-zinc-950 hover:bg-accent-dim transition-colors"
              >
                Continue shopping
              </Link>
              <Link
                href="/tryon"
                className="focus-ring rounded-lg border border-line px-6 py-3 text-sm text-zinc-300 hover:border-zinc-500 transition-colors"
              >
                Back to the fitting room
              </Link>
            </div>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

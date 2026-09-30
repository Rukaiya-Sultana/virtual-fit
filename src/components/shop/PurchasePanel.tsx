"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui";
import { useCart } from "./CartProvider";
import { formatPrice } from "@/lib/price";
import type { Garment } from "@/types";

export function PurchasePanel({ garment }: { garment: Garment }) {
  const { addItem, setOpen } = useCart();
  const sizes = garment.sizes?.length ? garment.sizes : ["S", "M", "L", "XL"];
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const outOfStock = garment.stock === 0;

  const add = () => {
    if (outOfStock) return;
    if (!size) {
      setError("Choose a size first");
      return;
    }
    setError(null);
    addItem(garment, size, qty);
    setAdded(true);
    setOpen(true);
    setTimeout(() => setAdded(false), 1600);
  };

  return (
    <div className="space-y-6">
      {/* Sizes */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-wider text-zinc-500">Size</span>
          <span className="text-[11px] text-zinc-600">True to size</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {sizes.map((s) => (
            <button
              key={s}
              onClick={() => {
                setSize(s);
                setError(null);
              }}
              className={`focus-ring min-w-[46px] rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                size === s
                  ? "border-accent/70 bg-accent/15 text-accent"
                  : "border-line text-zinc-300 hover:border-zinc-500"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {/* Qty + price */}
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center rounded-md border border-line overflow-hidden">
          <button
            className="focus-ring px-3 py-2 text-sm text-zinc-400 hover:text-white"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
          >
            −
          </button>
          <span className="w-10 text-center text-sm tabular-nums text-zinc-200">{qty}</span>
          <button
            className="focus-ring px-3 py-2 text-sm text-zinc-400 hover:text-white"
            onClick={() => setQty((q) => Math.min(10, garment.stock ?? 10, q + 1))}
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>
        {garment.price !== undefined && (
          <p className="text-2xl font-semibold text-white tabular-nums">
            {formatPrice(garment.price * qty)}
          </p>
        )}
      </div>

      {/* CTAs */}
      <div className="grid gap-3">
        <Button variant="accent" className="w-full py-3" onClick={add} disabled={outOfStock}>
          {outOfStock ? "Out of stock" : added ? "Added to cart ✓" : "Add to cart"}
        </Button>
        <Link
          href={`/tryon?garment=${garment.id}`}
          className="focus-ring w-full rounded-lg border border-accent/50 bg-accent/5 text-accent px-6 py-3 text-center font-semibold hover:bg-accent/15 transition-colors"
        >
          Try it on virtually →
        </Link>
      </div>

      <ul className="space-y-1.5 text-xs text-zinc-500">
        <li>· Fitting room shows this exact garment on your body — in-browser, private</li>
        <li>· Free returns within 30 days (demo policy)</li>
        <li>· Ships in 24 h from the world's smallest warehouse</li>
      </ul>
    </div>
  );
}

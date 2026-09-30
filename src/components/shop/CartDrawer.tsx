"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCart } from "./CartProvider";
import { formatPrice } from "@/lib/price";
import { Button } from "@/components/ui";

export function CartDrawer() {
  const { items, subtotal, isOpen, setOpen, updateQty, removeItem, count } = useCart();
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [isOpen, setOpen]);

  useEffect(() => {
    setOpen(false);
    // Close the drawer on navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeof window !== "undefined" ? window.location.pathname : ""]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Shopping cart">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-surface-raised border-l border-line shadow-stage flex flex-col animate-fadein">
        <header className="flex items-center justify-between px-5 h-16 border-b border-line shrink-0">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
            Cart · {count}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} aria-label="Close cart">
            ✕
          </Button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-4 space-y-3">
          {items.length === 0 && (
            <div className="py-16 text-center">
              <p className="text-sm text-zinc-400">Your cart is empty.</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3"
                onClick={() => {
                  setOpen(false);
                  router.push("/");
                }}
              >
                Browse the collection →
              </Button>
            </div>
          )}
          {items.map((item) => (
            <div
              key={`${item.garmentId}:${item.size}`}
              className="flex gap-3 rounded-lg border border-line bg-surface-overlay/40 p-3"
            >
              <div className="w-14 h-16 rounded-md overflow-hidden bg-surface shrink-0 grid place-items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/assets/${item.thumbnailPath}`}
                  alt={item.name}
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-zinc-100 truncate">{item.name}</p>
                    <p className="text-xs text-zinc-500">Size {item.size}</p>
                  </div>
                  <p className="text-sm text-zinc-200 tabular-nums">
                    {formatPrice(item.price * item.qty)}
                  </p>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="inline-flex items-center rounded-md border border-line overflow-hidden">
                    <button
                      className="focus-ring px-2.5 py-1 text-sm text-zinc-400 hover:text-white"
                      onClick={() => updateQty(item.garmentId, item.size, item.qty - 1)}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-sm tabular-nums text-zinc-200">
                      {item.qty}
                    </span>
                    <button
                      className="focus-ring px-2.5 py-1 text-sm text-zinc-400 hover:text-white"
                      onClick={() => updateQty(item.garmentId, item.size, item.qty + 1)}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <button
                    className="focus-ring text-xs text-zinc-500 hover:text-red-300"
                    onClick={() => removeItem(item.garmentId, item.size)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <footer className="border-t border-line p-5 space-y-4 shrink-0">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-400">Subtotal</span>
              <span className="font-semibold text-white tabular-nums">
                {formatPrice(subtotal)}
              </span>
            </div>
            <p className="text-[11px] text-zinc-600">
              Demo checkout — taxes calculated at neither, shipping free forever.
            </p>
            <Button
              variant="accent"
              className="w-full"
              onClick={() => {
                setOpen(false);
                router.push("/checkout");
              }}
            >
              Checkout · {formatPrice(subtotal)}
            </Button>
          </footer>
        )}
      </aside>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import { formatPrice } from "@/lib/price";
import type { Garment } from "@/types";

const CATEGORY_LABEL: Record<string, string> = {
  tshirt: "T-Shirt",
  polo: "Polo",
  shirt: "Shirt",
  sweatshirt: "Sweatshirt",
  hoodie: "Hoodie",
  jacket: "Jacket",
};

export function ProductCard({ garment }: { garment: Garment }) {
  return (
    <article className="group relative">
      <Link
        href={`/product/${garment.id}`}
        className="focus-ring block rounded-xl border border-line bg-surface-raised/60 overflow-hidden hover:border-zinc-500 transition-colors"
      >
        <div
          className="relative aspect-[4/5] grid place-items-center p-6"
          style={{
            background:
              "radial-gradient(120% 90% at 50% 20%, rgba(255,255,255,0.055), transparent 60%)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/assets/${garment.thumbnailPath}`}
            alt={garment.name}
            loading="lazy"
            className="max-h-full max-w-full object-contain drop-shadow-[0_16px_24px_rgba(0,0,0,0.45)] transition-transform duration-300 group-hover:scale-[1.04]"
          />
          {garment.badge && (
            <span className="absolute top-3 left-3">
              <Badge tone={garment.badge === "new" ? "accent" : "default"}>
                {garment.badge}
              </Badge>
            </span>
          )}
          {garment.price !== undefined && (
            <span className="absolute top-3 right-3 text-xs font-medium text-zinc-300 tabular-nums rounded-md bg-black/50 border border-line px-2 py-1">
              {formatPrice(garment.price)}
            </span>
          )}
          {garment.stock === 0 && (
            <span className="absolute bottom-3 right-3 rounded-md border border-red-900/70 bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-red-300">Out of stock</span>
          )}
        </div>
        <div className="px-4 py-3.5 border-t border-line">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-medium text-zinc-100 truncate">{garment.name}</h3>
            <span
              className="w-2.5 h-2.5 rounded-full border border-zinc-600 shrink-0"
              style={{ backgroundColor: garment.colorHex }}
              aria-hidden
            />
          </div>
          <p className="mt-0.5 text-xs text-zinc-500">
            {CATEGORY_LABEL[garment.category] ?? garment.category} · {garment.color}
          </p>
        </div>
      </Link>

      <Link
        href={`/tryon?garment=${garment.id}`}
        className="focus-ring absolute bottom-[68px] left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity rounded-full bg-accent text-zinc-950 text-xs font-semibold px-4 py-2 shadow-stage hover:bg-accent-dim"
      >
        Try it on →
      </Link>
    </article>
  );
}

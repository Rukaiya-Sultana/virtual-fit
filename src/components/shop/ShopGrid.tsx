"use client";
import { useMemo, useState } from "react";
import { Chip, EmptyState } from "@/components/ui";
import { ProductCard } from "./ProductCard";
import type { Garment } from "@/types";

type SortKey = "featured" | "price-asc" | "price-desc" | "newest";
const labels: Record<string, string> = { all: "All", tshirt: "T-Shirts", polo: "Polos", shirt: "Shirts", sweatshirt: "Sweatshirts", hoodie: "Hoodies", jacket: "Jackets" };
export function ShopGrid({ garments }: { garments: Garment[] }) {
  const [category, setCategory] = useState("all"), [query, setQuery] = useState(""), [sort, setSort] = useState<SortKey>("featured"), [size, setSize] = useState("all"), [minPrice, setMinPrice] = useState(""), [maxPrice, setMaxPrice] = useState("");
  const categories = useMemo(() => ["all", ...[...new Set(garments.map((g) => g.category))].sort()], [garments]);
  const sizes = useMemo(() => [...new Set(garments.flatMap((g) => g.sizes ?? []))].sort(), [garments]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = garments.filter((g) => (category === "all" || g.category === category) && (size === "all" || (g.sizes ?? []).includes(size)) && (!minPrice || (g.price ?? 0) >= Number(minPrice)) && (!maxPrice || (g.price ?? 0) <= Number(maxPrice)) && (!q || [g.name, g.color, g.category, ...g.style, ...g.occasions].join(" ").toLowerCase().includes(q)));
    if (sort === "price-asc") return [...list].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    if (sort === "price-desc") return [...list].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    if (sort === "newest") return [...list].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return list;
  }, [garments, category, query, sort, size, minPrice, maxPrice]);
  const reset = () => { setCategory("all"); setQuery(""); setSort("featured"); setSize("all"); setMinPrice(""); setMaxPrice(""); };
  const field = "focus-ring rounded-md bg-surface-overlay border border-line px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600";
  return <div><div className="flex flex-col gap-3 mb-6"><div className="flex gap-1.5 overflow-x-auto slim-scroll pb-1">{categories.map((c) => <Chip key={c} active={category === c} onClick={() => setCategory(c)}>{labels[c] ?? c}</Chip>)}</div><div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2"><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" aria-label="Search products" className={`${field} col-span-2 sm:w-52`} /><select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort products" className={field}><option value="featured">Featured</option><option value="price-asc">Price: low to high</option><option value="price-desc">Price: high to low</option><option value="newest">Newest</option></select><select value={size} onChange={(e) => setSize(e.target.value)} aria-label="Filter by size" className={field}><option value="all">All sizes</option>{sizes.map((s) => <option key={s}>{s}</option>)}</select><input type="number" min="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="Min $" aria-label="Minimum price" className={field}/><input type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Max $" aria-label="Maximum price" className={field}/><button onClick={reset} className="focus-ring rounded-md px-3 py-2 text-xs text-zinc-400 hover:text-white">Clear filters</button></div></div>{filtered.length === 0 ? <EmptyState title="No products found">Try changing your search, size, category, or price filters.</EmptyState> : <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">{filtered.map((g) => <ProductCard key={g.id} garment={g} />)}</div>}</div>;
}

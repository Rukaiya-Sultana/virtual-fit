"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Badge, Chip, EmptyState, Spinner } from "@/components/ui";
import type { Garment, GarmentCategory } from "@/types";

const CATEGORY_LABELS: Record<GarmentCategory | "all", string> = {
  all: "All",
  tshirt: "T-Shirts",
  polo: "Polos",
  shirt: "Shirts",
  sweatshirt: "Sweatshirts",
  hoodie: "Hoodies",
  jacket: "Jackets",
};

export function CatalogPanel({
  garments,
  loading,
  error,
  reload,
  selectedId,
  onSelect,
  compareMode,
  compareSelection,
  onToggleCompare,
}: {
  garments: Garment[];
  loading: boolean;
  error: boolean;
  reload: () => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  compareMode: boolean;
  compareSelection: string[];
  onToggleCompare: (id: string) => void;
}) {
  const [category, setCategory] = useState<GarmentCategory | "all">("all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return garments.filter((g) => {
      if (category !== "all" && g.category !== category) return false;
      if (!q) return true;
      return (
        g.name.toLowerCase().includes(q) ||
        g.color.toLowerCase().includes(q) ||
        g.style.some((s) => s.includes(q)) ||
        g.category.includes(q)
      );
    });
  }, [garments, category, query]);

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div className="p-3 border-b border-line space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search color, style, name…"
          aria-label="Search garments"
          className="focus-ring w-full rounded-md bg-surface-overlay border border-line px-3 py-2 text-sm placeholder:text-zinc-600 text-zinc-200"
        />
        <div className="flex gap-1.5 overflow-x-auto slim-scroll pb-0.5">
          {(Object.keys(CATEGORY_LABELS) as Array<GarmentCategory | "all">).map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {CATEGORY_LABELS[c]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-3 space-y-2">
        {loading && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {error && !loading && (
          <EmptyState
            title="Couldn't load the catalog"
          >
            <Buttonlike onClick={reload} />
          </EmptyState>
        )}
        {!error && !loading && filtered.length === 0 && (
          <EmptyState title="No garments match">
            Try a different search or category.
          </EmptyState>
        )}
        {filtered.map((g) => {
          const selected = g.id === selectedId;
          const inCompare = compareSelection.includes(g.id);
          return (
            <button
              key={g.id}
              onClick={() => (compareMode ? onToggleCompare(g.id) : onSelect(g.id))}
              className={clsx(
                "focus-ring w-full text-left rounded-lg border p-2.5 flex gap-3 items-center transition-colors",
                selected
                  ? "border-accent/70 bg-accent/10"
                  : inCompare
                    ? "border-sky-700/70 bg-sky-950/20"
                    : "border-line bg-surface-overlay/40 hover:border-zinc-500"
              )}
            >
              <div className="w-14 h-16 rounded-md overflow-hidden bg-surface shrink-0 grid place-items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/assets/${g.thumbnailPath}`}
                  alt={g.name}
                  loading="lazy"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-zinc-100 truncate">{g.name}</p>
                <p className="text-xs text-zinc-500 truncate">
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full border border-zinc-600"
                      style={{ backgroundColor: g.colorHex }}
                      aria-hidden
                    />
                    {g.color} · {g.fit} fit · {g.sleeve} sleeve
                  </span>
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {g.style.slice(0, 2).map((s) => (
                    <Badge key={s}>{s}</Badge>
                  ))}
                </div>
              </div>
              {selected && (
                <span className="text-accent text-lg leading-none" aria-label="selected">
                  ●
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Buttonlike({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="focus-ring mt-2 rounded-md border border-line px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500"
    >
      Retry
    </button>
  );
}

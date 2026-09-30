"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui";
import type { BodyLandmarks, Garment } from "@/types";
import { StaticTryOn } from "./StaticTryOn";

function field(g: Garment) {
  return [
    ["Category", g.category],
    ["Color", g.color],
    ["Fit", g.fit],
    ["Sleeve", g.sleeve],
    ["Formality", `${"●".repeat(g.formality)}${"○".repeat(5 - g.formality)} (${g.formality}/5)`],
    ["Style", g.style.join(", ")],
    ["Occasions", g.occasions.join(", ")],
  ] as Array<[string, string]>;
}

function comparisonSummary(a: Garment, b: Garment): string {
  const diffs: string[] = [];
  if (a.formality !== b.formality) {
    const [formal, casual] = a.formality > b.formality ? [a, b] : [b, a];
    diffs.push(
      `The ${formal.name} reads more formal (${formal.formality}/5 vs ${casual.formality}/5) — driven by its ${formal.category} construction and ${formal.style.join("/")} styling.`
    );
  }
  if (a.sleeve !== b.sleeve) diffs.push(`Sleeves differ: ${a.sleeve} vs ${b.sleeve}.`);
  if (a.fit !== b.fit) diffs.push(`Fit differs: ${a.fit} vs ${b.fit}.`);
  const shared = a.occasions.filter((o) => b.occasions.includes(o));
  if (shared.length) diffs.push(`Both work for: ${shared.join(", ")}.`);
  return diffs.join(" ");
}

export function CompareModal({
  photo,
  landmarks,
  garments,
  onClose,
  onSelect,
}: {
  photo: HTMLImageElement;
  landmarks: BodyLandmarks;
  garments: Garment[];
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [a, b, c] = garments;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Compare garments"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="animate-fadein w-full max-w-5xl max-h-[92vh] overflow-y-auto slim-scroll rounded-2xl border border-line bg-surface-raised shadow-stage">
        <header className="flex items-center justify-between px-6 py-4 border-b border-line sticky top-0 bg-surface-raised z-10">
          <h2 className="text-sm font-semibold uppercase tracking-[0.22em] text-zinc-300">
            Compare · same body, same fit engine
          </h2>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
            ✕ Close
          </Button>
        </header>

        <div className="p-6 grid md:grid-cols-2 gap-6">
          {garments.map((g) => (
            <figure key={g.id} className="min-w-0">
              <div className="rounded-xl overflow-hidden border border-line bg-surface grid place-items-center">
                <StaticTryOn
                  photo={photo}
                  landmarks={landmarks}
                  garment={g}
                  className="max-h-[52vh] w-auto block"
                />
              </div>
              <figcaption className="mt-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-100 truncate">{g.name}</p>
                  <p className="text-xs text-zinc-500 truncate">
                    {g.color} · {g.fit} fit · {g.sleeve} sleeve
                  </p>
                </div>
                <Button size="sm" onClick={() => { onSelect(g.id); onClose(); }}>
                  Try this
                </Button>
              </figcaption>
            </figure>
          ))}
        </div>

        {c && (
          <p className="px-6 pb-2 text-xs text-zinc-500">
            Comparing three garments — metadata table below covers the first two.
          </p>
        )}

        {a && b && (
          <div className="px-6 pb-6">
            <div className="rounded-xl border border-line overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-overlay/60 text-left">
                    <th className="px-4 py-2.5 text-xs uppercase tracking-wider text-zinc-500 font-medium">
                      Attribute
                    </th>
                    <th className="px-4 py-2.5 text-xs uppercase tracking-wider text-zinc-300 font-medium">
                      {a.name}
                    </th>
                    <th className="px-4 py-2.5 text-xs uppercase tracking-wider text-zinc-300 font-medium">
                      {b.name}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {field(a).map(([label, va], i) => (
                    <tr key={label} className={i % 2 ? "bg-surface-overlay/20" : ""}>
                      <td className="px-4 py-2 text-xs text-zinc-500">{label}</td>
                      <td className="px-4 py-2 text-zinc-300">{va}</td>
                      <td className="px-4 py-2 text-zinc-300">{field(b)[i][1]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-zinc-400">
              <span className="text-zinc-200 font-medium">Reading: </span>
              {comparisonSummary(a, b)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

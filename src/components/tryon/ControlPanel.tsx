"use client";

import { Button, SliderRow } from "@/components/ui";
import type { Adjustments, FitType } from "@/types";
import { DEFAULT_ADJUSTMENTS } from "@/types";

const FITS: Array<{ id: FitType; label: string }> = [
  { id: "slim", label: "Slim" },
  { id: "regular", label: "Regular" },
  { id: "oversized", label: "Oversized" },
];

export function ControlPanel({
  adjustments,
  onChange,
  onReset,
  disabled,
}: {
  adjustments: Adjustments;
  onChange: (patch: Partial<Adjustments>) => void;
  onReset: () => void;
  disabled?: boolean;
}) {
  const set = (patch: Partial<Adjustments>) => onChange(patch);
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const deg = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}°`;
  const x100 = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;

  return (
    <div className={disabled ? "opacity-40 pointer-events-none" : undefined}>
      <div className="flex items-center gap-1.5 mb-4">
        {FITS.map((f) => (
          <button
            key={f.id}
            onClick={() => set({ fit: f.id, widthScale: 1, heightScale: 1 })}
            className={`focus-ring flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              adjustments.fit === f.id
                ? "border-accent/70 bg-accent/15 text-accent"
                : "border-line text-zinc-400 hover:border-zinc-500"
            }`}
          >
            {f.label}
          </button>
        ))}
        <Button variant="ghost" size="sm" onClick={onReset} title="Reset all adjustments">
          Reset
        </Button>
      </div>

      <div className="space-y-3">
        <SliderRow
          label="Width"
          value={adjustments.widthScale}
          display={pct(adjustments.widthScale)}
          min={0.5}
          max={1.8}
          step={0.01}
          onChange={(v) => set({ widthScale: v })}
          onReset={() => set({ widthScale: 1 })}
        />
        <SliderRow
          label="Height"
          value={adjustments.heightScale}
          display={pct(adjustments.heightScale)}
          min={0.5}
          max={1.8}
          step={0.01}
          onChange={(v) => set({ heightScale: v })}
          onReset={() => set({ heightScale: 1 })}
        />
        <SliderRow
          label="Horizontal"
          value={adjustments.offsetX}
          display={x100(adjustments.offsetX)}
          min={-0.25}
          max={0.25}
          step={0.005}
          onChange={(v) => set({ offsetX: v })}
          onReset={() => set({ offsetX: 0 })}
        />
        <SliderRow
          label="Vertical"
          value={adjustments.offsetY}
          display={x100(adjustments.offsetY)}
          min={-0.25}
          max={0.25}
          step={0.005}
          onChange={(v) => set({ offsetY: v })}
          onReset={() => set({ offsetY: 0 })}
        />
        <SliderRow
          label="Rotation"
          value={adjustments.rotationDeg}
          display={deg(adjustments.rotationDeg)}
          min={-30}
          max={30}
          step={0.5}
          onChange={(v) => set({ rotationDeg: v })}
          onReset={() => set({ rotationDeg: 0 })}
        />
        <SliderRow
          label="Sleeve length"
          value={adjustments.sleeveLength}
          display={pct(adjustments.sleeveLength)}
          min={0.7}
          max={1.4}
          step={0.01}
          onChange={(v) => set({ sleeveLength: v })}
          onReset={() => set({ sleeveLength: 1 })}
        />
        <SliderRow
          label="Opacity"
          value={adjustments.opacity}
          display={pct(adjustments.opacity)}
          min={0.1}
          max={1}
          step={0.01}
          onChange={(v) => set({ opacity: v })}
          onReset={() => set({ opacity: 1 })}
        />
      </div>

      <p className="mt-4 text-[11px] text-zinc-600 leading-relaxed">
        Drag the garment on the canvas to reposition it. Double-click a label to
        reset that control.
      </p>
    </div>
  );
}

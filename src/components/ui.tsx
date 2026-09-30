"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={clsx(
        "rounded-xl border border-line bg-surface-raised/60 flex flex-col min-h-0",
        className
      )}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 border-b border-line">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
            {title}
          </h2>
          {actions}
        </header>
      )}
      <div className={clsx("min-h-0 flex-1", bodyClassName)}>{children}</div>
    </section>
  );
}

export function Button({
  children,
  variant = "default",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "accent" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return (
    <button
      className={clsx(
        "focus-ring rounded-md font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none inline-flex items-center justify-center gap-1.5",
        size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm",
        variant === "default" &&
          "border border-line bg-surface-overlay text-zinc-200 hover:border-zinc-500",
        variant === "accent" && "bg-accent text-zinc-950 hover:bg-accent-dim",
        variant === "ghost" && "text-zinc-400 hover:text-white",
        variant === "danger" &&
          "border border-red-900/60 text-red-300 hover:bg-red-950/40",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Chip({
  active,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      className={clsx(
        "focus-ring rounded-full border px-3 py-1 text-xs transition-colors whitespace-nowrap",
        active
          ? "border-accent/70 bg-accent/15 text-accent"
          : "border-line text-zinc-400 hover:text-zinc-200 hover:border-zinc-500",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function SliderRow({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  onReset?: () => void;
}) {
  return (
    <div className="grid grid-cols-[92px_1fr_58px] items-center gap-3">
      <button
        type="button"
        onDoubleClick={onReset}
        title={onReset ? "Double-click label to reset" : undefined}
        className="text-left text-xs text-zinc-400 hover:text-zinc-200 truncate"
      >
        {label}
      </button>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
      <span className="text-right text-xs tabular-nums text-zinc-300">{display}</span>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={clsx(
        "inline-block w-4 h-4 rounded-full border-2 border-zinc-600 border-t-accent animate-spin",
        className
      )}
      aria-label="Loading"
      role="status"
    />
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "warn" }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
        tone === "default" && "bg-surface-overlay text-zinc-400",
        tone === "accent" && "bg-accent/15 text-accent",
        tone === "warn" && "bg-amber-500/15 text-amber-300"
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-6">
      {icon && <div className="mb-3 text-zinc-600">{icon}</div>}
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {children && <div className="mt-1 text-xs text-zinc-500 max-w-xs">{children}</div>}
    </div>
  );
}

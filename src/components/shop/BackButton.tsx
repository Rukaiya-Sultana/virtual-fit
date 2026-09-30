"use client";

import { useRouter } from "next/navigation";

/**
 * History-aware back button. Falls back to a real page when the current
 * tab has no history (e.g. opened a link directly).
 */
export function BackButton({ label = "Back", fallback = "/" }: { label?: string; fallback?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-overlay px-3 py-1.5 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white transition-colors"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {label}
    </button>
  );
}

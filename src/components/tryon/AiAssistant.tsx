"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui";
import type { Adjustments, Garment } from "@/types";
import type { AiResponse } from "@/lib/ai/schema";
import { applyCommands, type ApplyResult } from "@/lib/ai/apply";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  engine?: AiResponse["engine"];
  recommendations?: string[];
  appliedNote?: string;
}

const SUGGESTIONS = [
  "Make it slightly oversized",
  "Move it down a little",
  "Try the blue hoodie",
  "I need something casual for university",
  "Compare the white dress shirt and the denim jacket",
  "Why is the dress shirt more formal?",
];

function explainFromMetadata(g: Garment): string {
  const formality =
    g.formality >= 4 ? "formal" : g.formality === 3 ? "smart-casual" : "casual";
  return `${g.name} is a ${g.fit}-fit ${g.category} with ${g.sleeve} sleeves in ${g.color}. Catalog metadata styles it as ${g.style.join(", ")}, rates it ${g.formality}/5 on formality (${formality}), and lists it for: ${g.occasions.join(", ")}.`;
}

export function AiAssistant({
  garments,
  selectedId,
  adjustmentsRef,
  onApply,
  disabled,
}: {
  garments: Garment[];
  selectedId: string | null;
  adjustmentsRef: React.MutableRefObject<Adjustments>;
  onApply: (result: ApplyResult) => void;
  disabled?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Hi — I'm your fitting room assistant. Ask me to adjust the fit in plain language, recommend garments for an occasion, or compare two pieces. I work from catalog data only, never your photo.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [engineMode, setEngineMode] = useState<"llm+local" | "local" | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then((d) => setEngineMode(d?.ai ?? null))
      .catch(() => setEngineMode(null));
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || busy) return;
      setInput("");
      setBusy(true);
      const userMsg: ChatMessage = { role: "user", content: text };
      setMessages((m) => [...m, userMsg]);

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 25_000);
        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: text,
            history: historyRef.current.slice(-6).map((m) => ({
              role: m.role,
              content: m.content.slice(0, 300),
            })),
            currentGarmentId: selectedId,
          }),
        }).finally(() => clearTimeout(timer));

        if (!res.ok && res.status !== 429) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AiResponse & { limited?: boolean };

        const applied = applyCommands(data.commands ?? [], adjustmentsRef.current, selectedId ?? undefined);
        onApply(applied);

        let content = data.message;
        if (data.engine === "local" && applied.explainGarmentId) {
          const g = garments.find((x) => x.id === applied.explainGarmentId);
          if (g) content = explainFromMetadata(g);
        }

        const note = applied.humanSummary.length
          ? `Applied: ${applied.humanSummary.join("; ")}.`
          : undefined;

        const reply: ChatMessage = {
          role: "assistant",
          content,
          engine: data.engine,
          recommendations: applied.recommendIds,
          appliedNote: note,
        };
        historyRef.current = [...historyRef.current, userMsg, reply].slice(-12);
        setMessages((m) => [...m, reply]);
      } catch {
        const reply: ChatMessage = {
          role: "assistant",
          content:
            "The assistant is unavailable right now — but the fitting room, catalog and manual controls keep working.",
          engine: "local",
        };
        setMessages((m) => [...m, reply]);
      } finally {
        setBusy(false);
      }
    },
    [busy, selectedId, garments, onApply, adjustmentsRef]
  );

  return (
    <div className="flex flex-col min-h-0 h-full">
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto slim-scroll p-3 space-y-3"
        aria-live="polite"
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "flex justify-end"
                : "flex justify-start"
            }
          >
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-xl rounded-br-sm bg-accent text-zinc-950 px-3.5 py-2.5 text-sm"
                  : "max-w-[95%] rounded-xl rounded-bl-sm bg-surface-overlay border border-line px-3.5 py-2.5 text-sm text-zinc-300"
              }
            >
              <p className="leading-relaxed whitespace-pre-wrap">{m.content}</p>
              {m.appliedNote && (
                <p className="mt-1.5 text-[11px] text-zinc-500 border-t border-line pt-1.5">
                  {m.appliedNote}
                </p>
              )}
              {m.recommendations && m.recommendations.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.recommendations.map((id) => {
                    const g = garments.find((x) => x.id === id);
                    if (!g) return null;
                    return (
                      <button
                        key={id}
                        onClick={() => onApply(applyCommands(
                          [{ action: "select_garment", parameters: { garmentId: id } }],
                          adjustmentsRef.current,
                          selectedId ?? undefined
                        ))}
                        className="focus-ring flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/10 px-2.5 py-1 text-xs text-accent hover:bg-accent/20 transition-colors"
                      >
                        <span
                          className="w-2 h-2 rounded-full border border-zinc-600"
                          style={{ backgroundColor: g.colorHex }}
                          aria-hidden
                        />
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {m.role === "assistant" && m.engine && i > 0 && (
                <span className="mt-1.5 block text-[10px] uppercase tracking-wider text-zinc-600">
                  {m.engine === "openrouter" ? "LLM (OpenRouter)" : "Local rules engine"}
                </span>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-start">
            <div className="rounded-xl border border-line bg-surface-overlay px-4 py-3 flex items-center gap-1.5">
              <span className="thinking-dot" />
              <span className="thinking-dot [animation-delay:150ms]" />
              <span className="thinking-dot [animation-delay:300ms]" />
            </div>
          </div>
        )}
      </div>

      {messages.length <= 1 && !busy && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => void send(s)}
              disabled={disabled}
              className="focus-ring rounded-full border border-line px-3 py-1.5 text-[11px] text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="px-3 py-1.5 flex items-center justify-between gap-2 border-t border-line">
        <Badge tone={engineMode === "llm+local" ? "accent" : "default"}>
          {engineMode === "llm+local"
            ? "LLM + local fallback"
            : engineMode === "local"
              ? "Local rules engine"
              : "checking engine…"}
        </Badge>
        <span className="text-[10px] text-zinc-600 text-right truncate">catalog data only</span>
      </div>

      <form
        className="p-3 pt-2 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={disabled ? "Select a garment first…" : "e.g. make it tighter"}
          aria-label="Message the AI assistant"
          disabled={disabled || busy}
          maxLength={500}
          autoComplete="off"
          enterKeyHint="send"
          className="focus-ring flex-1 min-w-0 rounded-full bg-surface-overlay border border-line px-4 py-2.5 text-sm placeholder:text-zinc-600 text-zinc-200 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || busy || !input.trim()}
          aria-label="Send message"
          className="focus-ring shrink-0 grid place-items-center w-11 h-11 rounded-full bg-accent text-zinc-950 hover:bg-accent-dim transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </div>
  );
}

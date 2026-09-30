"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import Link from "next/link";
import { Badge, Button, Chip, Spinner } from "@/components/ui";
import { AdminCommercePanels } from "@/components/shop/AdminCommercePanels";
import type { Garment } from "@/types";

const ANCHOR_ORDER = ["Left shoulder", "Right shoulder", "Left hem", "Right hem"] as const;
type AnchorKey = "leftShoulder" | "rightShoulder" | "leftHem" | "rightHem";
const ANCHOR_KEYS: AnchorKey[] = ["leftShoulder", "rightShoulder", "leftHem", "rightHem"];

const DEFAULT_ANCHORS = {
  leftShoulder: { x: 0.25, y: 0.1 },
  rightShoulder: { x: 0.75, y: 0.1 },
  leftHem: { x: 0.2, y: 0.92 },
  rightHem: { x: 0.8, y: 0.92 },
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    fetch("/api/admin/session")
      .then((r) => r.json())
      .then((d) => setAuthed(Boolean(d.authenticated)))
      .catch(() => setAuthed(false));
  }, []);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoggingIn(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Login failed");
      setAuthed(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoggingIn(false);
    }
  };

  if (authed === null) {
    return (
      <div className="flex-1 grid place-items-center">
        <Spinner className="w-6 h-6" />
      </div>
    );
  }

  if (!authed) {
    return (
      <div className="flex-1 grid place-items-center px-4">
        <form
          onSubmit={login}
          className="w-full max-w-sm rounded-2xl border border-line bg-surface-raised p-8 shadow-stage"
        >
          <Link href="/" className="focus-ring inline-flex items-center gap-2 rounded-md text-xs text-zinc-500 hover:text-zinc-200 mb-6">
            ← Virtual Fit
          </Link>
          <h1 className="text-xl font-semibold text-white">Catalog admin</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            Manage garments, anchors and catalog metadata.
          </p>
          <label className="block mt-6 text-xs uppercase tracking-wider text-zinc-400" htmlFor="pw">
            Admin password
          </label>
          <input
            id="pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="focus-ring mt-2 w-full rounded-md bg-surface-overlay border border-line px-3 py-2.5 text-sm text-zinc-200"
            placeholder="••••••••••••"
          />
          {loginError && <p className="mt-2 text-sm text-red-400">{loginError}</p>}
          <Button type="submit" variant="accent" className="w-full mt-5" disabled={loggingIn || !password}>
            {loggingIn ? "Signing in…" : "Sign in"}
          </Button>
          <p className="mt-4 text-[11px] text-zinc-600 leading-relaxed">
            Set via the <code>ADMIN_PASSWORD</code> environment variable on the server.
            Never commit real credentials.
          </p>
        </form>
      </div>
    );
  }

  return <AdminApp onLogout={() => setAuthed(false)} />;
}

function AdminApp({ onLogout }: { onLogout: () => void }) {
  const [garments, setGarments] = useState<Garment[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    fetch("/api/garments")
      .then((r) => r.json())
      .then((d) => setGarments(d.garments ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(reload, [reload]);

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" }).catch(() => {});
    onLogout();
  };

  return (
    <div className="flex-1">
      <header className="border-b border-line">
        <div className="mx-auto max-w-5xl px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="focus-ring flex items-center gap-2 rounded-md">
              <span className="w-2 h-2 rounded-full bg-accent" aria-hidden />
              <span className="font-semibold tracking-[0.2em] text-xs uppercase">
                Virtual&nbsp;Fit · Admin
              </span>
            </Link>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link href="/tryon" className="focus-ring rounded-md px-3 py-1.5 text-xs text-zinc-400 hover:text-white">
              Studio
            </Link>
            <Button size="sm" variant="ghost" onClick={logout}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 md:px-6 py-8 space-y-8">
        <GarmentForm onSaved={reload} />
        <GarmentList garments={garments} loading={loading} onChanged={reload} />
        <AdminCommercePanels />
      </main>
    </div>
  );
}

// ── Add garment form with anchor editor ─────────────────────────────────────

function GarmentForm({ onSaved }: { onSaved: () => void }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("tshirt");
  const [categories, setCategories] = useState<string[]>([]);
  const [color, setColor] = useState("");
  const [colorHex, setColorHex] = useState("#888888");
  const [fit, setFit] = useState<"slim" | "regular" | "oversized">("regular");
  const [sleeve, setSleeve] = useState<"short" | "long" | "none">("short");
  const [styleText, setStyleText] = useState("casual");
  const [occasionsText, setOccasionsText] = useState("everyday");
  const [formality, setFormality] = useState(2);
  // Keep raw numeric text until submit so temporary input states can never become NaN.
  const [lengthFactor, setLengthFactor] = useState("0");
  const [price, setPrice] = useState("");
  const [description, setDescription] = useState("");
  const [sizesText, setSizesText] = useState("S, M, L, XL, XXL");
  const [badge, setBadge] = useState("");
  const [stock, setStock] = useState("100");

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // trimmed preview
  const [previewSize, setPreviewSize] = useState<{ w: number; h: number } | null>(null);
  const [anchors, setAnchors] = useState({ ...DEFAULT_ANCHORS });
  const [anchorStep, setAnchorStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const previewRef = useRef<HTMLImageElement>(null);

  const id = useMemo(() => slugify(name) || "unnamed-garment", [name]);

  useEffect(() => {
    const loadCategories = () => {
      fetch("/api/admin/categories")
        .then((r) => r.json())
        .then((data) => {
          const names = (data.categories ?? []).map((item: { name: string }) => item.name);
          setCategories(names);
          if (names.length && !names.includes(category)) setCategory(names[0]);
        })
        .catch(() => {});
    };
    loadCategories();
    window.addEventListener("vf-categories-changed", loadCategories);
    return () => window.removeEventListener("vf-categories-changed", loadCategories);
  }, [category]);

  const handleFile = useCallback(async (f: File | undefined | null) => {
    setMessage(null);
    if (!f) return;
    if (!["image/png", "image/webp"].includes(f.type)) {
      setMessage({ text: "Use a PNG or WebP with a transparent background.", error: true });
      return;
    }
    if (f.size > 12 * 1024 * 1024) {
      setMessage({ text: "Image exceeds 12 MB.", error: true });
      return;
    }
    try {
      const bitmap = await createImageBitmap(f);
      // Trim to alpha bounding box (mirrors server-side sharp trim).
      const c = document.createElement("canvas");
      c.width = bitmap.width;
      c.height = bitmap.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(bitmap, 0, 0);
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let minX = c.width, minY = c.height, maxX = -1, maxY = -1;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (data[(y * c.width + x) * 4 + 3] > 8) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX < 0) {
        setMessage({ text: "That image appears fully transparent.", error: true });
        return;
      }
      const pad = 2;
      minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
      maxX = Math.min(c.width - 1, maxX + pad); maxY = Math.min(c.height - 1, maxY + pad);
      const tw = maxX - minX + 1, th = maxY - minY + 1;
      const trimmed = document.createElement("canvas");
      trimmed.width = tw; trimmed.height = th;
      trimmed.getContext("2d")!.drawImage(c, minX, minY, tw, th, 0, 0, tw, th);
      setPreviewUrl(trimmed.toDataURL("image/png"));
      setPreviewSize({ w: tw, h: th });
      setFile(f);
      setAnchors({ ...DEFAULT_ANCHORS });
      setAnchorStep(0);
    } catch {
      setMessage({ text: "Could not read that image.", error: true });
    }
  }, []);

  const onPreviewClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (anchorStep >= 4 || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const key = ANCHOR_KEYS[anchorStep];
    setAnchors((a) => ({ ...a, [key]: { x, y } }));
    setAnchorStep((s) => s + 1);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !previewSize) {
      setMessage({ text: "Choose a garment image first.", error: true });
      return;
    }
    if (!name.trim() || !color.trim()) {
      setMessage({ text: "Name and color are required.", error: true });
      return;
    }
    if (slugify(name).length < 3) {
      setMessage({ text: "Name must produce a slug of at least 3 characters.", error: true });
      return;
    }
    const parsedPrice = price.trim() === "" ? undefined : Number(price);
    const parsedStock = Number(stock);
    const parsedLengthFactor = lengthFactor.trim() === "" ? 0 : Number(lengthFactor);
    if (parsedPrice !== undefined && (!Number.isFinite(parsedPrice) || parsedPrice < 0)) {
      setMessage({ text: "Price must be a non-negative number.", error: true });
      return;
    }
    if (!Number.isInteger(parsedStock) || parsedStock < 0) {
      setMessage({ text: "Stock must be a whole number of 0 or more.", error: true });
      return;
    }
    if (!Number.isFinite(parsedLengthFactor) || parsedLengthFactor < 0 || parsedLengthFactor > 2.5) {
      setMessage({ text: "Length factor must be a number between 0 and 2.5.", error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const meta = {
        id: slugify(name),
        name: name.trim(),
        category,
        color: color.trim(),
        colorHex,
        fit,
        sleeve,
        style: styleText.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8),
        occasions: occasionsText.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10),
        formality,
        // Zero is meaningful: the API maps it to the category's fitted default.
        lengthFactor: parsedLengthFactor,
        anchors,
        price: parsedPrice,
        description: description.trim() || undefined,
        sizes: sizesText.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 12),
        badge: badge.trim() || undefined,
        stock: parsedStock,
      };
      const form = new FormData();
      form.set("image", file);
      form.set("meta", JSON.stringify(meta));
      const res = await fetch("/api/admin/garments", { method: "POST", body: form });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Save failed");
      setMessage({ text: `Saved “${d.garment.name}”. It's now live in the catalog.` });
      setName(""); setColor(""); setFile(null); setPreviewUrl(null); setPreviewSize(null);
      setAnchors({ ...DEFAULT_ANCHORS }); setAnchorStep(0);
      setPrice(""); setDescription(""); setBadge("");
      setStock("100");
      onSaved();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Save failed", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-line bg-surface-raised/60">
      <header className="px-5 py-3.5 border-b border-line">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          Add garment
        </h2>
      </header>
      <form onSubmit={submit} className="p-5 grid md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Forest Green Oversized Tee" className={inputCls} />
            <p className="mt-1 text-[11px] text-zinc-600">id: <code>{id}</code></p>
          </Field>
          <Field label="Category">
            <div className="flex gap-1.5 flex-wrap">
              {categories.map((categoryName) => (
                <Chip key={categoryName} active={category === categoryName} onClick={() => setCategory(categoryName)}>
                  {categoryName}
                </Chip>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Color name">
              <input value={color} onChange={(e) => setColor(e.target.value)} placeholder="forest green" className={inputCls} />
            </Field>
            <Field label="Hex">
              <input type="color" value={colorHex} onChange={(e) => setColorHex(e.target.value)} className="focus-ring h-[38px] w-16 rounded-md border border-line bg-surface-overlay p-1 cursor-pointer" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fit">
              <div className="flex gap-1.5">
                {(["slim", "regular", "oversized"] as const).map((f) => (
                  <Chip key={f} active={fit === f} onClick={() => setFit(f)}>{f}</Chip>
                ))}
              </div>
            </Field>
            <Field label="Sleeve">
              <div className="flex gap-1.5">
                {(["short", "long", "none"] as const).map((s) => (
                  <Chip key={s} active={sleeve === s} onClick={() => setSleeve(s)}>{s}</Chip>
                ))}
              </div>
            </Field>
          </div>
          <Field label={`Formality · ${formality}/5`}>
            <input type="range" min={1} max={5} step={1} value={formality} onChange={(e) => setFormality(Number(e.target.value))} />
          </Field>
          <Field label="Style tags (comma separated)">
            <input value={styleText} onChange={(e) => setStyleText(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Occasions (comma separated)">
            <input value={occasionsText} onChange={(e) => setOccasionsText(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Length factor (0 = category default)">
            <input type="number" min={0} max={2.5} step={0.02} value={lengthFactor} onChange={(e) => setLengthFactor(e.target.value)} className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (USD, optional)">
              <input type="number" min={0} max={100000} step={1} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="49" className={inputCls} />
            </Field>
            <Field label="Badge (optional)">
              <input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="new / bestseller" maxLength={20} className={inputCls} />
            </Field>
          </div>
          <Field label="Stock">
            <input type="number" min={0} max={1000000} value={stock} onChange={(e) => setStock(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Sizes (comma separated)">
            <input value={sizesText} onChange={(e) => setSizesText(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Product description (optional)">
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={1000} placeholder="Short product copy shown on the shop page…" className={clsx(inputCls, "resize-y")} />
          </Field>
        </div>

        <div className="space-y-4">
          <Field label="Garment image (transparent PNG/WebP)">
            <input
              type="file"
              accept="image/png,image/webp"
              onChange={(e) => void handleFile(e.target.files?.[0])}
              className="focus-ring w-full text-sm text-zinc-400 file:mr-3 file:rounded-md file:border-0 file:bg-accent file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-zinc-950"
            />
          </Field>

          {previewUrl && previewSize && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
                Anchors — click: {anchorStep < 4 ? ANCHOR_ORDER[anchorStep] : "done"}
              </p>
              <div className="relative inline-block rounded-lg border border-line bg-[linear-gradient(45deg,#1a1d23_25%,transparent_25%,transparent_75%,#1a1d23_75%),linear-gradient(45deg,#1a1d23_25%,transparent_25%,transparent_75%,#1a1d23_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] cursor-crosshair">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={previewRef}
                  src={previewUrl}
                  alt="Garment preview"
                  onClick={onPreviewClick}
                  className="block max-h-72 w-auto"
                />
                {ANCHOR_KEYS.map((key, i) => (
                  <span
                    key={key}
                    className={clsx(
                      "absolute -translate-x-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full border-2 pointer-events-none",
                      i < anchorStep ? "border-accent bg-accent/40" : "border-zinc-500 bg-transparent"
                    )}
                    style={{
                      left: `${anchors[key].x * 100}%`,
                      top: `${anchors[key].y * 100}%`,
                    }}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setAnchors({ ...DEFAULT_ANCHORS }); setAnchorStep(0); }}>
                  Reset anchors
                </Button>
                <span className="text-[11px] text-zinc-600">
                  {previewSize.w}×{previewSize.h}px (trimmed)
                </span>
              </div>
            </div>
          )}

          {message && (
            <p className={clsx("text-sm", message.error ? "text-red-400" : "text-accent")}>
              {message.text}
            </p>
          )}
          <Button type="submit" variant="accent" disabled={busy || !file}>
            {busy ? <Spinner className="w-3.5 h-3.5 border-zinc-700 border-t-zinc-900" /> : "Save garment"}
          </Button>
        </div>
      </form>
    </section>
  );
}

const inputCls =
  "focus-ring w-full rounded-md bg-surface-overlay border border-line px-3 py-2 text-sm text-zinc-200 placeholder:text-zinc-600";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] uppercase tracking-wider text-zinc-500">{label}</span>
      {children}
    </label>
  );
}

function GarmentList({
  garments,
  loading,
  onChanged,
}: {
  garments: Garment[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [deleting, setDeleting] = useState<string | null>(null);

  const remove = async (id: string) => {
    if (!confirm(`Remove “${id}” from the catalog? (Files stay on disk.)`)) return;
    setDeleting(id);
    await fetch(`/api/admin/garments?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
    setDeleting(null);
    onChanged();
  };

  return (
    <section className="rounded-xl border border-line bg-surface-raised/60">
      <header className="px-5 py-3.5 border-b border-line flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
          Catalog · {garments.length}
        </h2>
      </header>
      <div className="p-5">
        {loading && <Spinner />}
        {!loading && garments.length === 0 && (
          <p className="text-sm text-zinc-500">No garments yet — add one above or run the seed script.</p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {garments.map((g) => (
            <div key={g.id} className="rounded-lg border border-line bg-surface-overlay/40 p-3">
              <div className="h-28 grid place-items-center rounded-md bg-surface overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/assets/${g.thumbnailPath}`} alt={g.name} loading="lazy" className="max-h-full max-w-full" />
              </div>
              <p className="mt-2 text-sm font-medium text-zinc-200 truncate">{g.name}</p>
              <p className="text-xs text-zinc-500 truncate">{g.color} · {g.fit} · {g.sleeve}</p>
              <div className="mt-2 flex items-center justify-between">
                <Badge>{g.category}</Badge>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => void remove(g.id)}
                  disabled={deleting === g.id}
                >
                  {deleting === g.id ? "…" : "Remove"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

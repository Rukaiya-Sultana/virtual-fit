"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Badge, Button, Panel, Spinner } from "@/components/ui";
import { useCart } from "@/components/shop/CartProvider";
import type { Adjustments, BodyLandmarks, Garment } from "@/types";
import { DEFAULT_ADJUSTMENTS } from "@/types";
import { buildTorsoFrame, computePlacement, type TorsoFrame } from "@/lib/fitting/engine";
import { drawGarmentMesh, drawSkeleton } from "@/lib/fitting/render";
import { loadGarmentImage, getCachedGarmentImage } from "@/lib/fitting/garment-loader";
import type { ApplyResult } from "@/lib/ai/apply";
import { PhotoGate, type LoadedPhoto } from "./PhotoGate";
import { CatalogPanel } from "./CatalogPanel";
import { ControlPanel } from "./ControlPanel";
import { AiAssistant } from "./AiAssistant";
import { CompareModal } from "./CompareModal";

interface Toast {
  id: number;
  text: string;
  tone: "ok" | "error";
}

export function TryOnStudio() {
  const searchParams = useSearchParams();
  const cart = useCart();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [detection, setDetection] = useState<{ landmarks: BodyLandmarks; confidence: number } | null>(null);
  const [garments, setGarments] = useState<Garment[]>([]);
  const [garmentsLoading, setGarmentsLoading] = useState(true);
  const [garmentsError, setGarmentsError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState<Adjustments>(DEFAULT_ADJUSTMENTS);
  const adjustmentsRef = useRef(adjustments);
  const [garmentImgVersion, setGarmentImgVersion] = useState(0);
  const [garmentImgError, setGarmentImgError] = useState(false);

  // ── View state ─────────────────────────────────────────────────────────────
  const [showBefore, setShowBefore] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareIds, setCompareIds] = useState<string[] | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── Session/save state ─────────────────────────────────────────────────────
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedResults, setSavedResults] = useState<Array<{ url: string; name: string }>>([]);
  const [cartSize, setCartSize] = useState("M");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<TorsoFrame | null>(null);
  const selectedGarment = useMemo(
    () => garments.find((g) => g.id === selectedId) ?? null,
    [garments, selectedId]
  );

  useEffect(() => {
    adjustmentsRef.current = adjustments;
  }, [adjustments]);

  // Lock page scroll while the mobile chat sheet is open.
  useEffect(() => {
    if (!chatOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [chatOpen]);

  const toast = useCallback((text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  // ── Catalog loading ────────────────────────────────────────────────────────
  const loadCatalog = useCallback(() => {
    setGarmentsLoading(true);
    setGarmentsError(false);
    fetch("/api/garments")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setGarments(d.garments ?? []))
      .catch(() => setGarmentsError(true))
      .finally(() => setGarmentsLoading(false));
  }, []);

  useEffect(loadCatalog, [loadCatalog]);

  // ── Garment asset loading ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedGarment) return;
    let cancelled = false;
    setGarmentImgError(false);
    loadGarmentImage(selectedGarment.assetPath)
      .then(() => {
        if (!cancelled) setGarmentImgVersion((v) => v + 1);
      })
      .catch(() => {
        if (!cancelled) {
          setGarmentImgError(true);
          toast("Couldn't load that garment's image asset.", "error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedGarment, toast]);

  // ── Rendering ──────────────────────────────────────────────────────────────
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const photoEl = photo?.element;
    if (!canvas || !photoEl) return;

    const w = photo!.width;
    const h = photo!.height;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(photoEl, 0, 0, w, h);

    const img = selectedGarment ? getCachedGarmentImage(selectedGarment.assetPath) : null;
    if (detection) {
      frameRef.current = buildTorsoFrame(detection.landmarks, w, h);
    }

    if (!showBefore && selectedGarment && img && detection) {
      const placement = computePlacement(frameRef.current!, selectedGarment, adjustments, {
        width: w,
        height: h,
      });
      drawGarmentMesh(ctx, img, placement, {
        opacity: adjustments.opacity,
        shadowBlur: 12,
        shadowAlpha: 0.3,
      });
    }

    if (showSkeleton && detection) {
      drawSkeleton(ctx, detection.landmarks);
    }
  }, [photo, selectedGarment, adjustments, detection, showBefore, showSkeleton, garmentImgVersion]);

  useEffect(() => {
    renderFrame();
  }, [renderFrame]);

  // ── Photo handling ─────────────────────────────────────────────────────────
  const onPhotoDone = useCallback(
    (p: LoadedPhoto, landmarks: BodyLandmarks, confidence: number) => {
      if (photo) URL.revokeObjectURL(photo.url);
      setPhoto(p);
      setDetection({ landmarks, confidence });
      setShowUploadModal(false);
      setShowBefore(false);
      toast(`Body detected — ${Math.round(confidence * 100)}% confidence.`);
    },
    [photo, toast]
  );

  const replacePhoto = useCallback(() => {
    setShowUploadModal(true);
  }, []);

  // ── Selection & adjustments ────────────────────────────────────────────────
  const selectGarment = useCallback(
    (id: string) => {
      const g = garments.find((x) => x.id === id);
      setSelectedId(id);
      if (g) setAdjustments({ ...DEFAULT_ADJUSTMENTS, fit: g.fit });
    },
    [garments]
  );

  // ── Deep link: /tryon?garment=<id> preselects a product from the shop ─────
  const preselectDone = useRef(false);
  useEffect(() => {
    if (preselectDone.current || garmentsLoading) return;
    preselectDone.current = true;
    const want = searchParams.get("garment");
    if (want && garments.some((g) => g.id === want)) {
      const g = garments.find((x) => x.id === want);
      setSelectedId(want);
      if (g) setAdjustments({ ...DEFAULT_ADJUSTMENTS, fit: g.fit });
    }
  }, [garments, garmentsLoading, searchParams]);

  const patchAdjustments = useCallback((patch: Partial<Adjustments>) => {
    setAdjustments((a) => ({ ...a, ...patch }));
  }, []);

  const resetAdjustments = useCallback(() => {
    setAdjustments({ ...DEFAULT_ADJUSTMENTS, fit: selectedGarment?.fit ?? "regular" });
    toast("Garment reset to automatic fit.");
  }, [selectedGarment, toast]);

  // ── AI command application ─────────────────────────────────────────────────
  const handleApply = useCallback(
    (result: ApplyResult) => {
      setAdjustments(result.adjustments);
      if (result.selectedGarmentId && garments.some((g) => g.id === result.selectedGarmentId)) {
        selectGarment(result.selectedGarmentId);
      }
      if (result.compareIds && result.compareIds.length >= 2) {
        const valid = result.compareIds
          .map((id) => garments.find((g) => g.id === id))
          .filter((g): g is Garment => Boolean(g))
          .slice(0, 2);
        if (valid.length === 2 && photo && detection) {
          setCompareIds(valid.map((g) => g.id));
        }
      }
    },
    [garments, selectGarment, photo, detection]
  );

  // ── Canvas drag to move garment ────────────────────────────────────────────
  const dragRef = useRef<{
    startX: number;
    startY: number;
    offset: { x: number; y: number };
    shoulderWidth: number;
    torsoLength: number;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!selectedGarment || !frameRef.current || showBefore || compareMode) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offset: { x: adjustments.offsetX, y: adjustments.offsetY },
      shoulderWidth: frameRef.current.shoulderWidth || 100,
      torsoLength: frameRef.current.torsoLength || 200,
    };
    canvas.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = (e.clientX - d.startX) / d.shoulderWidth;
    const dy = (e.clientY - d.startY) / d.torsoLength;
    setAdjustments((a) => ({
      ...a,
      offsetX: Math.min(0.25, Math.max(-0.25, d.offset.x + dx)),
      offsetY: Math.min(0.25, Math.max(-0.25, d.offset.y + dy)),
    }));
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  // ── Compare ────────────────────────────────────────────────────────────────
  const toggleCompareSelection = useCallback((id: string) => {
    setCompareSelection((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= 2 ? [s[1], id] : [...s, id]
    );
  }, []);

  const openCompareFromSelection = useCallback(() => {
    if (compareSelection.length === 2) setCompareIds(compareSelection);
  }, [compareSelection]);

  const compareGarments = useMemo(
    () =>
      (compareIds ?? [])
        .map((id) => garments.find((g) => g.id === id))
        .filter((g): g is Garment => Boolean(g)),
    [compareIds, garments]
  );

  // ── Export / save ──────────────────────────────────────────────────────────
  const getCompositeBlob = useCallback(async (): Promise<Blob | null> => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const showSkel = showSkeleton;
    if (showSkel) {
      setShowSkeleton(false);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.92)
    );
    if (showSkel) setShowSkeleton(true);
    return blob;
  }, [showSkeleton]);

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (sessionId) return sessionId;
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setSessionId(data.sessionId);
      return data.sessionId as string;
    } catch {
      return null;
    }
  }, [sessionId]);

  const saveResult = useCallback(async () => {
    if (!photo || saving) return;
    setSaving(true);
    try {
      const sid = await ensureSession();
      if (!sid) throw new Error("session");

      // Upload the user photo (best effort — result is the key artifact).
      const photoCanvas = document.createElement("canvas");
      photoCanvas.width = photo.width;
      photoCanvas.height = photo.height;
      photoCanvas.getContext("2d")?.drawImage(photo.element, 0, 0);
      const photoBlob = await new Promise<Blob | null>((r) =>
        photoCanvas.toBlob(r, "image/webp", 0.9)
      );
      if (photoBlob) {
        await fetch(`/api/sessions/${sid}/photo`, {
          method: "PUT",
          headers: { "Content-Type": "image/webp" },
          body: photoBlob,
        }).catch(() => {});
      }

      const resultBlob = await getCompositeBlob();
      if (!resultBlob) throw new Error("render");
      const res = await fetch(`/api/sessions/${sid}/results`, {
        method: "POST",
        headers: { "Content-Type": "image/webp" },
        body: resultBlob,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "save failed");
      }
      const data = await res.json();
      setSavedResults((r) => [{ url: data.url, name: data.url.split("/").pop() }, ...r]);
      toast("Saved to the server — auto-expires in 24 h.");
    } catch (err) {
      toast(err instanceof Error && err.message !== "session" && err.message !== "render"
        ? `Save failed: ${err.message}`
        : "Could not save the result. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }, [photo, saving, ensureSession, getCompositeBlob, toast]);

  const downloadResult = useCallback(async () => {
    const blob = await getCompositeBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `virtual-fit-${selectedGarment?.id ?? "result"}.webp`;
    a.click();
    URL.revokeObjectURL(url);
  }, [getCompositeBlob, selectedGarment]);

  const hipsImputed = detection ? !(
    (detection.landmarks.leftHip.visibility ?? 0) >= 0.5 &&
    (detection.landmarks.rightHip.visibility ?? 0) >= 0.5
  ) : false;

  const aiDisabled = !photo || !detection || !selectedId;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0">

      <main className="flex-1 min-h-0 mx-auto w-full max-w-[1600px] px-4 md:px-6 py-4 md:py-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:h-full lg:min-h-0">
          {/* Left column — AI chat (priority) + session info below */}
          <div className="lg:col-span-3 order-3 lg:order-1 flex flex-col gap-4 lg:min-h-0 lg:overflow-y-auto slim-scroll lg:pr-0.5">
            {/* Desktop chat sidebar - on mobile the assistant opens from a floating button instead */}
            <div className="hidden lg-flex flex-col flex-1 min-h-[440px]">
              <Panel title="AI Fashion Assistant" className="flex-1 min-h-0">
                <AiAssistant
                  garments={garments}
                  selectedId={selectedId}
                  adjustmentsRef={adjustmentsRef}
                  onApply={handleApply}
                  disabled={aiDisabled}
                />
              </Panel>
            </div>
            <Panel title="Session" className="shrink-0">
              <div className="p-4 space-y-3 text-sm">
                {photo ? (
                  <>
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Photo</span>
                      <span className="tabular-nums text-zinc-300">
                        {photo.width}×{photo.height}px
                      </span>
                    </div>
                    {detection && (
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span>Detection</span>
                        <Badge tone={hipsImputed ? "warn" : "accent"}>
                          {hipsImputed ? "Hips estimated" : "Body detected"} ·{" "}
                          {Math.round(detection.confidence * 100)}%
                        </Badge>
                      </div>
                    )}
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Processing</span>
                      <span className="text-zinc-300">100% in-browser</span>
                    </div>
                    <div className="flex justify-between text-xs text-zinc-400">
                      <span>Server storage</span>
                      <span className="text-zinc-300">
                        {savedResults.length > 0 ? `${savedResults.length} result(s)` : "none yet"}
                      </span>
                    </div>
                    <div className="pt-2 grid grid-cols-2 gap-2">
                      <Button
                        variant="accent"
                        size="sm"
                        onClick={saveResult}
                        disabled={saving || !selectedId}
                        title="Store this try-on on the VPS (auto-expires)"
                      >
                        {saving ? <Spinner className="w-3 h-3 border-zinc-700 border-t-zinc-900" /> : "Save to server"}
                      </Button>
                      <Button size="sm" onClick={downloadResult} disabled={!selectedId}>
                        Download
                      </Button>
                    </div>
                    {savedResults.length > 0 && (
                      <div className="pt-1 flex gap-2 flex-wrap">
                        {savedResults.map((r) => (
                          <a
                            key={r.url}
                            href={r.url}
                            target="_blank"
                            rel="noreferrer"
                            className="focus-ring rounded-md border border-line overflow-hidden hover:border-zinc-500 transition-colors"
                            title="Open saved result (new tab)"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.url} alt="Saved try-on result" className="w-14 h-14 object-cover" />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Shop bridge: like the fit? add it to the cart. */}
                    {selectedGarment && selectedGarment.price !== undefined && (
                      <div className="mt-2 pt-3 border-t border-line">
                        <p className="text-[11px] uppercase tracking-wider text-zinc-500 mb-2">
                          Like the fit?
                        </p>
                        <div className="flex items-center gap-2">
                          <select
                            aria-label="Size for cart"
                            value={cartSize}
                            onChange={(e) => setCartSize(e.target.value)}
                            className="focus-ring rounded-md bg-surface-overlay border border-line px-2 py-2 text-xs text-zinc-200"
                          >
                            {(selectedGarment.sizes?.length
                              ? selectedGarment.sizes
                              : ["S", "M", "L", "XL"]
                            ).map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                          <Button
                            size="sm"
                            className="flex-1"
                            onClick={() => {
                              cart.addItem(selectedGarment, cartSize, 1);
                              cart.setOpen(true);
                            }}
                          >
                            Add to cart · ${selectedGarment.price}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Upload a photo to begin. Nothing is uploaded to the server during
                    processing.
                  </p>
                )}
              </div>
            </Panel>
          </div>

          {/* Center column — stage + controls */}
          <div className="lg:col-span-6 order-1 lg:order-2 flex flex-col gap-4 lg:min-h-0">
            <Panel
              title={
                selectedGarment ? (
                  <span className="normal-case tracking-normal text-sm font-medium text-zinc-200">
                    {selectedGarment.name}
                    <span className="ml-2 text-zinc-500 font-normal">{selectedGarment.fit} fit</span>
                  </span>
                ) : (
                  "Try-on result"
                )
              }
              actions={
                photo && (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant={compareMode ? "accent" : "default"} onClick={() => { setCompareMode((v) => !v); setCompareSelection([]); }}>
                      ⇄ Compare
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowBefore((v) => !v)}>
                      {showBefore ? "Show garment" : "Before / after"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowSkeleton((v) => !v)} title="Toggle landmark overlay">
                      {showSkeleton ? "Hide skeleton" : "Skeleton"}
                    </Button>
                  </div>
                )
              }
              className={photo ? "min-h-[420px] lg:flex-1" : "shrink-0"}
              bodyClassName="flex flex-col min-h-0"
            >
              <div className={clsx("min-h-0 flex flex-col", photo && "lg:flex-1")}>
                  {/* Toolbar row */}
                  {photo && (
                    <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-line text-xs text-zinc-500">
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.2).toFixed(2)))}>−</Button>
                      <span className="tabular-nums w-12 text-center">{Math.round(zoom * 100)}%</span>
                      <Button size="sm" variant="ghost" onClick={() => setZoom((z) => Math.min(3, +(z + 0.2).toFixed(2)))}>+</Button>
                      {zoom !== 1 && (
                        <Button size="sm" variant="ghost" onClick={() => setZoom(1)}>Fit</Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={resetAdjustments} className="focus-ring rounded px-2 py-1 hover:text-zinc-200" disabled={!selectedGarment}>
                        Reset fit
                      </button>
                      <span className="text-zinc-700 hidden sm:inline">|</span>
                      <button onClick={replacePhoto} className="focus-ring rounded px-2 py-1 hover:text-zinc-200">
                        Replace photo
                      </button>
                    </div>
                  </div>
                  )}

                {/* Stage */}
                <div
                  className={clsx(
                    "min-h-0 overflow-auto slim-scroll grid place-items-center p-3 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.03),transparent_65%)]",
                    photo && "lg:flex-1"
                  )}
                >
                  {!photo ? (
                    <PhotoGate onDone={onPhotoDone} />
                  ) : (
                    <div className="relative">
                      <canvas
                        ref={canvasRef}
                        className={clsx(
                          "tryon block rounded-lg shadow-stage",
                          selectedGarment && !showBefore && "cursor-grab active:cursor-grabbing"
                        )}
                        style={
                          zoom === 1
                            ? { maxWidth: "100%", maxHeight: "58vh", width: "auto", height: "auto", touchAction: "none" }
                            : { width: `${zoom * 100}%`, maxWidth: "none", height: "auto", touchAction: "none" }
                        }
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                      />
                      {!selectedId && (
                        <div className="absolute inset-x-0 bottom-3 flex justify-center px-3 pointer-events-none">
                          <span className="rounded-full bg-black/70 border border-line px-4 py-2 text-xs text-zinc-300 text-center">
                            Select a garment from the catalog
                            <span className="hidden lg:inline"> →</span>
                            <span className="lg:hidden"> ↓</span>
                          </span>
                        </div>
                      )}
                      {showBefore && (
                        <div className="absolute top-3 left-3">
                          <span className="rounded-full bg-black/70 border border-line px-3 py-1 text-[10px] uppercase tracking-wider text-zinc-300">
                            Original photo
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Compare mode hint */}
                {compareMode && (
                  <div className="px-3 py-2 border-t border-line flex items-center justify-between text-xs text-zinc-400">
                    <span>
                      Pick two garments in the catalog to compare
                      {compareSelection.length > 0 && ` (${compareSelection.length}/2 selected)`}
                    </span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => { setCompareMode(false); setCompareSelection([]); }}>
                        Cancel
                      </Button>
                      <Button size="sm" variant="accent" disabled={compareSelection.length !== 2} onClick={openCompareFromSelection}>
                        Compare
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Panel>

            <Panel title="Fine-tune your fit" className="shrink-0">
              <div className="p-4">
                <ControlPanel
                  adjustments={adjustments}
                  onChange={patchAdjustments}
                  onReset={resetAdjustments}
                  disabled={!selectedGarment}
                />
              </div>
            </Panel>
          </div>

          {/* Right column — catalog */}
          <div className="lg:col-span-3 order-2 lg:order-3 lg:min-h-0">
            <Panel
              title={`Catalog · ${garments.length}`}
              className="max-h-[70vh] lg:max-h-none lg:h-full"
              bodyClassName="flex flex-col min-h-0"
            >
              <CatalogPanel
                garments={garments}
                loading={garmentsLoading}
                error={garmentsError}
                reload={loadCatalog}
                selectedId={selectedId}
                onSelect={selectGarment}
                compareMode={compareMode}
                compareSelection={compareSelection}
                onToggleCompare={toggleCompareSelection}
              />
            </Panel>
          </div>
        </div>
      </main>

      {/* Mobile AI assistant: floating button + bottom sheet */}
      <div className="lg:hidden">
        <button
          onClick={() => setChatOpen(true)}
          aria-label="Open AI fashion assistant"
          className="fixed bottom-5 right-4 z-40 flex items-center gap-2 rounded-full bg-accent pl-4 pr-5 py-3 text-sm font-semibold text-zinc-950 shadow-stage hover:bg-accent-dim transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M12 2l1.9 5.7a2 2 0 001.3 1.3L21 11l-5.8 1.9a2 2 0 00-1.3 1.3L12 20l-1.9-5.8a2 2 0 00-1.3-1.3L3 11l5.8-2a2 2 0 001.3-1.3L12 2z" />
          </svg>
          Ask AI
        </button>

        {chatOpen && (
          <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="AI fashion assistant">
            <div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fadein"
              onClick={() => setChatOpen(false)}
            />
            <div className="absolute inset-x-0 bottom-0 flex h-[85dvh] max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border-x border-t border-line bg-surface-raised shadow-stage animate-fadein">
              <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">AI Fashion Assistant</p>
                  <p className="text-[11px] text-zinc-500">operates on catalog data only — never your photo</p>
                </div>
                <button
                  onClick={() => setChatOpen(false)}
                  aria-label="Close assistant"
                  className="focus-ring shrink-0 rounded-md border border-line bg-surface-overlay p-2 hover:border-zinc-500 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden className="text-zinc-300">
                    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                  </svg>
                </button>
              </header>
              <div className="flex-1 min-h-0 flex flex-col">
                <AiAssistant
                  garments={garments}
                  selectedId={selectedId}
                  adjustmentsRef={adjustmentsRef}
                  onApply={handleApply}
                  disabled={aiDisabled}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Compare modal */}
      {compareIds && photo && detection && compareGarments.length >= 2 && (
        <CompareModal
          photo={photo.element}
          landmarks={detection.landmarks}
          garments={compareGarments}
          onClose={() => {
            setCompareIds(null);
            setCompareMode(false);
            setCompareSelection([]);
          }}
          onSelect={selectGarment}
        />
      )}

      {/* Upload modal (replace photo) */}
      {showUploadModal && (
        <div
          className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowUploadModal(false);
          }}
        >
          <div className="animate-fadein w-full max-w-xl rounded-2xl border border-line bg-surface-raised shadow-stage max-h-[90vh] overflow-y-auto slim-scroll">
            <header className="flex items-center justify-between px-5 py-3.5 border-b border-line">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400">
                Replace your photo
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setShowUploadModal(false)}>
                ✕
              </Button>
            </header>
            <PhotoGate onDone={onPhotoDone} compact />
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[60] space-y-2 w-80 max-w-[calc(100vw-2rem)]">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              "animate-fadein rounded-lg border px-4 py-3 text-sm shadow-stage bg-surface-raised",
              t.tone === "ok" ? "border-line text-zinc-200" : "border-red-900/70 text-red-300"
            )}
            role="status"
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}

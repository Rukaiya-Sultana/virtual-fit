"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Button, Spinner } from "@/components/ui";
import { detectBody, DetectionError } from "@/lib/pose/detector";
import type { BodyLandmarks } from "@/types";

const MAX_MB = 10;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_DIM = 1400;

export interface LoadedPhoto {
  element: HTMLImageElement;
  url: string;
  width: number;
  height: number;
  originalName: string;
}

/**
 * Load a user-selected file into a downscaled HTMLImageElement (client-side).
 * Returns a validation error string instead of throwing for user mistakes.
 */
export async function loadPhoto(file: File): Promise<{ photo?: LoadedPhoto; error?: string }> {
  if (!ACCEPTED.includes(file.type)) {
    return { error: "Unsupported file type. Please use a JPEG, PNG or WebP image." };
  }
  if (file.size > MAX_MB * 1024 * 1024) {
    return { error: `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB — the limit is ${MAX_MB} MB.` };
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { error: "Your browser could not decode this image." };
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.92)
    );
    if (!blob) return { error: "Your browser could not process this image." };

    const url = URL.createObjectURL(blob);
    const element = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });

    if (w < 64 || h < 64) {
      URL.revokeObjectURL(url);
      return { error: "That image is too small — please use a clearer, larger photo." };
    }

    return { photo: { element, url, width: w, height: h, originalName: file.name } };
  } catch {
    return { error: "That file could not be read as an image." };
  }
}

const GUIDANCE = [
  "Face the camera directly",
  "Keep your upper body visible — shoulders to hips",
  "Both shoulders fully inside the frame",
  "Reasonable, even lighting",
  "Arms slightly separated from your torso",
];

export function PhotoGate({
  onDone,
  compact,
  onFileChosen,
}: {
  onDone: (photo: LoadedPhoto, landmarks: BodyLandmarks, confidence: number) => void;
  compact?: boolean;
  onFileChosen?: () => void;
}) {
  const [photo, setPhoto] = useState<LoadedPhoto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState<"choose" | "camera">("choose");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [timerDuration, setTimerDuration] = useState<3 | 5 | 10>(5);
  const [countdown, setCountdown] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const captureInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Environment capabilities - computed after mount to avoid hydration mismatch.
  const [caps, setCaps] = useState<{ liveCamera: boolean; touch: boolean } | null>(null);

  useEffect(() => {
    setCaps({
      liveCamera:
        typeof navigator !== "undefined" &&
        window.isSecureContext !== false &&
        !!navigator.mediaDevices?.getUserMedia,
      touch:
        typeof window !== "undefined" &&
        (window.matchMedia?.("(pointer: coarse)").matches ||
          "ontouchstart" in window),
    });
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setCountdown(null);
  }, []);

  const stopCamera = useCallback(() => {
    clearTimer();
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, [clearTimer]);

  useEffect(() => stopCamera, [stopCamera]);

  useEffect(() => {
    if (mode === "camera" && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [mode]);

  const openCamera = useCallback(async () => {
    setCameraError(null);
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setCameraError(
        "Live camera preview needs a secure (HTTPS) connection. Open this site over HTTPS, or use “Take photo” / “Upload photo” instead — both work everywhere."
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Live camera preview is not supported by this browser. Use “Take photo” or “Upload photo” instead."
      );
      return;
    }
    stopCamera();
    const requestId = cameraRequestRef.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      setMode("camera");
    } catch (err) {
      const denied = err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      setCameraError(denied
        ? "Camera permission was denied. Allow access in your browser settings and try again."
        : "No camera is available. Check that it is connected and not in use by another app.");
    }
  }, [stopCamera]);

  const cancelCamera = useCallback(() => {
    stopCamera();
    setMode("choose");
    setCameraError(null);
  }, [stopCamera]);

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      onFileChosen?.();
      stopCamera();
      setMode("choose");
      setError(null);
      setHint(null);
      setCameraError(null);
      const res = await loadPhoto(file);
      if (res.error || !res.photo) {
        setError(res.error ?? "Could not load that image.");
        return;
      }
      setPhoto(res.photo);
    },
    [onFileChosen, stopCamera]
  );

  /** Native camera capture (mobile): <input capture> opens the camera app and works over plain HTTP too. */
  const takeNativePhoto = useCallback(() => {
    if (captureInputRef.current) {
      captureInputRef.current.value = "";
      captureInputRef.current.click();
    }
  }, []);

  const capturePhoto = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.videoWidth < 64 || video.videoHeight < 64) {
      setCameraError("The camera is still starting. Please try again in a moment.");
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCameraError("Your browser could not capture the camera image.");
      return;
    }
    // Save the mirrored frame the user sees, then route it through the upload loader.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.92));
    if (!blob) {
      setCameraError("Your browser could not process the captured image.");
      return;
    }
    stopCamera();
    setMode("choose");
    await handleFile(new File([blob], "camera-capture.webp", { type: "image/webp" }));
  }, [handleFile, stopCamera]);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    let remaining = timerDuration;
    setCountdown(remaining);
    timerRef.current = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        timerRef.current = null;
        setCountdown(null);
        void capturePhoto();
        return;
      }
      setCountdown(remaining);
    }, 1000);
  }, [capturePhoto, timerDuration]);

  const retakeCamera = useCallback(() => {
    setPhoto(null);
    void openCamera();
  }, [openCamera]);

  const analyze = useCallback(async () => {
    if (!photo) return;
    setBusy(true);
    setError(null);
    setHint(null);
    try {
      const result = await detectBody(photo.element);
      onDone(photo, result.landmarks, result.confidence);
      setPhoto(null);
    } catch (err) {
      if (err instanceof DetectionError) {
        setError(err.message);
        setHint(err.hint);
      } else {
        setError("Body detection failed unexpectedly.");
        setHint("Try a different photo or reload the page.");
      }
    } finally {
      setBusy(false);
    }
  }, [photo, onDone]);

  if (photo) {
    return (
      <div className="animate-fadein p-4 md:p-6 flex flex-col items-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-4">
          Preview · check the checklist
        </p>
        <div className="rounded-lg overflow-hidden border border-line max-h-[46vh]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.url}
            alt="Your photo preview"
            className="max-h-[46vh] w-auto block"
          />
        </div>
        <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-zinc-400 max-w-lg w-full">
          {GUIDANCE.map((g) => (
            <li key={g} className="flex items-center gap-2">
              <span className="w-1 h-1 rounded-full bg-accent shrink-0" aria-hidden />
              {g}
            </li>
          ))}
        </ul>
        {error && (
          <div className="mt-4 w-full max-w-lg rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm">
            <p className="text-red-300">{error}</p>
            {hint && <p className="mt-1 text-xs text-red-400/80">{hint}</p>}
          </div>
        )}
        <div className="mt-6 flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={photo.originalName === "camera-capture.webp" ? retakeCamera : () => setPhoto(null)}
            disabled={busy}
          >
            ← {photo.originalName === "camera-capture.webp" ? "Retake" : "Different photo"}
          </Button>
          <Button variant="accent" onClick={analyze} disabled={busy}>
            {busy ? (
              <>
                <Spinner className="border-zinc-800 border-t-zinc-900" /> Detecting body…
              </>
            ) : (
              "Detect body & continue"
            )}
          </Button>
        </div>
        {busy && (
          <p className="mt-3 text-xs text-zinc-500">
            Running MediaPipe pose detection locally in your browser…
          </p>
        )}
      </div>
    );
  }

  if (mode === "camera") {
    return (
      <div className="animate-fadein p-4 md:p-6 flex flex-col items-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-zinc-400 mb-4">
          Camera preview
        </p>
        <div className="relative w-full max-w-xl overflow-hidden rounded-xl border border-line bg-black aspect-[3/4] sm:aspect-[4/3]">
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="block h-full w-full object-cover scale-x-[-1]"
            aria-label="Live mirrored camera preview"
          />
          {countdown !== null && (
            <div className="absolute inset-0 grid place-items-center bg-black/25" aria-live="assertive">
              <span className="rounded-full border border-accent/70 bg-black/75 px-8 py-4 text-6xl font-semibold tabular-nums text-accent shadow-stage">
                {countdown}
              </span>
            </div>
          )}
        </div>
        <p className="mt-4 text-center text-sm text-zinc-300">
          Face forward and keep your shoulders and hips visible.
        </p>
        {cameraError && <p className="mt-3 text-center text-xs text-red-300">{cameraError}</p>}
        <div className="mt-5 w-full max-w-xl">
          {countdown !== null ? (
            <div className="flex justify-center">
              <Button variant="ghost" onClick={clearTimer}>Cancel Timer</Button>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                Capture
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button variant="accent" onClick={() => void capturePhoto()}>Capture Now</Button>
                <Button variant="ghost" onClick={cancelCamera}>Cancel</Button>
              </div>
              <div className="mt-5 border-t border-line pt-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
                  Timer
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {([3, 5, 10] as const).map((seconds) => (
                    <button
                      key={seconds}
                      type="button"
                      onClick={() => setTimerDuration(seconds)}
                      className={clsx(
                        "focus-ring rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                        timerDuration === seconds
                          ? "border-accent/70 bg-accent/15 text-accent"
                          : "border-line text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                      )}
                    >
                      {seconds}s
                    </button>
                  ))}
                </div>
                <Button className="mt-3 w-full" onClick={startTimer}>Start Timer</Button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 flex flex-col items-center">
      <div className="mb-5 grid w-full max-w-xl grid-cols-2 gap-3">
        {caps?.liveCamera && (
          <Button variant="default" className="py-3" onClick={() => void openCamera()}>
            Use Camera
          </Button>
        )}
        {caps && (caps.touch || !caps.liveCamera) && (
          <Button
            variant={caps.liveCamera ? "default" : "accent"}
            className="py-3"
            onClick={takeNativePhoto}
          >
            📷 Take Photo
          </Button>
        )}
        <Button
          variant="accent"
          className="py-3"
          onClick={() => inputRef.current?.click()}
        >
          ↑ Upload Photo
        </Button>
      </div>
      {caps && !caps.liveCamera && (
        <div className="mb-4 w-full max-w-xl rounded-lg border border-amber-900/60 bg-amber-950/25 px-4 py-3 text-sm text-amber-200/90">
          <p>
            Live camera preview needs <strong>HTTPS</strong> — browsers block camera
            access on plain HTTP sites.
            {typeof window !== "undefined" && window.isSecureContext === false
              ? " You can still take a photo with your device camera (📷 Take photo) or upload one — body detection works exactly the same."
              : ""}
          </p>
          <p className="mt-1.5 text-xs text-amber-200/60">
            Site owner: enable HTTPS for this domain (a free Let's Encrypt
            certificate in Dokploy → Domains) to unlock the live preview.
          </p>
        </div>
      )}
      {cameraError && (
        <div className="mb-4 w-full max-w-xl rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {cameraError}
        </div>
      )}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload a photo"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          void handleFile(e.dataTransfer.files?.[0]);
        }}
        className={clsx(
          "focus-ring w-full max-w-xl rounded-xl border-2 border-dashed px-6 py-10 md:py-14 text-center cursor-pointer transition-colors",
          dragOver
            ? "border-accent/70 bg-accent/5"
            : "border-line hover:border-zinc-500 bg-surface-overlay/30"
        )}
      >
        <svg
          className="mx-auto mb-4 text-zinc-500"
          width="40"
          height="40"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" strokeLinecap="round" />
        </svg>
        <p className="text-sm font-medium text-zinc-200">
          Drop a photo here, or click to choose
        </p>
        <p className="mt-1.5 text-xs text-zinc-500">
          JPEG / PNG / WebP · up to {MAX_MB} MB · processed in your browser
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {GUIDANCE.slice(0, 3).map((g) => (
            <span
              key={g}
              className="rounded-full border border-line px-2.5 py-1 text-[10px] text-zinc-400"
            >
              {g}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 w-full max-w-xl rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm">
          <p className="text-red-300">{error}</p>
          {hint && <p className="mt-1 text-xs text-red-400/80">{hint}</p>}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {/* Native device camera (mobile). `capture` opens the camera app directly and works over HTTP. */}
      <input
        ref={captureInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      {!compact && (
        <p className="mt-5 text-[11px] text-zinc-600 max-w-md text-center leading-relaxed">
          Your photo stays on your device: body detection and garment rendering run
          entirely client-side. Files are stored on the server only if you save a result.
        </p>
      )}
    </div>
  );
}

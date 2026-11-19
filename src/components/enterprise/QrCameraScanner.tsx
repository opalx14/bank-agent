"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, RotateCcw, ScanLine, Sparkles, X } from "lucide-react";
import { buildOrderQrStub } from "@/core/bank/vietqr-builder";

interface QrCameraScannerProps {
  onDecoded: (rawText: string) => void;
}

interface BarcodeDetectorLike {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
}

type ScannerMode = "idle" | "scanning" | "locked";

function createSampleVietQr(): string {
  return buildOrderQrStub({ orderCode: 202601, amountVnd: 1_500_000, description: "OPX202601 GYM PRO", railMode: "SANDBOX" }).qrCode;
}

function CornerBrackets({ locked }: { locked: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 200 200"
      className={`h-44 w-44 drop-shadow-[0_2px_6px_rgba(0,0,0,0.45)] transition-transform duration-300 sm:h-52 sm:w-52 ${
        locked ? "scale-95" : "motion-safe:animate-pulse"
      }`}
    >
      <g fill="none" stroke={locked ? "#34d399" : "#ffffff"} strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 14 52 L 14 24 Q 14 14 24 14 L 52 14" />
        <path d="M 148 14 L 176 14 Q 186 14 186 24 L 186 52" />
        <path d="M 186 148 L 186 176 Q 186 186 176 186 L 148 186" />
        <path d="M 52 186 L 24 186 Q 14 186 14 176 L 14 148" />
      </g>
    </svg>
  );
}

export function QrCameraScanner({ onDecoded }: QrCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mode, setMode] = useState<ScannerMode>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualText, setManualText] = useState(() => createSampleVietQr());

  useEffect(() => {
    if (mode !== "scanning") return;
    let stream: MediaStream | null = null;
    let timerId: number | undefined;
    let cancelled = false;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        const DetectorCtor = (window as unknown as { BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
        if (DetectorCtor && videoRef.current) {
          const detector = new DetectorCtor({ formats: ["qr_code"] });
          timerId = window.setInterval(async () => {
            if (!videoRef.current || cancelled) return;
            const found = await detector.detect(videoRef.current).catch(() => []);
            const code = found[0]?.rawValue?.trim();
            if (code) {
              stream?.getTracks().forEach((t) => t.stop());
              setMode("locked");
              setManualText(code);
              onDecoded(code);
            }
          }, 500);
        }
      } catch {
        setErrorMsg("Unable to open camera on this device. Paste a payload or load a sample below.");
        setMode("idle");
      }
    };

    void startCamera();
    return () => {
      cancelled = true;
      if (timerId) window.clearInterval(timerId);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [mode, onDecoded]);

  const handleLoadSample = () => {
    const sample = createSampleVietQr();
    setManualText(sample);
    if (mode === "scanning") setMode("locked");
    onDecoded(sample);
  };

  const handleDecodeManual = () => {
    if (mode === "scanning" && manualText.trim()) setMode("locked");
    onDecoded(manualText);
  };

  return (
    <div className="ox-card space-y-4 rounded-3xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--ox-ok-tint)] text-[var(--ox-ok-ink)]">
            <ScanLine className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-[var(--ox-ink)]">VietQR &amp; Guarantee Scanner</h2>
            <span className="font-mono text-[11px] text-[var(--ox-muted)]">EMVCo · BarcodeDetector</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {mode === "locked" && (
            <button type="button" onClick={() => { setErrorMsg(null); setMode("scanning"); }} className="ox-btn-avax ox-press inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs">
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Scan again</span>
            </button>
          )}
          <button type="button" onClick={() => { setErrorMsg(null); setMode((p) => (p === "idle" ? "scanning" : "idle")); }} className="ox-btn-ghost ox-press inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold">
            {mode !== "idle" ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
            <span>{mode !== "idle" ? "Disable Camera" : "Enable Camera"}</span>
          </button>
        </div>
      </div>

      {mode !== "idle" && (
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-[var(--ox-line)] bg-[#0b0f19]">
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          <div className="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2">
            <span role="status" className="inline-flex max-w-[calc(100%-84px)] items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-semibold text-white backdrop-blur-sm">
              {mode === "locked" ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#34d399]" />
              ) : (
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#3dd6c3] motion-safe:animate-ping" aria-hidden="true" />
              )}
              <span className="truncate">{mode === "locked" ? "Frame locked" : "Point camera at a VietQR or Guarantee QR code"}</span>
            </span>

            <div className="flex shrink-0 items-center gap-1.5">
              {mode === "locked" && (
                <button type="button" onClick={() => { setErrorMsg(null); setMode("scanning"); }} aria-label="Scan again" className="ox-press flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/75">
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button type="button" onClick={() => setMode("idle")} aria-label="Close camera" className="ox-press flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/75">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              <CornerBrackets locked={mode === "locked"} />
              {mode === "scanning" && (
                <span className="absolute inset-x-4 top-1/2 h-0.5 -translate-y-1/2 bg-[var(--ox-ok)] shadow-[0_0_12px_2px_var(--ox-ok)] motion-safe:animate-pulse" />
              )}
            </div>
          </div>
        </div>
      )}

      {errorMsg && <p className="ox-badge-warn rounded-2xl px-3.5 py-2.5 text-xs font-medium">{errorMsg}</p>}

      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="manual-vietqr-input" className="sr-only">EMVCo VietQR payload or guarantee code</label>
        <input id="manual-vietqr-input" type="text" value={manualText} onChange={(e) => setManualText(e.target.value)} placeholder="Paste EMVCo VietQR payload or OPX-... code" className="ox-input min-h-[44px] flex-1 rounded-xl px-3.5 py-2 font-mono text-xs" />
        <button type="button" onClick={handleDecodeManual} className="ox-btn-primary min-h-[44px] rounded-xl px-4 py-2 text-xs whitespace-nowrap">
          Decode QR
        </button>
        <button type="button" onClick={handleLoadSample} className="ox-btn-ghost ox-press inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold whitespace-nowrap">
          <Sparkles className="h-3.5 w-3.5 text-[var(--ox-avax)]" />
          <span>Load Sample VietQR</span>
        </button>
      </div>
    </div>
  );
}

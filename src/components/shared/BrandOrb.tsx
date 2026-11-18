"use client";

import { useState } from "react";

const OPALX_PALETTES: readonly [string, string, string][] = [
  ["#059669", "#047857", "#34d399"], ["#0d9488", "#0f766e", "#5eead4"],
  ["#e84142", "#991b1b", "#ff8a7a"], ["#111827", "#0b0f19", "#475569"],
  ["#1e3a8a", "#0f172a", "#60a5fa"], ["#d97706", "#92400e", "#fbbf24"],
  ["#0f766e", "#0b0f19", "#2dd4bf"], ["#be123c", "#0f172a", "#fb7185"],
];

function fnv1a32(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function opalxOrbBackground(seed: string): string {
  const h = fnv1a32((seed || "opalx").trim().toLowerCase() || "opalx");
  const [a, b, c] = OPALX_PALETTES[h % OPALX_PALETTES.length];
  const angle = (h >>> 3) % 360;
  const x = 18 + ((h >>> 11) % 64);
  const y = 14 + ((h >>> 17) % 56);
  return [
    "radial-gradient(circle at 30% 22%, rgba(255,255,255,0.36), transparent 36%)",
    `radial-gradient(circle at ${x}% ${y}%, ${c}, transparent 60%)`,
    `linear-gradient(${angle}deg, ${a}, ${b})`,
  ].join(", ");
}

export function getSeedInitials(label: string): string {
  const clean = label.trim();
  if (!clean) return "OX";
  if (/^0x[0-9a-f]{2,}/i.test(clean)) return clean.slice(2, 4).toUpperCase();
  const words = clean.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return "OX";
  const first = [...words[0]][0] ?? "";
  const second = words.length > 1 ? ([...words[1]][0] ?? "") : "";
  return (first + second).toUpperCase() || "OX";
}

function isValidLogoUrl(url?: string): url is string {
  const t = url?.trim();
  if (!t) return false;
  return (
    /^https?:\/\/\S+/i.test(t) ||
    (t.startsWith("/") && !t.startsWith("//")) ||
    /^data:image\/(?:[a-z0-9.+-]+;base64,|svg\+xml[,;])/i.test(t)
  );
}

export interface BrandOrbProps {
  seed: string;
  label?: string;
  logoUrl?: string;
  size?: number;
  className?: string;
}

export function BrandOrb({ seed, label, logoUrl, size = 40, className = "" }: BrandOrbProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = isValidLogoUrl(logoUrl) && failedUrl !== logoUrl;
  const radiusCls = className.includes("rounded-") ? "" : "rounded-xl";

  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)] ${radiusCls} ${className}`}
      style={{ width: size, height: size, background: showImage ? undefined : opalxOrbBackground(seed) }}
      aria-hidden={!label}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt={label ?? ""} onError={() => setFailedUrl(logoUrl)} className="h-full w-full object-cover" />
      ) : (
        <span className="select-none font-bold tracking-tight text-white [text-shadow:0_1px_2px_rgba(0,0,0,0.32)]" style={{ fontSize: Math.max(10, Math.round(size * 0.36)) }}>
          {getSeedInitials(label || seed)}
        </span>
      )}
    </span>
  );
}

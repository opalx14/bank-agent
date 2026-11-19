"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Cpu, QrCode, ShieldCheck } from "lucide-react";

export { PortalSheet } from "./shared.portal-sheet";

export interface SegmentedTabItem<K extends string> {
  key: K;
  label: string;
  icon?: ReactNode;
  badge?: string | number;
  dot?: boolean;
}

export function SegmentedTabs<K extends string>({
  items,
  value,
  onChange,
  ariaLabel,
  className = "",
}: {
  items: ReadonlyArray<SegmentedTabItem<K>>;
  value: K;
  onChange: (next: K) => void;
  ariaLabel: string;
  className?: string;
}) {
  const idx = Math.max(0, items.findIndex((i) => i.key === value));
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`relative grid rounded-full border border-[var(--ox-line)] bg-[var(--ox-soft)] p-1 ${className}`}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden="true"
        className="absolute top-1 bottom-1 left-1 rounded-full bg-[var(--ox-surface)] shadow-sm"
        style={{
          width: `calc((100% - 8px) / ${items.length})`,
          transform: `translateX(${idx * 100}%)`,
          transition: "transform 0.42s var(--ox-spring)",
        }}
      />
      {items.map((item) => {
        const active = item.key === value;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.key)}
            className={`ox-press relative z-10 flex min-h-[36px] min-w-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
              active ? "text-[var(--ox-ink)]" : "text-[var(--ox-muted)] hover:text-[var(--ox-ink)]"
            }`}
          >
            {item.icon}
            <span className="truncate">{item.label}</span>
            {item.badge !== undefined ? (
              <span className="rounded-full bg-[var(--ox-soft)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ox-ink)] tabular-nums">
                {item.badge}
              </span>
            ) : null}
            {item.dot ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--ox-avax)]" aria-hidden="true" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export type GuaranteeStepPhase = "idle" | "qr" | "verifying" | "guaranteed";

const STEP_META = [
  { label: "1. Payment QR", icon: QrCode },
  { label: "2. WASM Policy", icon: Cpu },
  { label: "3. Fuji Proof", icon: ShieldCheck },
] as const;

export function GuaranteeStepper({ phase }: { phase: GuaranteeStepPhase }) {
  const activeIdx = phase === "qr" ? 0 : phase === "verifying" ? 1 : phase === "guaranteed" ? 3 : -1;
  const progress = activeIdx < 0 ? 0 : activeIdx >= 3 ? 1 : activeIdx / 2;

  return (
    <div aria-label="Payment and guarantee progress" className="relative mx-auto w-full py-1">
      <span aria-hidden="true" className="absolute top-[21px] right-7 left-7 h-0.5 bg-[var(--ox-line)]" />
      <span
        aria-hidden="true"
        className="absolute top-[21px] right-7 left-7 h-0.5 origin-left bg-[var(--ox-avax)]"
        style={{ transform: `scaleX(${progress})`, transition: "transform 0.65s var(--ox-spring)" }}
      />
      <div className="relative grid grid-cols-3 gap-2">
        {STEP_META.map((step, i) => {
          const Icon = activeIdx > i ? Check : step.icon;
          const done = activeIdx > i;
          const current = activeIdx === i;
          return (
            <div key={step.label} className="flex flex-col items-center gap-1.5 text-center">
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-all ${
                  done
                    ? "border-[var(--ox-ok)] bg-[var(--ox-ok)] text-white"
                    : current
                      ? "border-[var(--ox-avax)] bg-[var(--ox-avax)] text-white shadow-md"
                      : "border-[var(--ox-line)] bg-[var(--ox-surface)] text-[var(--ox-muted)]"
                }`}
                style={{ transform: current ? "scale(1.1)" : "scale(1)", transition: "transform 0.4s var(--ox-bouncy)" }}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className={`text-[11px] font-semibold leading-tight ${done || current ? "text-[var(--ox-ink)]" : "text-[var(--ox-muted)]"}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RadialRing({
  value,
  size = 24,
  stroke = 2.6,
  danger = false,
  label,
}: {
  value: number;
  size?: number;
  stroke?: number;
  danger?: boolean;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ox-line)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={danger ? "var(--ox-avax)" : "var(--ox-ok)"}
        strokeWidth={stroke}
        strokeDasharray={`${c * clamped} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dasharray 0.55s var(--ox-spring)" }}
      />
    </svg>
  );
}

export function CountUpValue({
  value,
  format,
  duration = 550,
  className = "",
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    const start = fromRef.current;
    if (start === value) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      fromRef.current = value;
      setShown(value);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const eased = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
      setShown(start + (value - start) * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); fromRef.current = value; };
  }, [value, duration]);

  return <span className={`tabular-nums ${className}`}>{format ? format(shown) : Math.round(shown)}</span>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Box, Layers, Loader2 } from "lucide-react";
import type { PortalRole } from "@/types";
import { RoleFanStage } from "./auth.role-fan-stage";

type ArenaActor = "overview" | "nexus" | "enterprise" | "client" | "bank";

interface Nexus3dStageProps {
  activeRole: PortalRole;
  onSelectRole?: (role: PortalRole) => void;
  enterpriseName?: string;
  holderLabel?: string;
  bankLabel?: string;
}

const CONTEXT_ACTION: Partial<Record<ArenaActor, { badge: string; label: string; href: string; dot: string }>> = {
  bank: {
    badge: "Bank Rail · NAPAS 247",
    label: "Open Bank Portal",
    href: "/bank",
    dot: "bg-sky-400",
  },
  nexus: {
    badge: "Avalanche Fuji (43113)",
    label: "Inspect Fuji Infrastructure",
    href: "/?tab=fuji",
    dot: "bg-[var(--ox-avax)]",
  },
};

export function Nexus3dStage({
  activeRole,
  onSelectRole,
  enterpriseName,
  holderLabel,
  bankLabel,
}: Nexus3dStageProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [focusedActor, setFocusedActor] = useState<ArenaActor>("overview");

  // Always lock the 3D Avalanche Nexus arena to night/dark mode for crisp contrast
  useEffect(() => {
    const prefersReduced =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) setViewMode("2d");
    setIframeSrc(`/opalx-nexus-3d.html?embed=1&theme=dark&role=${activeRole}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Celebrate active character when user switches Personal / Enterprise tab on homepage
  useEffect(() => {
    if (!ready) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "opalx:highlight-role", role: activeRole },
      window.location.origin,
    );
  }, [activeRole, ready]);

  // Listen to 3D ready signal & character click selections
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; actor?: ArenaActor } | null;
      if (!data || typeof data !== "object") return;
      if (data.type === "opalx:ready") {
        setReady(true);
      } else if (data.type === "opalx:select-actor" && data.actor) {
        setFocusedActor(data.actor);
        if (data.actor === "client") onSelectRole?.("CUSTOMER");
        else if (data.actor === "enterprise") onSelectRole?.("ENTERPRISE");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onSelectRole]);

  const contextAction = CONTEXT_ACTION[focusedActor];

  if (viewMode === "2d") {
    return (
      <div className="flex w-full flex-col items-center">
        <RoleFanStage
          activeRole={activeRole}
          onSelectRole={onSelectRole}
          enterpriseName={enterpriseName}
          holderLabel={holderLabel}
          bankLabel={bankLabel}
        />
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-xs text-[var(--ox-muted)]">
          <span className="font-mono text-[11px]">Click card to switch role · Fuji 43113 · 0 PII</span>
          <button
            type="button"
            onClick={() => {
              setReady(false);
              setViewMode("3d");
            }}
            className="ox-btn-ghost inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold text-[var(--ox-ink)]"
          >
            <Box className="h-3.5 w-3.5 text-[var(--ox-avax)]" />
            <span>Open 3D Arena</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      <div
        className="relative h-[410px] w-full overflow-hidden rounded-[28px] border border-[var(--ox-line)] bg-[#070b15] shadow-[0_24px_64px_-24px_rgba(11,15,25,0.34)] transition-colors sm:h-[490px] lg:h-[580px]"
      >
        {iframeSrc ? (
          <iframe
            ref={iframeRef}
            src={iframeSrc}
            title="OpalX GO 3-Party Avalanche Nexus 3D Arena"
            className={`h-full w-full border-0 transition-opacity duration-500 ${ready ? "opacity-100" : "opacity-0"}`}
            allow="accelerometer; autoplay"
          />
        ) : null}

        {!ready ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2.5 text-xs font-medium text-[var(--ox-muted)]">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--ox-avax)]" />
            <span>Loading 3D Avalanche Nexus Arena...</span>
          </div>
        ) : null}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1">
        {contextAction ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[var(--ox-ink)]">
              <span className={`h-2 w-2 rounded-full ${contextAction.dot}`} />
              <span>{contextAction.badge}</span>
            </span>
            <Link
              href={contextAction.href}
              className="ox-btn-primary inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold"
            >
              <span>{contextAction.label}</span>
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        ) : (
          <p className="font-mono text-[11px] text-[var(--ox-muted)]">
            Drag to orbit 360° · Click Client, Enterprise, Bank, or Avalanche Nexus
          </p>
        )}

        <button
          type="button"
          onClick={() => setViewMode("2d")}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--ox-line)] bg-[var(--ox-surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--ox-muted)] transition-colors hover:text-[var(--ox-ink)]"
        >
          <Layers className="h-3 w-3" />
          <span>2D Pass View</span>
        </button>
      </div>
    </div>
  );
}

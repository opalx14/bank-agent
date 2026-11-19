"use client";

import type { CSSProperties } from "react";
import { BankAgentLogo } from "./BankAgentLogo";
import { formatVnd } from "./formatters";

export type GuaranteePassVariant = "jade" | "crimson" | "obsidian";

export interface OpalxGuaranteePassProps {
  variant?: GuaranteePassVariant;
  enterpriseName: string;
  packageName: string;
  amountVnd?: number;
  guaranteeId?: string;
  holderLabel?: string;
  bankLabel?: string;
  statusLabel: string;
  solidState?: boolean;
  stamped?: boolean;
  stampTitle?: string;
  stampSub?: string;
  scanning?: boolean;
  typing?: boolean;
  shine?: "none" | "once" | "loop";
  tilt?: boolean;
  burstKey?: number;
  txRef?: string;
  className?: string;
}

const RINGS = Array.from({ length: 6 }, (_, k) => ({
  r: 26 + k * 21,
  dash: `${(1.2 + k * 0.5).toFixed(1)} ${(2.4 + k * 0.9).toFixed(1)}`,
}));

const WAVES = (() => {
  const half = 8 * Math.PI;
  let d = "";
  for (let j = 0; j < 5; j++) {
    const y = 162 + j * 2.6;
    let x = -((j * 0.9 * 8) % (2 * half)) - half;
    d += `M${x.toFixed(1)} ${y}Q${(x + half / 2).toFixed(1)} ${(y - 5.2).toFixed(1)} ${(x + half).toFixed(1)} ${y}`;
    for (x += half; x < 342 + half; x += half) d += `T${(x + half).toFixed(1)} ${y}`;
  }
  return d;
})();

const fill44 = (v: string) => `${v}${"<".repeat(44)}`.slice(0, 44);
const toAscii = (v: string) =>
  v
    .replace(/[đĐ]/g, "D")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "<");

export function OpalxGuaranteePass({
  variant = "jade",
  enterpriseName,
  packageName,
  amountVnd,
  guaranteeId = "OPX-PENDING",
  holderLabel = "OpalX Cardholder",
  bankLabel = "NAPAS 247",
  statusLabel,
  solidState = false,
  stamped = false,
  stampTitle = "VERIFIED",
  stampSub = "FUJI 43113",
  scanning = false,
  typing = false,
  shine = "none",
  tilt = false,
  burstKey = 0,
  txRef = "0x43113",
  className = "",
}: OpalxGuaranteePassProps) {
  const variantCls =
    variant === "crimson" ? "ox-sec-crimson" : variant === "obsidian" ? "ox-sec-obsidian" : "ox-sec-jade";
  const initial = (enterpriseName.replace(/[^a-zA-Z0-9]/g, "").slice(0, 2) || "OX").toUpperCase();
  const mrz1 = fill44(`OPX<AVAX<${toAscii(enterpriseName)}<<${toAscii(guaranteeId)}`);
  const mrz2 = fill44(`FUJI<43113<<${toAscii(txRef)}<<0PII<VERIFIED`);

  return (
    <div className={`ox-sec-card ${className}`}>
      <div className={`ox-sec-face ${variantCls}${tilt ? " is-tilted" : ""}`}>
        <svg aria-hidden="true" className="ox-sec-pattern" viewBox="0 0 342 216" preserveAspectRatio="none">
          <g className="ox-sec-rings" fill="none" stroke="var(--c-pat)" strokeWidth=".6" style={{ opacity: "var(--c-pat-op)" } as CSSProperties}>
            {RINGS.map((r) => (
              <circle key={r.r} cx="296" cy="92" r={r.r} strokeDasharray={r.dash} />
            ))}
          </g>
          <path d={WAVES} fill="none" stroke="var(--c-pat)" strokeWidth=".55" style={{ opacity: "var(--c-wave-op)" } as CSSProperties} />
        </svg>

        <div className="ox-sec-head">
          <BankAgentLogo
            variant="mark"
            theme="dark"
            decorative
            style={{ width: "calc(var(--u) * 20)", height: "calc(var(--u) * 20)" }}
          />
          <span className="ox-sec-mono ox-sec-brand">OPALX GO</span>
          <span className={`ox-sec-mono ox-sec-state ${solidState ? "ox-sec-state-solid" : ""}`}>
            {statusLabel}
          </span>
        </div>

        <div className="ox-sec-badge" aria-hidden="true">
          {initial}
        </div>

        <div className={`ox-sec-who ${stamped ? "ox-sec-who-stamped" : ""}`}>
          <span className="ox-sec-title">{enterpriseName}</span>
          <span className="ox-sec-sub">{packageName}</span>
          {amountVnd !== undefined ? (
            <span className="ox-sec-mono ox-sec-amt">{formatVnd(amountVnd)}</span>
          ) : null}
        </div>

        <div className="ox-sec-fields">
          <div className="ox-sec-field">
            <span className="ox-sec-mono ox-sec-fk">CARD ID</span>
            <span className="ox-sec-mono ox-sec-fv">{guaranteeId}</span>
          </div>
          <div className="ox-sec-field">
            <span className="ox-sec-mono ox-sec-fk">HOLDER</span>
            <span className="ox-sec-fv">{holderLabel}</span>
          </div>
          <div className="ox-sec-field">
            <span className="ox-sec-mono ox-sec-fk">SETTLEMENT RAIL</span>
            <span className="ox-sec-mono ox-sec-fv">{bankLabel}</span>
          </div>
        </div>

        <div className="ox-sec-mono ox-sec-mrz" aria-hidden="true">
          <div>{mrz1}</div>
          <div className={typing ? "ox-sec-typing" : ""}>{mrz2}</div>
        </div>

        {stamped ? (
          <div className="ox-sec-mono ox-sec-stamp">
            <span className="ox-sec-stamp-main">{stampTitle}</span>
            <span className="ox-sec-stamp-sub">{stampSub}</span>
          </div>
        ) : null}

        {scanning ? <div className="ox-sec-scan" aria-hidden="true" /> : null}
        {shine !== "none" ? (
          <div aria-hidden="true" className={`ox-sec-shine ${shine === "loop" ? "ox-sec-shine-loop" : "ox-sec-shine-once"}`} />
        ) : null}
      </div>

      {burstKey > 0 ? (
        <span className="ox-burst" key={burstKey} aria-hidden="true">
          {Array.from({ length: 12 }, (_, i) => (
            <i
              key={i}
              style={{
                "--a": `${i * 30}deg`,
                "--d": `${46 + (i % 3) * 18}px`,
                background: i % 2 === 0 ? "var(--ox-avax)" : "var(--ox-ok)",
                animationDelay: `${(i % 4) * 25}ms`,
              } as CSSProperties}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}

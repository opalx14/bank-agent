"use client";

import { OpalxGuaranteePass } from "@/components/shared/OpalxGuaranteePass";
import type { PortalRole } from "@/types";

interface RoleFanStageProps {
  activeRole: PortalRole;
  onSelectRole?: (role: PortalRole) => void;
  enterpriseName?: string;
  holderLabel?: string;
  bankLabel?: string;
}

const SLOTS_BY_ACTIVE: Record<PortalRole, Record<PortalRole, { cls: string; z: string }>> = {
  CUSTOMER: {
    CUSTOMER: { cls: "translate-x-0 translate-y-0 rotate-[-1deg] scale-[0.94] opacity-100", z: "z-30" },
    ENTERPRISE: { cls: "-translate-x-[18%] translate-y-[15%] -rotate-[12deg] scale-[0.72] opacity-80 hover:opacity-100", z: "z-20" },
    BANK: { cls: "translate-x-[19%] translate-y-[16%] rotate-[11deg] scale-[0.72] opacity-80 hover:opacity-100", z: "z-10" },
  },
  ENTERPRISE: {
    ENTERPRISE: { cls: "translate-x-0 translate-y-0 rotate-[-1deg] scale-[0.94] opacity-100", z: "z-30" },
    CUSTOMER: { cls: "-translate-x-[18%] translate-y-[15%] -rotate-[12deg] scale-[0.72] opacity-80 hover:opacity-100", z: "z-20" },
    BANK: { cls: "translate-x-[19%] translate-y-[16%] rotate-[11deg] scale-[0.72] opacity-80 hover:opacity-100", z: "z-10" },
  },
  BANK: {
    BANK: { cls: "translate-x-0 translate-y-0 rotate-[-1deg] scale-[0.94] opacity-100", z: "z-30" },
    CUSTOMER: { cls: "-translate-x-[18%] translate-y-[15%] -rotate-[12deg] scale-[0.72] opacity-80 hover:opacity-100", z: "z-20" },
    ENTERPRISE: { cls: "translate-x-[19%] translate-y-[16%] rotate-[11deg] scale-[0.72] opacity-80 hover:opacity-100", z: "z-10" },
  },
};

export function RoleFanStage({
  activeRole,
  onSelectRole,
  enterpriseName,
  holderLabel,
  bankLabel,
}: RoleFanStageProps) {
  const slots = SLOTS_BY_ACTIVE[activeRole];

  const cards: Array<{
    role: PortalRole;
    variant: "jade" | "crimson" | "obsidian";
    title: string;
    pkg: string;
    id: string;
    holder: string;
    bank: string;
    status: string;
    stamp: string;
    delay: string;
  }> = [
    {
      role: "CUSTOMER",
      variant: "jade",
      title: activeRole === "CUSTOMER" && enterpriseName ? enterpriseName : "Bank Agent Member",
      pkg: "VietQR Checkout & Guarantee Pass",
      id: "OPX-MEMBER",
      holder: activeRole === "CUSTOMER" && holderLabel ? holderLabel : "member@gmail.com",
      bank: "VIETQR · FUJI",
      status: "PERSONAL",
      stamp: "VERIFIED",
      delay: "0s",
    },
    {
      role: "ENTERPRISE",
      variant: "crimson",
      title: activeRole === "ENTERPRISE" && enterpriseName ? enterpriseName : "Partner Enterprise",
      pkg: "Merchant Smart Contract · Passes & VietQR",
      id: "MERCHANT-KYB",
      holder: activeRole === "ENTERPRISE" && holderLabel ? holderLabel : "founder@company.com",
      bank: "NAPAS 247 · A2A",
      status: "ENTERPRISE",
      stamp: "SMART CONTRACT",
      delay: "-2.2s",
    },
    {
      role: "BANK",
      variant: "obsidian",
      title: activeRole === "BANK" && bankLabel ? bankLabel : "MB Bank (970422)",
      pkg: "VietQR Audits · PolicyVault Fuji",
      id: "BANK-AUDITOR",
      holder: activeRole === "BANK" && holderLabel ? holderLabel : "NAPAS Auditor",
      bank: "NAPAS 247",
      status: "BANK",
      stamp: "AUDITED",
      delay: "-4.1s",
    },
  ];

  return (
    <div className="relative mx-auto flex min-h-[300px] w-full max-w-[440px] items-center justify-center py-6 sm:min-h-[360px]">
      <svg aria-hidden="true" viewBox="0 0 400 400" className="pointer-events-none absolute inset-0 m-auto h-[340px] w-[340px] opacity-[0.14] sm:h-[400px] sm:w-[400px]">
        <g className="ox-fan-rot" fill="none" stroke="currentColor" strokeWidth="1">
          {Array.from({ length: 6 }, (_, k) => (
            <circle key={k} cx="200" cy="200" r={62 + k * 26} strokeDasharray={`${(2 + k * 0.7).toFixed(1)} ${4 + k}`} />
          ))}
        </g>
      </svg>

      <div className="relative aspect-[342/216] w-[min(320px,84vw)] sm:w-[342px]">
        {cards.map((c) => {
          const isFront = c.role === activeRole;
          const slot = slots[c.role];
          const clickable = Boolean(onSelectRole) && !isFront;
          return (
            <div
              key={c.role}
              onClick={() => clickable && onSelectRole?.(c.role)}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              aria-label={clickable ? `Switch to ${c.status} role` : undefined}
              onKeyDown={(e) => {
                if (clickable && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onSelectRole?.(c.role);
                }
              }}
              className={`absolute inset-0 transition-all duration-500 ease-[cubic-bezier(0.2,0.9,0.25,1.1)] ${slot.z} ${slot.cls} ${clickable ? "cursor-pointer" : ""}`}
            >
              <div className="ox-fan-float h-full w-full" style={{ animationDelay: c.delay }}>
                <OpalxGuaranteePass
                  variant={c.variant}
                  shine={isFront ? "loop" : "none"}
                  tilt={isFront}
                  enterpriseName={c.title}
                  packageName={c.pkg}
                  guaranteeId={c.id}
                  holderLabel={c.holder}
                  bankLabel={c.bank}
                  statusLabel={c.status}
                  stamped
                  stampTitle={c.stamp}
                  stampSub="FUJI 43113"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
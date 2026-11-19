"use client";

import { Landmark, Layers, ShieldCheck, Sparkles, Store } from "lucide-react";
import type { EnterpriseServicePackage, VerifiedEnterpriseProfile } from "@/types";
import { BrandOrb } from "@/components/shared/shared.brand-orb";
import { formatVnd } from "@/components/shared/shared.formatters";

export const DEFAULT_PARTNER_IDS = new Set([
  "california-fitness",
  "opalx-roastery",
  "mekong-agro",
  "saigon-medequip",
]);

interface MerchantPackagePickerProps {
  enterprises: VerifiedEnterpriseProfile[];
  categories: string[];
  categoryFilter: string;
  onCategoryChange: (cat: string) => void;
  selectedEnt: VerifiedEnterpriseProfile | null;
  onSelectEnterprise: (ent: VerifiedEnterpriseProfile) => void;
  activePackages: EnterpriseServicePackage[];
  selectedPkg: EnterpriseServicePackage | null;
  onSelectPackage: (pkgId: string) => void;
  lockedEnterprise?: boolean;
}

export function MerchantPackagePicker({
  enterprises,
  categories,
  categoryFilter,
  onCategoryChange,
  selectedEnt,
  onSelectEnterprise,
  activePackages,
  selectedPkg,
  onSelectPackage,
  lockedEnterprise = false,
}: MerchantPackagePickerProps) {
  return (
    <div className="space-y-5">
      <section className="space-y-3" aria-label="Issuing Partners">
        <div className="flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--ox-ink)]">
            <Store className="h-4 w-4 text-[var(--ox-avax)]" />
            <span>{lockedEnterprise ? "Issuing Partner" : "Issuing Partners"}</span>
          </h2>
          {!lockedEnterprise ? (
            <span className="font-mono text-xs font-semibold text-[var(--ox-ok-ink)] tabular-nums">
              {enterprises.length} partners
            </span>
          ) : null}
        </div>

        {lockedEnterprise && selectedEnt ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--ox-ink)] bg-[var(--ox-surface)] p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <BrandOrb seed={selectedEnt.id || selectedEnt.enterpriseName} label={selectedEnt.enterpriseName} logoUrl={selectedEnt.logoImageUrl} size={40} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--ox-ink)]">{selectedEnt.enterpriseName}</p>
                <p className="truncate text-xs text-[var(--ox-muted)]">{selectedEnt.categoryLabel} · {selectedEnt.bankShortName} {selectedEnt.accountNo}</p>
              </div>
            </div>
            {selectedEnt.kybVerified && (
              <span className="ox-badge-verified inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold">
                <ShieldCheck className="h-3 w-3" /><span>KYB</span>
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
              {["ALL", ...categories].map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => onCategoryChange(cat)}
                  className={`ox-press min-h-[34px] shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                    categoryFilter === cat ? "ox-pill-active" : "ox-btn-ghost"
                  }`}
                >
                  {cat === "ALL" ? "All" : cat}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {enterprises.map((ent) => {
                const isCustom = !DEFAULT_PARTNER_IDS.has(ent.id);
                const selected = selectedEnt?.id === ent.id;
                const openPkgCount = ent.packages.filter((p) => p.active).length;

                return (
                  <button
                    key={ent.id}
                    type="button"
                    onClick={() => onSelectEnterprise(ent)}
                    aria-pressed={selected}
                    className={`ox-press flex flex-col items-start gap-2.5 rounded-2xl border p-3.5 text-left transition-all ${
                      selected
                        ? "border-[var(--ox-ink)] bg-[var(--ox-surface)] shadow-sm ring-1 ring-[var(--ox-ink)]"
                        : "ox-subcard hover:border-[var(--ox-muted)]/40 hover:bg-[var(--ox-surface)]"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <BrandOrb seed={ent.id || ent.enterpriseName} label={ent.enterpriseName} logoUrl={ent.logoImageUrl} size={36} />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-[var(--ox-ink)]">{ent.enterpriseName}</p>
                          <p className="truncate text-[11px] text-[var(--ox-muted)]">{ent.categoryLabel}</p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {isCustom && (
                          <span className="ox-badge-avax inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                            <Sparkles className="h-2.5 w-2.5" /><span>New</span>
                          </span>
                        )}
                        {ent.kybVerified && (
                          <span className="ox-badge-verified inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold">
                            <ShieldCheck className="h-3 w-3" /><span>KYB</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex w-full items-center justify-between border-t border-[var(--ox-line)] pt-2 text-[11px]">
                      <span className="inline-flex min-w-0 items-center gap-1.5 text-[var(--ox-ink)]">
                        <Landmark className="h-3 w-3 shrink-0 text-[var(--ox-ok)]" />
                        <span className="truncate font-mono tabular-nums">{ent.bankShortName} · {ent.accountNo}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-[var(--ox-muted)] tabular-nums">{openPkgCount} packages</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="space-y-2.5" aria-label="Select Service Package">
        <div className="flex items-center justify-between gap-2">
          <h2 className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--ox-ink)]">
            <Layers className="h-4 w-4 text-[var(--ox-ok-ink)]" />
            <span>Select Service Package</span>
          </h2>
          <span className="font-mono text-xs text-[var(--ox-muted)] tabular-nums">{activePackages.length} packages</span>
        </div>

        {activePackages.length === 0 ? (
          <div className="ox-subcard rounded-2xl border-dashed p-5 text-center text-xs text-[var(--ox-muted)]">
            No active service packages available.
          </div>
        ) : (
          <div role="radiogroup" aria-label="Select Service Package" className="divide-y divide-[var(--ox-line)] overflow-hidden rounded-2xl border border-[var(--ox-line)] bg-[var(--ox-surface)]">
            {activePackages.map((pkg) => {
              const selected = selectedPkg?.id === pkg.id;
              const pkgBenefits = pkg.benefits?.length ? pkg.benefits : pkg.guaranteeRightLabel ? [pkg.guaranteeRightLabel] : [];
              return (
                <button
                  key={pkg.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSelectPackage(pkg.id)}
                  className={`flex min-h-[60px] w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors ${
                    selected ? "bg-[var(--ox-soft)]" : "hover:bg-[var(--ox-soft)]/55"
                  }`}
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${selected ? "border-[var(--ox-ok)] bg-[var(--ox-ok)]" : "border-[var(--ox-line)] bg-[var(--ox-surface)]"}`}>
                      {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </span>
                    {pkg.imageDataUrl && <img src={pkg.imageDataUrl} alt={pkg.label} className="h-11 w-11 shrink-0 rounded-lg border border-[var(--ox-line)] object-cover" />}
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-semibold text-[var(--ox-ink)]">{pkg.label}</p>
                      <p className="text-xs text-[var(--ox-muted)]">{pkg.durationLabel}</p>
                      {pkgBenefits.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {pkgBenefits.map((b) => (
                            <span key={b} className="ox-badge-verified rounded-full px-2 py-0.5 text-[10px] font-medium">{b}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold text-[var(--ox-ok-ink)] tabular-nums">{formatVnd(pkg.amountVnd)}</span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

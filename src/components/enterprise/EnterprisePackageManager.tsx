"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Award, CheckCircle2, Trash2 } from "lucide-react";
import type { VerifiedEnterpriseProfile } from "@/types";
import { formatVnd } from "@/components/shared/formatters";
import { EnterprisePackageForm } from "./EnterprisePackageForm";

interface EnterprisePackageManagerProps {
  enterprise: VerifiedEnterpriseProfile;
  onUpdated: () => Promise<void> | void;
}

export function EnterprisePackageManager({ enterprise, onUpdated }: EnterprisePackageManagerProps) {
  const [busyPkgId, setBusyPkgId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    setErrorMsg(null);
    setStatusMsg(null);
  }, [enterprise.id]);

  const activeCount = enterprise.packages.filter((p) => p.active).length;

  const postAction = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/enterprises", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Thao tác thất bại (${res.status})`);
    await onUpdated();
  };

  const handleToggle = async (packageId: string, active: boolean) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setBusyPkgId(packageId);
    try {
      await postAction({ action: "TOGGLE_PACKAGE", enterpriseId: enterprise.id, packageId, active });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Không thể đổi trạng thái gói.");
    } finally {
      setBusyPkgId(null);
    }
  };

  const handleDelete = async (packageId: string, pkgName: string) => {
    setErrorMsg(null);
    setStatusMsg(null);
    setBusyPkgId(packageId);
    try {
      await postAction({ action: "DELETE_PACKAGE", enterpriseId: enterprise.id, packageId });
      setStatusMsg(`Đã xóa gói "${pkgName}".`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Không thể xóa gói dịch vụ.");
    } finally {
      setBusyPkgId(null);
    }
  };

  return (
    <section className="ox-card-glow space-y-4 rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-[var(--ox-ink)] sm:text-base">
            Hệ Thống Gói Dịch Vụ &amp; Quyền Lợi Bảo Chứng
          </h2>
          <p className="mt-1 text-xs text-[var(--ox-muted)]">
            Gói đang mở bán tự động đồng bộ sang ứng dụng Khách hàng OpalX GO &amp; PolicyVault Avalanche Fuji.
          </p>
        </div>
        <span className="ox-badge-verified inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] font-semibold tabular-nums">
          <span>Đang mở bán:</span>
          <span>{activeCount}/{enterprise.packages.length} gói</span>
        </span>
      </div>

      <EnterprisePackageForm
        enterpriseId={enterprise.id}
        onError={setErrorMsg}
        onSuccess={async (msg) => {
          setStatusMsg(msg);
          await onUpdated();
        }}
      />

      {errorMsg && (
        <div role="alert" className="ox-badge-avax flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {statusMsg && (
        <div role="status" className="ox-badge-verified flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {enterprise.packages.length === 0 ? (
        <p className="ox-subcard rounded-xl border-dashed py-7 text-center text-xs text-[var(--ox-muted)]">
          Chưa có gói dịch vụ nào. Thêm gói ở trên để đồng bộ sang ứng dụng Khách hàng OpalX GO.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {enterprise.packages.map((pkg) => {
            const busy = busyPkgId === pkg.id;
            return (
              <article
                key={pkg.id}
                className="ox-subcard flex flex-col justify-between gap-2.5 rounded-2xl p-3.5 text-xs transition-colors"
              >
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    {pkg.imageDataUrl ? (
                      <img
                        src={pkg.imageDataUrl}
                        alt={pkg.label}
                        className="h-12 w-12 shrink-0 rounded-xl border border-[var(--ox-line)] object-cover"
                      />
                    ) : null}
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className={`font-bold ${pkg.active ? "text-[var(--ox-ink)]" : "text-[var(--ox-muted)] line-through"}`}>
                        {pkg.label}
                      </p>
                      <p className="text-[11px] text-[var(--ox-muted)]">{pkg.durationLabel}</p>
                      {pkg.guaranteeRightLabel && (
                        <span className="ox-badge-info inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold">
                          <Award className="h-3 w-3" />
                          <span className="truncate">{pkg.guaranteeRightLabel}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold text-[var(--ox-ink)] tabular-nums">
                    {formatVnd(pkg.amountVnd)}
                  </span>
                </div>

                {pkg.benefits && pkg.benefits.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 border-t border-[var(--ox-line)] pt-2">
                    {pkg.benefits.map((benefit) => (
                      <span
                        key={benefit}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--ox-line)] bg-[var(--ox-surface)] px-2 py-0.5 text-[11px] text-[var(--ox-ink)]"
                      >
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-[var(--ox-ok-ink)]" />
                        <span>{benefit}</span>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-[var(--ox-line)] pt-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleToggle(pkg.id, !pkg.active)}
                    className={`min-h-[32px] rounded-lg border px-2.5 py-1 font-semibold transition-colors disabled:opacity-50 ${
                      pkg.active
                        ? "ox-badge-verified"
                        : "border-[var(--ox-line)] bg-[var(--ox-surface)] text-[var(--ox-muted)] hover:text-[var(--ox-ink)]"
                    }`}
                  >
                    {pkg.active ? "Đang mở bán" : "Tạm ẩn"}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDelete(pkg.id, pkg.label)}
                    aria-label={`Xóa gói ${pkg.label}`}
                    className="rounded-lg p-1.5 text-[var(--ox-muted)] transition-colors hover:bg-[var(--ox-avax-tint)] hover:text-[var(--ox-avax-ink)] disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

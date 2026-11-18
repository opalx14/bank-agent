"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, FileCheck2, Sparkles, X } from "lucide-react";
import { BrandOrb } from "@/components/shared/BrandOrb";
import { OpalxGuaranteePass } from "@/components/shared/OpalxGuaranteePass";
import { PortalSheet } from "@/components/shared/ui-kit";
import type { GuaranteeCertificate, GuaranteeRightKind } from "@/types";
import { GuaranteePassCardItem } from "./GuaranteePassCardItem";

interface GuaranteeCategoryVaultProps {
  guarantees: GuaranteeCertificate[];
  userEmail?: string;
  highlightedGuaranteeId?: string;
  onGuaranteeUpdated?: (updated: GuaranteeCertificate) => void;
  onSwitchToCheckout?: () => void;
}

export function GuaranteeCategoryVault({
  guarantees,
  userEmail,
  highlightedGuaranteeId,
  onGuaranteeUpdated,
  onSwitchToCheckout,
}: GuaranteeCategoryVaultProps) {
  const [items, setItems] = useState<GuaranteeCertificate[]>(guarantees);
  const normalizedEmail = userEmail?.trim().toLowerCase() ?? "";
  const [selectedEnterprise, setSelectedEnterprise] = useState<string>("ALL");
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [modalGuarantee, setModalGuarantee] = useState<GuaranteeCertificate | null>(null);
  const [claimingKey, setClaimingKey] = useState<string | null>(null);
  const [claimNotice, setClaimNotice] = useState<{ kind: "error" | "ok"; text: string } | null>(null);

  useEffect(() => { setItems(guarantees); }, [guarantees]);
  useEffect(() => { if (highlightedGuaranteeId) setSelectedEnterprise("ALL"); }, [highlightedGuaranteeId]);

  const myGuarantees = useMemo(
    () =>
      items.filter(
        (g) =>
          (normalizedEmail && g.buyerEmail?.trim().toLowerCase() === normalizedEmail) ||
          (highlightedGuaranteeId && g.guaranteeId.toLowerCase() === highlightedGuaranteeId.toLowerCase()),
      ),
    [items, normalizedEmail, highlightedGuaranteeId],
  );

  useEffect(() => {
    if (typeof window === "undefined" || myGuarantees.length === 0) return;
    let cancelled = false;
    const origin = window.location.origin;
    void Promise.all(
      myGuarantees.map(async (g) => [g.guaranteeId, await QRCode.toDataURL(`${origin}${g.verifyPath}`, { width: 240, margin: 1 }).catch(() => "")] as const),
    ).then((pairs) => {
      if (cancelled) return;
      const next: Record<string, string> = {};
      for (const [id, url] of pairs) if (url) next[id] = url;
      setQrMap(next);
    });
    return () => { cancelled = true; };
  }, [myGuarantees]);

  const enterpriseStats = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number }>();
    for (const g of myGuarantees) {
      const name = g.enterpriseName?.trim() || "Đối tác OpalX";
      const prev = map.get(name) ?? { id: g.enterpriseId || name, name, count: 0 };
      prev.count += 1;
      map.set(name, prev);
    }
    return Array.from(map.values());
  }, [myGuarantees]);

  const filtered = useMemo(
    () => (selectedEnterprise === "ALL" ? myGuarantees : myGuarantees.filter((g) => (g.enterpriseName?.trim() || "Đối tác OpalX") === selectedEnterprise)),
    [myGuarantees, selectedEnterprise],
  );

  const handleClaimRight = async (guaranteeId: string, kind: GuaranteeRightKind) => {
    setClaimingKey(`${guaranteeId}:${kind}`);
    setClaimNotice(null);
    try {
      const res = await fetch(`/api/guarantees/${encodeURIComponent(guaranteeId)}/rights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ...(normalizedEmail ? { email: normalizedEmail } : {}) }),
      });
      const json = (await res.json().catch(() => ({}))) as { guarantee?: GuaranteeCertificate; claim?: { label: string }; error?: string };
      if (!res.ok || !json.guarantee) throw new Error(json.error ?? `Không thể xác thực quyền lợi (${res.status})`);
      const updated = json.guarantee;
      setItems((prev) => prev.map((g) => (g.guaranteeId === updated.guaranteeId ? updated : g)));
      onGuaranteeUpdated?.(updated);
      setClaimNotice({ kind: "ok", text: `Đã ký "${json.claim?.label ?? kind}" · ${updated.guaranteeId}.` });
    } catch (err) {
      setClaimNotice({ kind: "error", text: err instanceof Error ? err.message : "Lỗi ký quyền bảo chứng." });
    } finally { setClaimingKey(null); }
  };

  const modalEntName = modalGuarantee?.enterpriseName?.trim() || "Đối tác OpalX";
  const modalIsLive = Boolean(modalGuarantee && !modalGuarantee.sandbox && modalGuarantee.proofBundle.mode === "LIVE_FUJI_AVAX");
  const modalStatusLabel = modalGuarantee?.railMode === "LIVE_BANK" && !modalGuarantee.sandbox ? "[LIVE BANK]" : "[SANDBOX]";

  return (
    <section aria-label="Thẻ và Chứng thư của tôi" className="space-y-4">
      <div className="ox-card flex flex-wrap items-center justify-between gap-3 rounded-3xl px-4 py-3.5">
        <div className="flex items-center gap-2 text-xs font-medium text-[var(--ox-muted)]">
          <FileCheck2 className="h-4 w-4 text-[var(--ox-ok-ink)]" />
          <span>Tài khoản <strong className="font-mono text-[var(--ox-ink)]">{userEmail}</strong></span>
        </div>
        <span className="font-mono text-xs text-[var(--ox-muted)] tabular-nums"><strong className="text-[var(--ox-ink)]">{filtered.length}</strong> thẻ của bạn</span>
      </div>

      {enterpriseStats.length > 1 && (
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          <button type="button" onClick={() => setSelectedEnterprise("ALL")} className={`ox-press min-h-[36px] shrink-0 rounded-full px-3.5 py-1 text-xs font-semibold tabular-nums ${selectedEnterprise === "ALL" ? "ox-pill-active" : "ox-btn-ghost"}`}>
            Tất cả · {myGuarantees.length}
          </button>
          {enterpriseStats.map((ent) => (
            <button key={ent.name} type="button" onClick={() => setSelectedEnterprise(selectedEnterprise === ent.name ? "ALL" : ent.name)} className={`ox-press inline-flex min-h-[36px] shrink-0 items-center gap-2 rounded-full py-1 pr-3 pl-1.5 text-xs font-semibold tabular-nums ${selectedEnterprise === ent.name ? "ox-pill-active" : "ox-btn-ghost"}`}>
              <BrandOrb seed={ent.id} label={ent.name} size={24} className="rounded-full" />
              <span>{ent.name}</span>
              <span className="font-mono text-[10px] opacity-75">{ent.count}</span>
            </button>
          ))}
        </div>
      )}

      {claimNotice && (
        <div role={claimNotice.kind === "error" ? "alert" : "status"} className={`flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-medium ${claimNotice.kind === "error" ? "ox-badge-avax" : "ox-badge-verified"}`}>
          <CheckCircle2 className="h-4 w-4 shrink-0" /><span>{claimNotice.text}</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="ox-card flex flex-col items-center justify-center gap-3 rounded-3xl border-dashed px-5 py-12 text-center">
          <Sparkles className="h-6 w-6 text-[var(--ox-muted)]" />
          <p className="max-w-md text-sm text-[var(--ox-muted)]">Bạn chưa có thẻ bảo chứng nào.</p>
          {onSwitchToCheckout && (
            <button type="button" onClick={onSwitchToCheckout} className="ox-btn-primary min-h-[42px] rounded-xl px-5 py-2 text-xs">
              Mua gói ngay
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {filtered.map((g) => (
            <GuaranteePassCardItem key={g.guaranteeId} guarantee={g} qrDataUrl={qrMap[g.guaranteeId]} isHighlighted={highlightedGuaranteeId?.toLowerCase() === g.guaranteeId.toLowerCase()} claimingKey={claimingKey} onOpenQr={setModalGuarantee} onClaimRight={handleClaimRight} />
          ))}
        </div>
      )}

      <PortalSheet open={Boolean(modalGuarantee)} onClose={() => setModalGuarantee(null)} title={modalGuarantee ? `QR Check-in · ${modalGuarantee.guaranteeId}` : undefined}>
        {modalGuarantee && (
          <div className="space-y-4 text-center">
            <div className="flex items-center justify-between gap-2 text-left">
              <div className="flex min-w-0 items-center gap-2.5">
                <BrandOrb seed={modalGuarantee.enterpriseId || modalEntName} label={modalEntName} size={34} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-[var(--ox-ink)]">{modalEntName}</p>
                  <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tabular-nums ${modalStatusLabel === "[LIVE BANK]" ? "ox-badge-verified" : "ox-badge-warn"}`}>{modalStatusLabel}</span>
                </div>
              </div>
              <button type="button" aria-label="Đóng QR" onClick={() => setModalGuarantee(null)} className="ox-btn-ghost rounded-xl p-2"><X className="h-4 w-4" /></button>
            </div>
            <div className="mx-auto inline-block rounded-2xl border border-[var(--ox-line)] bg-white p-3.5 shadow-md">
              {qrMap[modalGuarantee.guaranteeId] ? <img src={qrMap[modalGuarantee.guaranteeId]} alt={`QR Check-in ${modalGuarantee.guaranteeId}`} className="h-44 w-44 object-contain" /> : <div className="flex h-44 w-44 items-center justify-center text-xs text-slate-500">Đang tạo QR...</div>}
            </div>
            <OpalxGuaranteePass variant={modalIsLive ? "jade" : "obsidian"} enterpriseName={modalEntName} packageName={modalGuarantee.productName || modalGuarantee.guaranteeId} amountVnd={modalGuarantee.amountVnd} guaranteeId={modalGuarantee.guaranteeId} holderLabel={modalGuarantee.payerName || "Hội viên OpalX"} bankLabel={modalGuarantee.maskedBankRef} statusLabel={modalStatusLabel} solidState stamped tilt txRef={modalGuarantee.lastPrintHash ?? modalGuarantee.proofBundle.guaranteeTxHash} className="mx-auto" />
            <div className="ox-subcard flex items-center justify-between gap-2 rounded-2xl px-3.5 py-2.5 font-mono text-[11px] tabular-nums">
              <span className="font-bold text-[var(--ox-ok-ink)]">{modalGuarantee.guaranteeId}</span>
              <span className="truncate text-[var(--ox-muted)]">{modalGuarantee.buyerEmail || "Đối soát Fuji"}</span>
            </div>
          </div>
        )}
      </PortalSheet>
    </section>
  );
}
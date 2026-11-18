"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CheckCircle2, ChevronDown, Copy, Landmark, Loader2, Save, Settings2 } from "lucide-react";
import type { BankPartnerRail, SupportedVnBank, VerifiedEnterpriseProfile } from "@/types";
import { truncateHex } from "@/components/shared/formatters";

interface BankPartnerRailManagerProps {
  bankRails: BankPartnerRail[];
  supportedBanks: SupportedVnBank[];
  enterprises: VerifiedEnterpriseProfile[];
  webhookEndpoints: { sepayPath: string; payosPath: string };
  positionedRailId?: string;
  onUpdated: () => Promise<void>;
}

async function postRailAction(payload: Record<string, unknown>, fallbackErr: string): Promise<BankPartnerRail> {
  const res = await fetch("/api/bank/rails", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const json = (await res.json().catch(() => ({}))) as { error?: string; bankRail?: BankPartnerRail };
  if (!res.ok || !json.bankRail) throw new Error(json.error ?? fallbackErr);
  return json.bankRail;
}

export function BankPartnerRailManager({ bankRails, supportedBanks, enterprises, webhookEndpoints, positionedRailId, onUpdated }: BankPartnerRailManagerProps) {
  const [editingRailId, setEditingRailId] = useState<string | null>(null);
  const [bankBin, setBankBin] = useState("970422");
  const [webhookProvider, setWebhookProvider] = useState<"SEPAY" | "PAYOS" | "SANDBOX">("SEPAY");
  const [settlementRailLabel, setSettlementRailLabel] = useState("");
  const [feeBps, setFeeBps] = useState("15");
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const detailsRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => setOrigin(window.location.origin), []);
  const linkedCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const ent of enterprises) map.set(ent.linkedBankRailId, (map.get(ent.linkedBankRailId) ?? 0) + 1);
    return map;
  }, [enterprises]);

  const positionedRail = useMemo(() => {
    const needle = positionedRailId?.trim().toLowerCase();
    return needle ? bankRails.find((r) => r.id.toLowerCase() === needle || r.bankBin.toLowerCase() === needle || r.appId.toLowerCase() === needle) : undefined;
  }, [bankRails, positionedRailId]);
  const orderedRails = useMemo(() => (positionedRail ? [positionedRail, ...bankRails.filter((r) => r.id !== positionedRail.id)] : bankRails), [bankRails, positionedRail]);

  const activeCount = bankRails.filter((r) => r.active).length;
  const resolvedBin = editingRailId || supportedBanks.length === 0 || supportedBanks.some((b) => b.bin === bankBin) ? bankBin : supportedBanks[0].bin;
  const activeWebhookUrl = `${origin}${webhookProvider === "PAYOS" ? webhookEndpoints.payosPath : webhookEndpoints.sepayPath}`;

  const handleToggleRail = async (rail: BankPartnerRail) => {
    setNotice(null);
    setTogglingId(rail.id);
    try {
      const updated = await postRailAction({ action: "TOGGLE_RAIL", railId: rail.id, active: !rail.active }, "Không thể cập nhật trạng thái ngân hàng");
      setNotice({ kind: "ok", text: `Đã ${updated.active ? "kích hoạt lại" : "tạm ngưng"} luồng ${updated.shortName}.` });
      await onUpdated();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Lỗi cập nhật trạng thái rail" });
    } finally {
      setTogglingId(null);
    }
  };

  const handleSelectForEdit = (rail: BankPartnerRail) => {
    setNotice(null);
    setEditingRailId(rail.id);
    setBankBin(rail.bankBin);
    setWebhookProvider(rail.webhookProvider);
    setSettlementRailLabel(rail.settlementRailLabel);
    setFeeBps(String(rail.feeBps));
    if (detailsRef.current) {
      detailsRef.current.open = true;
      detailsRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  const handleSaveRail = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const parsedFee = Number(feeBps);
    if (!Number.isInteger(parsedFee) || parsedFee < 0 || parsedFee > 500) {
      return setNotice({ kind: "err", text: "Phí bps phải là số nguyên từ 0 đến 500 (0.00% – 5.00%)." });
    }
    const labelTrimmed = settlementRailLabel.trim();
    if (labelTrimmed.length === 1) return setNotice({ kind: "err", text: "Nhãn luồng cần tối thiểu 2 ký tự hoặc để trống." });
    setSaving(true);
    try {
      const updated = await postRailAction(
        { action: "UPSERT_RAIL", ...(editingRailId ? { id: editingRailId } : {}), bankBin: resolvedBin, webhookProvider, ...(labelTrimmed.length >= 2 ? { settlementRailLabel: labelTrimmed } : {}), feeBps: parsedFee, active: true },
        "Lưu cấu hình ngân hàng thất bại",
      );
      setEditingRailId(null);
      setSettlementRailLabel(updated.settlementRailLabel);
      setFeeBps(String(updated.feeBps));
      setNotice({ kind: "ok", text: `Đã lưu cấu hình ${updated.shortName} (${updated.webhookProvider}) trên luồng NAPAS 247.` });
      await onUpdated();
    } catch (err) {
      setNotice({ kind: "err", text: err instanceof Error ? err.message : "Lỗi lưu cấu hình ngân hàng" });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyUrl = () => {
    void navigator.clipboard?.writeText(activeWebhookUrl).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[var(--ox-ink)] sm:text-base">Hệ Thống Ngân Hàng Đã Thiết Lập Sẵn (NAPAS 247 · VietQR)</h2>
        <span className="ox-pill-active rounded-full px-3 py-1 font-mono text-xs font-semibold tabular-nums">{activeCount}/{bankRails.length} ngân hàng sẵn sàng</span>
      </div>
      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {orderedRails.map((rail) => {
          const isPositioned = positionedRail?.id === rail.id;
          return (
            <article key={rail.id} className={`${isPositioned ? "ox-card-glow" : "ox-card"} flex flex-col justify-between gap-3 rounded-2xl p-4`}>
              <div className="space-y-2">
                {isPositioned && <span className="ox-badge-avax inline-flex w-fit items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold">Ngân hàng định vị</span>}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-base font-bold text-[var(--ox-ink)]">{rail.shortName}</span>
                    <span className="ox-badge-info rounded-md px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums">BIN {rail.bankBin}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${rail.active ? "ox-badge-verified" : "ox-badge-avax"}`}>
                    {rail.active ? "Đang mở" : "Tạm ngưng"}
                  </span>
                </div>
                <p className="text-xs text-[var(--ox-muted)]">{rail.bankName}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-medium text-[var(--ox-ink)]">{rail.settlementRailLabel}</span>
                  <span className="rounded border border-[var(--ox-line)] bg-[var(--ox-soft)] px-1.5 py-0.5 font-mono text-[11px] font-semibold text-[var(--ox-info-ink)]">{rail.webhookProvider}</span>
                </div>
              </div>
              <div className="ox-subcard flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 font-mono text-xs tabular-nums">
                <span className="font-semibold text-[var(--ox-ink)]">{linkedCounts.get(rail.id) ?? 0} Doanh nghiệp liên kết</span>
                <span className="font-semibold text-[var(--ox-ok-ink)]">Phí rail {(rail.feeBps / 100).toFixed(2)}%</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[var(--ox-muted)]"><Landmark className="h-3 w-3 text-[var(--ox-info-ink)]" />{truncateHex(rail.gatewayContractAddress, 4)}</span>
                <div className="flex items-center gap-1.5">
                  <button type="button" onClick={() => handleSelectForEdit(rail)} className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${editingRailId === rail.id ? "ox-pill-active" : "ox-btn-ghost"}`}><Settings2 className="h-3.5 w-3.5" /><span>Cấu hình</span></button>
                  <button type="button" disabled={togglingId === rail.id} onClick={() => void handleToggleRail(rail)} className="ox-btn-ghost inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold disabled:opacity-60">{togglingId === rail.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}<span>{rail.active ? "Tạm ngưng" : "Kích hoạt lại"}</span></button>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {notice && (
        <div role={notice.kind === "err" ? "alert" : "status"} className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium ${notice.kind === "err" ? "ox-badge-avax" : "ox-badge-verified"}`}>
          {notice.kind === "ok" && <CheckCircle2 className="h-4 w-4 shrink-0" />}<span>{notice.text}</span>
        </div>
      )}
      <details ref={detailsRef} className="ox-card group rounded-2xl p-4 sm:p-5">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-bold text-[var(--ox-ink)] sm:text-sm">
          <span>Cấu hình kỹ thuật Webhook &amp; Bổ sung luồng NAPAS (Quản trị viên Ngân hàng)</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--ox-muted)] transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 space-y-4">
          <div className="ox-subcard flex flex-wrap items-center justify-between gap-2 rounded-xl px-3.5 py-2.5 text-xs">
            <div className="min-w-0"><p className="text-[11px] text-[var(--ox-muted)]">Webhook URL ({webhookProvider === "PAYOS" ? "PayOS" : "SePay / Casso"})</p><p className="truncate font-mono font-semibold text-[var(--ox-info-ink)]">{activeWebhookUrl}</p></div>
            <button type="button" onClick={handleCopyUrl} className="ox-btn-ghost inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold">{copied ? <Check className="h-3.5 w-3.5 text-[var(--ox-ok-ink)]" /> : <Copy className="h-3.5 w-3.5" />}<span>{copied ? "Đã chép" : "Copy URL"}</span></button>
          </div>
          {editingRailId && (
            <div className="ox-badge-info flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs">
              <span className="font-mono font-semibold">Đang chỉnh sửa luồng: {editingRailId}</span>
              <button type="button" onClick={() => { setEditingRailId(null); setSettlementRailLabel(""); setFeeBps("15"); }} className="ox-btn-ghost rounded-lg px-2.5 py-1 font-mono text-[11px]">Chuyển sang thêm mới</button>
            </div>
          )}
          <form onSubmit={(e) => void handleSaveRail(e)} className="space-y-4">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div><label htmlFor="rail-bank-bin" className="mb-1.5 block text-xs font-medium text-[var(--ox-muted)]">Ngân hàng NAPAS</label><select id="rail-bank-bin" value={resolvedBin} onChange={(e) => { setBankBin(e.target.value); setEditingRailId(null); }} className="ox-input min-h-[44px] w-full rounded-xl px-3.5 py-2 text-sm">{supportedBanks.map((bank) => <option key={bank.bin} value={bank.bin}>{bank.shortName} ({bank.bin})</option>)}{!supportedBanks.some((b) => b.bin === resolvedBin) && <option value={resolvedBin}>NAPAS ({resolvedBin})</option>}</select></div>
              <div><label htmlFor="rail-webhook-provider" className="mb-1.5 block text-xs font-medium text-[var(--ox-muted)]">Giao thức báo có</label><select id="rail-webhook-provider" value={webhookProvider} onChange={(e) => setWebhookProvider(e.target.value as "SEPAY" | "PAYOS" | "SANDBOX")} className="ox-input min-h-[44px] w-full rounded-xl px-3.5 py-2 text-sm"><option value="SEPAY">SEPAY — Biến động số dư SePay / Casso</option><option value="PAYOS">PAYOS — Cổng PayOS NAPAS 247 Direct</option><option value="SANDBOX">SANDBOX — Giả lập đối soát nội bộ</option></select></div>
              <div><label htmlFor="rail-settlement-label" className="mb-1.5 block text-xs font-medium text-[var(--ox-muted)]">Nhãn luồng</label><input id="rail-settlement-label" type="text" maxLength={80} value={settlementRailLabel} onChange={(e) => setSettlementRailLabel(e.target.value)} placeholder="NAPAS 247 · Instant Webhook" className="ox-input min-h-[44px] w-full rounded-xl px-3.5 py-2 text-sm" /></div>
              <div><label htmlFor="rail-fee-bps" className="mb-1.5 flex items-center justify-between text-xs font-medium text-[var(--ox-muted)]"><span>Phí bps</span><span className="font-mono font-semibold text-[var(--ox-ok-ink)] tabular-nums">{((Number(feeBps) || 0) / 100).toFixed(2)}%</span></label><input id="rail-fee-bps" type="number" min={0} max={500} step={1} inputMode="numeric" value={feeBps} onChange={(e) => setFeeBps(e.target.value)} placeholder="15" className="ox-input min-h-[44px] w-full rounded-xl px-3.5 py-2 font-mono text-sm tabular-nums" /></div>
            </div>
            <button type="submit" disabled={saving} className="ox-btn-primary inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm disabled:opacity-60 sm:w-auto">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}<span>{saving ? "Đang lưu..." : "Lưu Cấu Hình Ngân Hàng"}</span></button>
          </form>
        </div>
      </details>
    </div>
  );
}

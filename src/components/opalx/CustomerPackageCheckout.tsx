"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, QrCode } from "lucide-react";
import type { EnterpriseOrder, GuaranteeCertificate, VerifiedEnterpriseProfile } from "@/types";
import { buildSampleTt78Xml } from "@/core/enterprise/einvoice-samples";
import { useWalletAuth } from "@/components/auth/WalletAuthProvider";
import { ActiveQrSlipCard } from "@/components/enterprise/ActiveQrSlipCard";
import { ThermalGuaranteeSlip } from "@/components/enterprise/ThermalGuaranteeSlip";
import { useAccountMode } from "@/components/layout/AccountModeProvider";
import { formatVnd } from "@/components/shared/formatters";
import { OpalxGuaranteePass } from "@/components/shared/OpalxGuaranteePass";
import { TxStatusToast, type TxStatusToastProps, type TxToastState } from "@/components/shared/TxStatusToast";
import { GuaranteeStepper, SegmentedTabs, type GuaranteeStepPhase } from "@/components/shared/ui-kit";
import { CheckoutPayerForm, type CheckoutPaymentMethod } from "./CheckoutPayerForm";
import { DEFAULT_PARTNER_IDS, MerchantPackagePicker } from "./MerchantPackagePicker";

interface CustomerPackageCheckoutProps {
  initialEnterpriseId?: string;
  lockedEnterpriseId?: string;
  onGuaranteeIssued: () => Promise<void>;
  onOpenVault?: (guaranteeId?: string) => void;
}

type ToastMeta = Omit<TxStatusToastProps, "onClose">;
const fujiTxUrl = (txHash?: string) => (txHash ? `https://testnet.snowtrace.io/tx/${txHash}` : undefined);

function sortEnterprises(list: VerifiedEnterpriseProfile[]): VerifiedEnterpriseProfile[] {
  return [...list].sort((a, b) => {
    const aC = !DEFAULT_PARTNER_IDS.has(a.id), bC = !DEFAULT_PARTNER_IDS.has(b.id);
    if (aC !== bC) return aC ? -1 : 1;
    if (aC && bC) return b.updatedAtIso.localeCompare(a.updatedAtIso);
    return a.id === "california-fitness" ? -1 : b.id === "california-fitness" ? 1 : 0;
  });
}

export function CustomerPackageCheckout({ initialEnterpriseId, lockedEnterpriseId, onGuaranteeIssued, onOpenVault }: CustomerPackageCheckoutProps) {
  const { session, roleSession, confirmWithWallet } = useWalletAuth();
  const activeSession = roleSession ?? session;
  const { activeProfile } = useAccountMode();
  const [enterprises, setEnterprises] = useState<VerifiedEnterpriseProfile[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [selectedEntId, setSelectedEntId] = useState("");
  const [selectedPkgId, setSelectedPkgId] = useState("");
  const [payerName, setPayerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [preferredMethod, setPreferredMethod] = useState<CheckoutPaymentMethod>("VIETQR_BANK_APP");
  const [requireInvoiceXml, setRequireInvoiceXml] = useState(false);
  const [activeOrder, setActiveOrder] = useState<EnterpriseOrder | null>(null);
  const [activeGuarantee, setActiveGuarantee] = useState<GuaranteeCertificate | null>(null);
  const [burstCount, setBurstCount] = useState(0);
  const [mobileStep, setMobileStep] = useState<1 | 2 | 3>(1);
  const [desktopTab, setDesktopTab] = useState<"QR" | "INVOICE">("QR");
  const [busy, setBusy] = useState<"create" | "settle" | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "error" | "notice"; text: string } | null>(null);
  const [toast, setToast] = useState<ToastMeta>({ open: false, state: "idle", label: "" });
  const deepLinkRef = useRef<string | undefined>(undefined);

  const showToast = (state: TxToastState, label: string, extra?: Partial<ToastMeta>) => setToast({ open: true, state, label, ...extra });
  const failWith = (label: string, errorMessage: string) => { setFeedback({ kind: "error", text: errorMessage }); showToast("fail", label, { errorMessage }); };

  const loadData = useCallback(async () => {
    try {
      const entRes = await fetch("/api/enterprises", { cache: "no-store" });
      if (entRes.ok) setEnterprises(sortEnterprises(((await entRes.json()) as { enterprises?: VerifiedEnterpriseProfile[] }).enterprises ?? []));
    } catch { setFeedback({ kind: "error", text: "Không tải được danh sách đối tác hoặc gói dịch vụ." }); }
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    if (roleSession?.role !== "CUSTOMER") return;
    if (roleSession.displayName) setPayerName((prev) => prev || roleSession.displayName);
    if (roleSession.email) setBuyerEmail((prev) => prev || roleSession.email);
  }, [roleSession?.role, roleSession?.displayName, roleSession?.email]);

  const effectiveEnterpriseId = lockedEnterpriseId ?? initialEnterpriseId;
  useEffect(() => {
    if (enterprises.length === 0) return;
    const target = effectiveEnterpriseId ? enterprises.find((e) => e.id.toLowerCase() === effectiveEnterpriseId.trim().toLowerCase()) : undefined;
    if (target && deepLinkRef.current !== target.id) {
      deepLinkRef.current = target.id;
      setCategoryFilter("ALL");
      setSelectedEntId(target.id);
      setSelectedPkgId(target.packages.find((p) => p.active)?.id ?? "");
      return;
    }
    setSelectedEntId((prev) => {
      const hit = enterprises.find((e) => e.id === prev) ?? enterprises[0];
      if (hit && hit.id !== prev) setSelectedPkgId(hit.packages.find((p) => p.active)?.id ?? "");
      return hit?.id ?? "";
    });
  }, [enterprises, effectiveEnterpriseId]);

  const categories = useMemo(() => Array.from(new Set(enterprises.map((e) => e.categoryLabel).filter(Boolean))), [enterprises]);
  const visibleEnterprises = useMemo(() => {
    if (lockedEnterpriseId) {
      const matched = enterprises.filter((e) => e.id.toLowerCase() === lockedEnterpriseId.trim().toLowerCase());
      return matched.length > 0 ? matched : enterprises.slice(0, 1);
    }
    return categoryFilter === "ALL" ? enterprises : enterprises.filter((e) => e.categoryLabel === categoryFilter);
  }, [lockedEnterpriseId, categoryFilter, enterprises]);
  const selectedEnt = visibleEnterprises.find((e) => e.id === selectedEntId) ?? visibleEnterprises[0] ?? null;
  const activePackages = useMemo(() => (selectedEnt ? selectedEnt.packages.filter((p) => p.active) : []), [selectedEnt]);
  const selectedPkg = activePackages.find((p) => p.id === selectedPkgId) ?? activePackages[0] ?? null;

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEnt || !selectedPkg) return;
    const startedAt = performance.now();
    setFeedback(null); setBusy("create"); showToast("sent", `Tạo VietQR · ${selectedEnt.bankShortName}`);
    try {
      const resolvedEmail = buyerEmail.trim() || (roleSession?.role === "CUSTOMER" ? roleSession.email : "");
      const resolvedPayer = payerName.trim() || (roleSession?.role === "CUSTOMER" ? roleSession.displayName : "") || "Khách hàng OpalX";
      const conf = await confirmWithWallet("CREATE_PAYMENT", `${selectedEnt.enterpriseName} · ${selectedPkg.label} · ${selectedPkg.amountVnd} VND`);
      const invoiceXml = requireInvoiceXml ? buildSampleTt78Xml({ amountVnd: selectedPkg.amountVnd, sellerTaxId: selectedEnt.taxId, sellerName: selectedEnt.enterpriseName }) : undefined;
      const payload = {
        enterpriseId: selectedEnt.id, productName: selectedPkg.label, payerName: resolvedPayer,
        ...(resolvedEmail ? { buyerEmail: resolvedEmail } : {}), paymentMethod: preferredMethod, sellerName: selectedEnt.enterpriseName,
        sellerTaxId: selectedEnt.taxId, sellerEnterpriseAddress: selectedEnt.ownerWalletAddress, amountVnd: selectedPkg.amountVnd,
        categoryLabel: selectedEnt.categoryLabel, useEnterpriseBank: true, railMode: activeProfile.railMode, requireInvoiceXml,
        ...(invoiceXml ? { invoiceXml } : {}), broadcastOnChain: true,
        ...(conf?.walletAddress ? { confirmedByWallet: conf.walletAddress } : {}),
        ...(conf?.merchantContractAddress ? { merchantContractAddress: conf.merchantContractAddress } : {}),
        ...(conf?.signature ? { walletSignature: conf.signature } : {}),
      };
      const res = await fetch("/api/orders/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = (await res.json().catch(() => ({}))) as { error?: string; order?: EnterpriseOrder };
      if (!res.ok || !json.order) throw new Error(json.error ?? `Tạo đơn thất bại (${res.status})`);
      const txHash = json.order.enterpriseTxHash;
      setActiveOrder(json.order); setActiveGuarantee(null);
      setFeedback({ kind: "notice", text: `Đơn #${json.order.orderCode} · ${selectedEnt.bankShortName} sẵn sàng.` });
      showToast("ok", `Đơn #${json.order.orderCode} sẵn sàng`, { txHash, explorerUrl: fujiTxUrl(txHash), latencyMs: Math.round(performance.now() - startedAt) });
      setMobileStep(2); setDesktopTab("QR"); await loadData();
    } catch (err) { failWith("Tạo VietQR thất bại", err instanceof Error ? err.message : "Lỗi tạo mã VietQR"); } finally { setBusy(null); }
  };

  const handleSettle = async (orderCode: number, method?: CheckoutPaymentMethod) => {
    const startedAt = performance.now();
    setFeedback(null); setBusy("settle"); showToast("sent", `Đối soát đơn #${orderCode}`);
    try {
      await confirmWithWallet("CONFIRM_RECONCILE", `Thanh toán (${method ?? preferredMethod}) & bảo chứng #${orderCode}`);
      const res = await fetch("/api/sandbox/simulate-bank", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderCode, scenario: "ALLOW_VALID" }) });
      const json = (await res.json().catch(() => ({}))) as { decision?: { verdict: string; reasonCode: string }; guarantee?: GuaranteeCertificate; error?: string };
      if (!res.ok || json.error) throw new Error(json.error ?? `Lỗi đối soát (${res.status})`);
      if (json.guarantee) {
        const issued = json.guarantee, txHash = issued.proofBundle.guaranteeTxHash;
        setActiveGuarantee(issued); setBurstCount((n) => n + 1);
        setActiveOrder((p) => (p && p.orderCode === orderCode ? { ...p, status: "GUARANTEED", guaranteeId: issued.guaranteeId, ...(method ? { paymentMethod: method } : {}) } : p));
        setFeedback({ kind: "notice", text: `Đã cấp ${issued.guaranteeId} · ${formatVnd(issued.amountVnd)}.` });
        showToast("ok", `Cấp chứng thư ${issued.guaranteeId}`, { txHash, explorerUrl: fujiTxUrl(txHash), latencyMs: Math.round(performance.now() - startedAt) });
        setMobileStep(3); setDesktopTab("INVOICE");
      } else if (json.decision) failWith("Policy Kernel từ chối", `Policy Kernel: ${json.decision.verdict} (${json.decision.reasonCode})`);
      await loadData(); await onGuaranteeIssued();
    } catch (err) { failWith("Đối soát thất bại", err instanceof Error ? err.message : "Lỗi đối soát thanh toán"); } finally { setBusy(null); }
  };

  const stepperPhase: GuaranteeStepPhase = busy === "settle" ? "verifying" : activeGuarantee || activeOrder?.status === "GUARANTEED" ? "guaranteed" : activeOrder ? "qr" : "idle";
  const orderMatchesSelection = Boolean(activeOrder && (!selectedEnt || activeOrder.enterpriseId === selectedEnt.id));
  const passAmountVnd = activeGuarantee?.amountVnd ?? (orderMatchesSelection ? activeOrder?.amountVnd : selectedPkg?.amountVnd) ?? selectedPkg?.amountVnd;
  const passId = activeGuarantee?.guaranteeId ?? (orderMatchesSelection && activeOrder ? `OPX-${activeOrder.orderCode}` : "OPX-CHỜ-CẤP");

  return (
    <div className="space-y-4">
      {feedback && (
        <div role={feedback.kind === "error" ? "alert" : "status"} className={`flex items-center gap-2 rounded-2xl border px-3.5 py-2.5 text-xs font-medium ${feedback.kind === "error" ? "ox-badge-avax" : "ox-badge-verified"}`}>
          {feedback.kind === "error" ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <span>{feedback.text}</span>
        </div>
      )}
      <div className="lg:hidden">
        <SegmentedTabs ariaLabel="Quy trình mua gói" value={String(mobileStep) as "1" | "2" | "3"} onChange={(k) => setMobileStep(Number(k) as 1 | 2 | 3)} items={[{ key: "1", label: "Chọn gói" }, { key: "2", label: "VietQR" }, { key: "3", label: "Chứng thư", dot: Boolean(activeGuarantee) }]} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:items-start">
        <div className={`min-w-0 lg:col-span-7 ${mobileStep === 1 ? "block" : "hidden lg:block"}`}>
          <form onSubmit={(e) => void handleCreateOrder(e)} className="ox-card space-y-6 rounded-3xl p-4 sm:p-6">
            <MerchantPackagePicker enterprises={visibleEnterprises} categories={categories} categoryFilter={categoryFilter} onCategoryChange={setCategoryFilter} selectedEnt={selectedEnt} onSelectEnterprise={(ent) => { setSelectedEntId(ent.id); setSelectedPkgId(ent.packages.find((p) => p.active)?.id ?? ""); }} activePackages={activePackages} selectedPkg={selectedPkg} onSelectPackage={setSelectedPkgId} lockedEnterprise={Boolean(lockedEnterpriseId)} />
            <CheckoutPayerForm payerName={payerName} onPayerNameChange={setPayerName} buyerEmail={buyerEmail} onBuyerEmailChange={setBuyerEmail} preferredMethod={preferredMethod} onPreferredMethodChange={setPreferredMethod} requireInvoiceXml={requireInvoiceXml} onRequireInvoiceXmlChange={setRequireInvoiceXml} selectedPkg={selectedPkg} canSubmit={busy === null && Boolean(selectedEnt && selectedPkg)} creating={busy === "create"} />
          </form>
        </div>
        <div className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:col-span-5">
          <div className="ox-card space-y-3 rounded-3xl p-4">
            <GuaranteeStepper phase={stepperPhase} />
            <OpalxGuaranteePass
              variant={activeGuarantee ? "jade" : "obsidian"} enterpriseName={activeGuarantee?.enterpriseName ?? selectedEnt?.enterpriseName ?? activeOrder?.sellerName ?? "OpalX Merchant"}
              packageName={activeGuarantee?.productName ?? selectedPkg?.label ?? (orderMatchesSelection ? activeOrder?.productName : undefined) ?? "Gói dịch vụ bảo chứng"}
              amountVnd={passAmountVnd} guaranteeId={passId} holderLabel={activeGuarantee?.payerName ?? (payerName || "Chủ thẻ OpalX")}
              bankLabel={activeGuarantee?.maskedBankRef ?? selectedEnt?.bankShortName ?? "NAPAS 247"}
              statusLabel={activeGuarantee ? (activeGuarantee.sandbox ? "[SANDBOX]" : "[LIVE BANK]") : activeProfile.badgeLabel}
              solidState={Boolean(activeGuarantee)} stamped={Boolean(activeGuarantee)} scanning={busy === "settle"}
              typing={busy === "create" || busy === "settle"} shine={activeGuarantee ? "once" : "none"} tilt burstKey={burstCount}
              txRef={activeGuarantee?.proofBundle.guaranteeTxHash ?? "0x43113"} className="mx-auto"
            />
          </div>
          <div className="hidden lg:block">
            <SegmentedTabs ariaLabel="Chuyển đổi QR và Phiếu Bảo Chứng" value={desktopTab} onChange={setDesktopTab} items={[{ key: "QR", label: "Thanh toán QR", icon: <QrCode className="h-3.5 w-3.5" /> }, { key: "INVOICE", label: "Phiếu Bảo Chứng", icon: <FileText className="h-3.5 w-3.5" />, dot: Boolean(activeGuarantee) }]} />
          </div>
          <div className={`${mobileStep === 2 ? "block" : "hidden"} ${desktopTab === "QR" ? "lg:block" : "lg:hidden"}`}>
            <ActiveQrSlipCard order={activeOrder} confirming={busy === "settle"} preferredMethod={preferredMethod} fallbackEmail={buyerEmail || activeSession?.email} onSimulateBankAndMint={handleSettle} onBackToForm={() => setMobileStep(1)} onOpenVault={onOpenVault} />
          </div>
          <div className={`${mobileStep === 3 ? "block" : "hidden"} ${desktopTab === "INVOICE" ? "lg:block" : "lg:hidden"}`}>
            <ThermalGuaranteeSlip guarantee={activeGuarantee} onPrinted={onGuaranteeIssued} onOpenVault={onOpenVault} />
          </div>
        </div>
      </div>
      <TxStatusToast {...toast} onClose={() => setToast((prev) => ({ ...prev, open: false }))} />
    </div>
  );
}

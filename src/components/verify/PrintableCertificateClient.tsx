"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Code2, Copy, Download, FileText, Loader2, Printer, Receipt } from "lucide-react";
import type { GuaranteeCertificate } from "@/types";
import type { PrintPaperSize } from "@/core/opalx/print-certificate-html";
import { computePrintFeeBreakdown } from "@/core/opalx/print-fee";
import { formatVnd, truncateHex } from "@/components/shared/formatters";
import { SegmentedTabs } from "@/components/shared/ui-kit";

interface PrintableCertificateClientProps {
  initialHtmlA4: string;
  initialHtmlPos80: string;
  initialHtmlPos58?: string;
  guarantee: GuaranteeCertificate;
}

interface OpalxAndroidPrintBridge {
  printHtml?: (htmlContent: string, jobTitle: string) => void;
}

const stripPrintToolbar = (html: string) =>
  html.replace(/<div class="no-print no-print-bar">[\s\S]*?<\/div>/, "").replace(/<script>[\s\S]*?<\/script>/g, "");

export function PrintableCertificateClient({
  initialHtmlA4,
  initialHtmlPos80,
  initialHtmlPos58,
  guarantee: initialGuarantee,
}: PrintableCertificateClientProps) {
  const [guarantee, setGuarantee] = useState(initialGuarantee);
  const [paper, setPaper] = useState<PrintPaperSize>("a4");
  const [htmlA4, setHtmlA4] = useState(initialHtmlA4);
  const [htmlPos80, setHtmlPos80] = useState(initialHtmlPos80);
  const [htmlPos58, setHtmlPos58] = useState(initialHtmlPos58 ?? initialHtmlPos80);
  const [showCode, setShowCode] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [printing, setPrinting] = useState(false);

  const activeHtml = paper === "pos58" ? htmlPos58 : paper === "pos80" ? htmlPos80 : htmlA4;
  const previewHtml = stripPrintToolbar(activeHtml);
  const encodedId = encodeURIComponent(guarantee.guaranteeId);
  const downloadHref = `/api/guarantees/${encodedId}/print-html?paper=${paper}&download=1`;
  const fee = computePrintFeeBreakdown(Math.max(1, guarantee.printCount ?? 1));

  const triggerSystemPrint = (htmlToPrint: string) => {
    const win = window as Window & { OpalxAndroid?: OpalxAndroidPrintBridge };
    if (typeof win.OpalxAndroid?.printHtml === "function") {
      win.OpalxAndroid.printHtml(htmlToPrint, `OpalX-${guarantee.guaranteeId}`);
      return;
    }
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" });
    document.body.appendChild(iframe);
    iframe.onload = () => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); }
      finally { window.setTimeout(() => iframe.parentNode?.removeChild(iframe), 1500); }
    };
    iframe.srcdoc = stripPrintToolbar(htmlToPrint);
  };

  const handlePrint = async () => {
    setPrinting(true);
    let refreshedHtml = activeHtml;
    try {
      const recRes = await fetch(`/api/guarantees/${encodedId}/record-print`, { method: "POST" });
      if (recRes.ok) {
        const rec = (await recRes.json()) as { guarantee?: GuaranteeCertificate };
        if (rec.guarantee) setGuarantee(rec.guarantee);
      }
      const fetchFmt = (fmt: PrintPaperSize, fallback: string) =>
        fetch(`/api/guarantees/${encodedId}/print-html?paper=${fmt}`, { cache: "no-store" }).then((r) => (r.ok ? r.text() : fallback));
      const [nextA4, nextPos80, nextPos58] = await Promise.all([
        fetchFmt("a4", htmlA4), fetchFmt("pos80", htmlPos80), fetchFmt("pos58", htmlPos58),
      ]);
      setHtmlA4(nextA4); setHtmlPos80(nextPos80); setHtmlPos58(nextPos58);
      refreshedHtml = paper === "pos58" ? nextPos58 : paper === "pos80" ? nextPos80 : nextA4;
    } catch {
      // Fallback to existing HTML offline.
    } finally {
      setPrinting(false);
    }
    triggerSystemPrint(refreshedHtml);
  };

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(activeHtml);
      setCopiedHtml(true);
      window.setTimeout(() => setCopiedHtml(false), 1800);
    } catch {
      // Ignore clipboard failures.
    }
  };

  const previewWidthClass =
    paper === "pos58" ? "mx-auto max-w-[260px]" : paper === "pos80" ? "mx-auto max-w-[360px]" : "mx-auto w-full";

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
      <div className="ox-card-glow space-y-4 rounded-2xl p-4 sm:p-5 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-[var(--ox-muted)]">
              <Link href="/opalx" className="inline-flex items-center gap-1 hover:text-[var(--ox-ink)]">
                <ArrowLeft className="h-3.5 w-3.5" /><span>Kho Hóa Đơn</span>
              </Link>
              <span>/</span>
              <Link href={guarantee.verifyPath} className="font-mono font-semibold text-[var(--ox-ok-ink)] hover:underline">
                {guarantee.guaranteeId}
              </Link>
            </div>
            <h1 className="text-lg font-bold text-[var(--ox-ink)] sm:text-xl">Hóa Đơn Đối Chiếu · {guarantee.guaranteeId}</h1>
            <p className="text-xs text-[var(--ox-muted)] tabular-nums">
              {guarantee.enterpriseName || "California Fitness & Yoga"} · {formatVnd(guarantee.amountVnd)}
            </p>
          </div>

          <SegmentedTabs
            ariaLabel="Chọn khổ giấy in hóa đơn"
            value={paper}
            onChange={setPaper}
            className="w-full sm:w-[340px]"
            items={[
              { key: "a4", label: "Khổ A4", icon: <FileText className="h-3.5 w-3.5 shrink-0" /> },
              { key: "pos80", label: "Nhiệt 80mm", icon: <Receipt className="h-3.5 w-3.5 shrink-0" /> },
              { key: "pos58", label: "Nhiệt 58mm", icon: <Printer className="h-3.5 w-3.5 shrink-0" /> },
            ]}
          />
        </div>

        <div className="ox-badge-info rounded-xl px-3.5 py-2.5 text-xs tabular-nums">
          <span className="font-semibold">Phí in &amp; hash Avalanche:</span> {fee.protocolFeePerPrintAvax} AVAX (giao thức) + ~{fee.estimatedGasPerPrintAvax} AVAX (gas) ={" "}
          <strong className="font-mono">~{fee.totalFeePerPrintAvax} AVAX / lần</strong> (≈ {formatVnd(fee.totalFeePerPrintVnd)}) · Đã xuất: <strong>{guarantee.printCount ?? 1} lần</strong>
          {guarantee.lastPrintTxHash && <span className="ml-2 font-mono">· Tx {truncateHex(guarantee.lastPrintTxHash, 5)}</span>}
        </div>

        <div className="flex flex-col gap-2.5 border-t border-[var(--ox-line)] pt-3 sm:flex-row sm:flex-wrap">
          <button type="button" disabled={printing} onClick={() => void handlePrint()} className="ox-btn-primary inline-flex min-h-[46px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm disabled:opacity-60 sm:flex-none">
            {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            <span>{printing ? "Đang băm & chuẩn bị in..." : "In Hóa Đơn & Ghi Hash Avalanche"}</span>
          </button>
          <a href={downloadHref} className="ox-btn-ghost inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold">
            <Download className="h-4 w-4" /><span>Tải File .HTML</span>
          </a>
          <button type="button" onClick={() => setShowCode((prev) => !prev)} className="ox-btn-ghost inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs font-semibold">
            <Code2 className="h-4 w-4" /><span>{showCode ? "Ẩn Mã HTML" : "Xem / Copy Mã HTML"}</span>
          </button>
        </div>

        {showCode && (
          <div className="ox-subcard space-y-2 rounded-xl p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-[var(--ox-muted)]">
                HTML5 ({paper === "pos58" ? "58mm POS" : paper === "pos80" ? "80mm POS" : "A4 Portrait"})
              </span>
              <button type="button" onClick={() => void handleCopyHtml()} className="ox-btn-ghost inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold">
                {copiedHtml ? <Check className="h-3.5 w-3.5 text-[var(--ox-ok-ink)]" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedHtml ? "Đã sao chép" : "Sao chép HTML"}</span>
              </button>
            </div>
            <pre className="max-h-64 overflow-auto rounded-lg border border-[var(--ox-line)] bg-[var(--ox-surface)] p-3 font-mono text-[11px] leading-relaxed text-[var(--ox-ink)]">
              <code>{activeHtml}</code>
            </pre>
          </div>
        )}
      </div>

      <div className="ox-card rounded-2xl p-3 sm:p-6">
        <div className={previewWidthClass}>
          <iframe title={`Xem trước hóa đơn ${guarantee.guaranteeId}`} srcDoc={previewHtml} sandbox="allow-same-origin" className="h-[740px] w-full rounded-xl border border-[var(--ox-line)] bg-white shadow-xl" />
        </div>
      </div>
    </div>
  );
}

import QRCode from "qrcode";
import type { EnterpriseOrder, GuaranteeCertificate } from "@/types";
import { computePrintFeeBreakdown } from "./print-fee";

export type PrintPaperSize = "a4" | "pos80" | "pos58";

function escapeHtml(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatVnd(amount: number): string {
  if (!Number.isFinite(amount)) return "0 VND";
  return `${new Intl.NumberFormat("en-US").format(Math.round(amount))} VND`;
}

function shortHex(hex?: string, edge = 10): string {
  if (!hex) return "Pending";
  if (hex.length <= edge * 2 + 4) return hex;
  return `${hex.slice(0, edge + 2)}...${hex.slice(-edge)}`;
}

function buildRowsHtml(
  g: GuaranteeCertificate,
  meta: { enterprise: string; category: string; product: string; payer: string; channel: string; issued: string },
): string {
  const walletLabel = g.confirmedByWallet
    ? `${shortHex(g.confirmedByWallet, 6)} · Contract ${shortHex(g.merchantContractAddress, 5)}`
    : shortHex(g.enterpriseAddress, 6);
  const rows: Array<[string, string, string?]> = [
    ["Reconciliation Certificate ID", `${g.guaranteeId} (Order #${g.orderCode})`, "mono"],
    ["Enterprise & Category", `${meta.enterprise} · ${meta.category}`, ""],
    ["Package / Product", meta.product, ""],
    ["Payer / Channel", `${meta.payer} · ${meta.channel}`, ""],
    ["Verified Wallet & Contract", walletLabel, "mono"],
    ["Payment Amount", `${formatVnd(g.amountVnd)} (FT: ${g.maskedBankRef})`, "amount"],
    ["Issued At (UTC)", meta.issued, "mono"],
  ];
  return rows
    .map(([label, val, cls]) => `<tr><th>${escapeHtml(label)}</th><td class="${cls ?? ""}">${escapeHtml(val)}</td></tr>`)
    .join("");
}

function buildFeeAndHashHtml(g: GuaranteeCertificate, verifyUrl: string, qrDataUrl: string, paper: PrintPaperSize): string {
  const isPos = paper !== "a4";
  const qrSize = paper === "pos58" ? 108 : paper === "pos80" ? 128 : 142;
  const printCount = Math.max(1, g.printCount ?? 1);
  const fee = computePrintFeeBreakdown(printCount);
  const txHash = g.lastPrintTxHash ?? g.proofBundle.feeSettlementTxHash ?? g.proofBundle.guaranteeTxHash;
  const docHash = g.lastPrintHash ?? g.orderCommitment;
  const rows: Array<[string, string]> = [
    ["Print Edition", `#${printCount} (Cumulative: ${fee.cumulativeFeeAvax} AVAX ≈ ${formatVnd(fee.cumulativeFeeVnd)})`],
    ["OpalX Protocol Fee / Print", `${fee.protocolFeePerPrintAvax} AVAX (≈ ${formatVnd(fee.protocolFeePerPrintVnd)})`],
    ["Estimated Avalanche Gas Fee", `~${fee.estimatedGasPerPrintAvax} AVAX (≈ ${formatVnd(fee.estimatedGasPerPrintVnd)})`],
    ["Total Cost per Print & Hash", `~${fee.totalFeePerPrintAvax} AVAX (≈ ${formatVnd(fee.totalFeePerPrintVnd)})`],
    ["Reconciliation Hash (Fuji 43113)", isPos ? shortHex(docHash, 6) : docHash],
    ["Avalanche Tx Hash", isPos ? shortHex(txHash, 6) : txHash],
  ];
  const items = rows.map(([k, v]) => `<li><span>${escapeHtml(k)}</span><code>${escapeHtml(v)}</code></li>`).join("");
  return `<section class="verify-box">
    <div class="qr-col">
      <img src="${qrDataUrl}" alt="Verification QR ${escapeHtml(g.guaranteeId)}" width="${qrSize}" height="${qrSize}" />
      <p class="qr-cap">Scan to Verify on Avalanche</p>
      <p class="qr-url">${escapeHtml(verifyUrl)}</p>
    </div>
    <div class="proof-col">
      <h3>Avalanche Hash &amp; Print Fee (${escapeHtml(g.proofBundle.mode)})</h3>
      <ul class="proof-list">${items}</ul>
    </div>
  </section>`;
}

const POS80_CSS = "@page{size:80mm auto;margin:3mm;}body{background:#fff;padding:0;}.sheet{width:74mm;margin:0 auto;padding:3mm;border:1px dashed #111;box-shadow:none;}.hdr{text-align:center;border-bottom:1px dashed #111;padding-bottom:6px;margin-bottom:8px;}.hdr h1{font-size:13px;}.stamp{font-size:10px;padding:2px 6px;margin-top:4px;display:inline-block;}.tbl th,.tbl td{display:block;width:100%;padding:2px 0;border:none;font-size:11px;}.tbl th{color:#475569;font-size:10px;padding-top:5px;}.tbl td{border-bottom:1px dotted #cbd5e1;padding-bottom:4px;}.verify-box{display:block;text-align:center;margin-top:8px;padding-top:8px;border-top:1px dashed #111;}.proof-list{text-align:left;font-size:9px;margin-top:6px;}.proof-list li{padding:2px 0;}";
const POS58_CSS = "@page{size:58mm auto;margin:2mm;}body{background:#fff;padding:0;font-size:10px;}.sheet{width:52mm;margin:0 auto;padding:2.5mm;border:1px dashed #111;box-shadow:none;}.hdr{text-align:center;border-bottom:1px dashed #111;padding-bottom:5px;margin-bottom:6px;}.hdr h1{font-size:11px;line-height:1.25;}.sub{font-size:9px;}.stamp{font-size:9px;padding:2px 5px;margin-top:4px;display:inline-block;}.tbl th,.tbl td{display:block;width:100%;padding:1.5px 0;border:none;font-size:10px;}.tbl th{color:#475569;font-size:9px;padding-top:4px;}.tbl td{border-bottom:1px dotted #cbd5e1;padding-bottom:3px;}.amount{font-size:12px;}.verify-box{display:block;text-align:center;margin-top:6px;padding-top:6px;border-top:1px dashed #111;}.qr-cap{font-size:10px;}.qr-url{font-size:8px;}.proof-col h3{font-size:10px;margin-top:6px;}.proof-list{text-align:left;font-size:8.5px;margin-top:4px;}.proof-list li{padding:1.5px 0;}.ftr{font-size:8.5px;margin-top:8px;}";
const A4_CSS = "@page{size:A4 portrait;margin:12mm;}body{background:#f8fafc;padding:24px 12px;}.sheet{max-width:760px;margin:0 auto;background:#fff;padding:24px;border:2px solid #0f766e;border-radius:12px;}.hdr{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:14px;}.hdr h1{font-size:18px;color:#0f172a;}.stamp{border:2px solid #0f766e;color:#0f766e;padding:6px 10px;font-weight:700;font-size:11px;border-radius:6px;white-space:nowrap;}.tbl{width:100%;border-collapse:collapse;margin-bottom:16px;}.tbl th,.tbl td{border:1px solid #cbd5e1;padding:8px 10px;font-size:13px;text-align:left;vertical-align:top;}.tbl th{width:34%;background:#f8fafc;color:#334155;font-weight:600;}.verify-box{display:grid;grid-template-columns:170px 1fr;gap:16px;border:1px solid #cbd5e1;background:#f8fafc;padding:12px;border-radius:8px;align-items:center;}.proof-list li{display:flex;justify-content:space-between;gap:8px;border-bottom:1px dashed #cbd5e1;padding:4px 0;font-size:11px;}";

/** Generates standalone printable HTML5 Reconciliation Invoice (A4 portrait, 80mm or 58mm thermal POS). */
export async function renderGuaranteePrintHtml(params: {
  guarantee: GuaranteeCertificate;
  order?: EnterpriseOrder;
  origin: string;
  paper?: PrintPaperSize;
  autoPrint?: boolean;
}): Promise<string> {
  const g = params.guarantee;
  const paper: PrintPaperSize = params.paper === "pos80" ? "pos80" : params.paper === "pos58" ? "pos58" : "a4";
  const verifyUrl = `${params.origin.replace(/\/$/, "")}${g.verifyPath}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 220, margin: 1 });

  const meta = {
    enterprise: g.enterpriseName ?? params.order?.sellerName ?? "California Fitness & Yoga",
    category: g.categoryLabel ?? params.order?.categoryLabel ?? "Fitness, Gym & Yoga",
    product: g.productName ?? params.order?.productName ?? g.description ?? `Order #${g.orderCode}`,
    payer: g.payerName ?? params.order?.payerName ?? params.order?.buyerName ?? "Customer",
    channel: `${g.sandbox ? "[SANDBOX]" : "[LIVE BANK]"} · Direct Bank A2A`,
    issued: g.issuedAtIso.replace("T", " ").slice(0, 19) + " UTC",
  };

  const stampText = g.revoked ? "REVOKED" : "AVALANCHE HASHED";
  const pageCss = paper === "pos58" ? POS58_CSS : paper === "pos80" ? POS80_CSS : A4_CSS;
  const autoScript = params.autoPrint ? '<script>window.addEventListener("load",()=>setTimeout(()=>window.print(),250));</script>' : "";

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Reconciliation Statement ${escapeHtml(g.guaranteeId)} · OpalX GO</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.45;}
.mono,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;}
.amount{font-weight:800;color:#0f766e;font-variant-numeric:tabular-nums;font-size:15px;}
.sub{font-size:11px;color:#475569;margin-top:3px;}
.stamp.revoked{border-color:#be123c;color:#be123c;}
.qr-col{text-align:center;}.qr-cap{font-size:11px;font-weight:700;margin-top:4px;}
.qr-url{font-size:9px;color:#475569;word-break:break-all;margin-top:2px;}
.proof-col h3{font-size:12px;color:#0f172a;margin-bottom:6px;text-transform:uppercase;}
.proof-list{list-style:none;}.proof-list span{color:#475569;font-weight:600;margin-right:6px;}
.ftr{margin-top:12px;font-size:10px;color:#64748b;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;}
.no-print-bar{position:fixed;right:18px;bottom:18px;z-index:50;display:flex;gap:8px;}
.print-btn{background:#0f766e;color:#fff;border:none;border-radius:10px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;}
${pageCss}
@media print{body{background:#fff;padding:0;}.sheet{border-color:#0f172a;}.no-print{display:none!important;}}
</style></head><body>
<div class="no-print no-print-bar"><button class="print-btn" type="button" onclick="window.print()">Print Reconciliation Statement</button></div>
<main class="sheet">
  <header class="hdr">
    <div>
      <h1>OPALX GO · GUARANTEE RECONCILIATION CERTIFICATE &amp; AVALANCHE PROOF</h1>
      <p class="sub">Direct Bank Payment Attestation · Reconciliation Commitment Hashed on Avalanche Fuji (43113)</p>
    </div>
    <div class="stamp ${g.revoked ? "revoked" : ""}">${escapeHtml(stampText)} · ${escapeHtml(g.sandbox ? "[SANDBOX]" : "[LIVE BANK]")}</div>
  </header>
  <table class="tbl"><tbody>${buildRowsHtml(g, meta)}</tbody></table>
  ${buildFeeAndHashHtml(g, verifyUrl, qrDataUrl, paper)}
  <footer class="ftr">
    <span>0 PII on-chain · Fixed protocol fee 0.00001 AVAX/print</span>
    <span>OpalX GO · ${escapeHtml(paper.toUpperCase())}</span>
  </footer>
</main>${autoScript}</body></html>`;
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, ImagePlus, Loader2, Printer, ShieldAlert, ShieldCheck } from "lucide-react";
import type { GuaranteeCertificate, NftReceiptProof } from "@/types";
import type { OnChainGuaranteeVerification } from "@/lib/avalanche/avalanche.reader";
import { computePrintFeeBreakdown } from "@/core/opalx/opalx.print-fee";
import { AvalancheTechVerifier } from "@/components/opalx/opalx.avalanche-verifier";
import { BrandOrb } from "@/components/shared/shared.brand-orb";
import { formatAvax, formatUtcTime, formatVnd, truncateHex } from "@/components/shared/shared.formatters";
import { compressImageFileToDataUrl } from "@/components/shared/shared.image-utils";
import { OnChainProofBadge } from "@/components/shared/shared.onchain-proof-badge";
import { OpalxGuaranteePass } from "@/components/shared/shared.guarantee-pass";
import { VerifyX402AuditDrawer } from "@/components/verify/verify.x402-audit-drawer";

interface GuaranteeVerifyCardProps {
  guaranteeId: string;
  guarantee: GuaranteeCertificate | null;
  onChain: OnChainGuaranteeVerification;
}

export function GuaranteeVerifyCard({ guaranteeId, guarantee, onChain }: GuaranteeVerifyCardProps) {
  const [payingFee, setPayingFee] = useState(false);
  const [uploadingNft, setUploadingNft] = useState(false);
  const [nftReceipt, setNftReceipt] = useState<NftReceiptProof | undefined>(guarantee?.nftReceipt);
  const [feeTxHash, setFeeTxHash] = useState<string | undefined>(guarantee?.proofBundle.feeSettlementTxHash);
  const isValid = onChain.source === "ON_CHAIN_FUJI_RPC" ? onChain.valid : Boolean(guarantee && !guarantee.revoked);
  const fee = computePrintFeeBreakdown(Math.max(1, guarantee?.printCount ?? 1));
  const issuerName = guarantee?.enterpriseName || "California Fitness & Yoga";
  const railBadge = guarantee ? (guarantee.sandbox ? "[SANDBOX]" : "[LIVE BANK]") : "FUJI RPC";
  const primaryTxHash = guarantee?.proofBundle.guaranteeTxHash;
  const commitmentHex = onChain.orderCommitment ?? guarantee?.orderCommitment;

  const handlePayAvaxFee = async () => {
    setPayingFee(true);
    try {
      const res = await fetch("/api/avax/settle-fee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guaranteeId }),
      });
      const json = (await res.json().catch(() => ({}))) as { receipt?: { txHash?: string } };
      if (json.receipt?.txHash) setFeeTxHash(json.receipt.txHash);
    } finally {
      setPayingFee(false);
    }
  };

  const handleUploadNftEvidence = async (file: File) => {
    setUploadingNft(true);
    try {
      const evidenceImageDataUrl = await compressImageFileToDataUrl(file, 960, 0.78);
      const res = await fetch(`/api/guarantees/${encodeURIComponent(guaranteeId)}/nft-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceImageDataUrl }),
      });
      const json = (await res.json().catch(() => ({}))) as { nftReceipt?: NftReceiptProof };
      if (json.nftReceipt) setNftReceipt(json.nftReceipt);
    } finally {
      setUploadingNft(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="ox-pass-surface space-y-5 rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ox-line)] pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandOrb seed={guarantee?.enterpriseId || issuerName} label={issuerName} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[var(--ox-ink)]">{issuerName}</p>
              <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-[var(--ox-muted)]">
                <span>Avalanche Fuji · 43113</span>
                <span>·</span>
                <span>0 PII On-Chain</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${railBadge === "[LIVE BANK]" ? "bg-[var(--ox-ok-tint)] text-[var(--ox-ok-ink)]" : "bg-[var(--ox-soft)] text-[var(--ox-ink)]"}`}>
                  {railBadge}
                </span>
              </div>
            </div>
          </div>
          <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs font-bold ${isValid ? "ox-badge-verified" : "ox-badge-avax"}`}>
            {isValid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            <span>{isValid ? "VERIFIED ON FUJI" : "REVOKED / INVALID"}</span>
          </span>
        </div>

        <div className="flex justify-center py-1">
          <OpalxGuaranteePass
            variant={isValid ? "jade" : "obsidian"}
            tilt
            stamped={isValid}
            stampTitle={isValid ? "VERIFIED FUJI" : "REVOKED"}
            stampSub={onChain.liveBlockNumber ? `#${onChain.liveBlockNumber}` : "FUJI 43113"}
            shine="once"
            solidState
            statusLabel={isValid ? "VALID CERTIFICATE" : "REVOKED"}
            enterpriseName={issuerName}
            packageName={guarantee?.productName || guarantee?.description || (guarantee ? `Order #${guarantee.orderCode}` : "On-Chain Record")}
            amountVnd={guarantee?.amountVnd}
            guaranteeId={guaranteeId}
            holderLabel={guarantee?.payerName || "OpalX Member"}
            bankLabel={railBadge}
            txRef={primaryTxHash ?? onChain.orderCommitment ?? guaranteeId}
          />
        </div>

        <dl className="divide-y divide-[var(--ox-line)] border-t border-[var(--ox-line)] font-mono text-xs tabular-nums">
          <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <dt className="text-[var(--ox-muted)]">RPC Verification Source</dt>
            <dd className="flex items-center gap-2 font-bold text-[var(--ox-ink)]">
              <span className={`h-2 w-2 rounded-full ${isValid ? "bg-emerald-500" : "bg-[var(--ox-avax)]"}`} aria-hidden="true" />
              <span>{onChain.source}{onChain.liveBlockNumber ? ` · #${onChain.liveBlockNumber.toLocaleString("en-US")}` : ""}</span>
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <dt className="text-[var(--ox-muted)]">Amount / AVAX Collateral</dt>
            <dd className="font-bold text-[var(--ox-ok-ink)]">
              {guarantee ? formatVnd(guarantee.amountVnd) : "On-Chain Record"} · {formatAvax(onChain.collateralAvax ?? guarantee?.collateralAvax ?? 0.0002, 4)}
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <dt className="text-[var(--ox-muted)]">Print &amp; Hash Fee (per print)</dt>
            <dd className="font-bold text-[var(--ox-ink)]">
              {fee.totalFeePerPrintAvax} AVAX (≈ {formatVnd(fee.totalFeePerPrintVnd)})
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <dt className="text-[var(--ox-muted)]">SHA-256 Commitment</dt>
            <dd className="text-[var(--ox-ink)]">
              {truncateHex(commitmentHex, 8)} · {formatUtcTime(guarantee?.issuedAtIso)}
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-2.5">
            <dt className="text-[var(--ox-muted)]">Fuji Tx / Explorer</dt>
            <dd className="flex items-center gap-2">
              <span className="font-semibold text-[var(--ox-ink)]">{truncateHex(primaryTxHash ?? onChain.opalxCoreAddress, 6)}</span>
              <a
                href={primaryTxHash ? `https://testnet.snowtrace.io/tx/${primaryTxHash}` : `https://testnet.snowtrace.io/address/${onChain.opalxCoreAddress}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[var(--ox-ok-ink)] hover:underline"
              >
                <span>Snowtrace</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </dd>
          </div>
        </dl>

        {guarantee?.benefits && guarantee.benefits.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--ox-ink)]">Included Guarantee Benefits:</p>
            <div className="flex flex-wrap gap-1.5">
              {guarantee.benefits.map((benefit) => (
                <span key={benefit} className="inline-flex items-center gap-1 rounded-full bg-[var(--ox-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--ox-ink)]">
                  <ShieldCheck className="h-3 w-3 text-[var(--ox-ok-ink)]" />
                  <span>{benefit}</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {guarantee?.claimedRights && guarantee.claimedRights.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--ox-ink)]">Wallet-Signed Claimed Rights:</p>
            <ul className="divide-y divide-[var(--ox-line)] rounded-2xl bg-[var(--ox-soft)] px-3.5 text-xs">
              {guarantee.claimedRights.map((claim) => (
                <li key={claim.id} className="py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--ox-ok-ink)]">{claim.label}</span>
                    <span className="font-mono text-[10px] text-[var(--ox-muted)] tabular-nums">{truncateHex(claim.signature, 4)}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-[var(--ox-muted)]">{claim.verificationNote}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {guarantee && (
          <div className="space-y-3 rounded-2xl border border-[var(--ox-line)] bg-[var(--ox-soft)]/50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-bold text-[var(--ox-ink)]">
                  Avalanche ERC-721 NFT Receipt Proof (Chain 43113)
                </p>
                <p className="font-mono text-[11px] text-[var(--ox-muted)]">
                  Token #{nftReceipt?.tokenId ? `${nftReceipt.tokenId.slice(0, 10)}...${nftReceipt.tokenId.slice(-6)}` : "ERC-721"} ·{" "}
                  {nftReceipt?.hasManualEvidenceImage ? "Manual Invoice Photo Anchored" : "On-Chain Hash Seal"}
                </p>
              </div>
              <label className="ox-btn-ghost inline-flex cursor-pointer items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-semibold">
                {uploadingNft ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5 text-[var(--ox-avax)]" />}
                <span>{uploadingNft ? "Anchoring..." : nftReceipt?.hasManualEvidenceImage ? "Update Manual Photo" : "Attach Manual Invoice Photo"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUploadNftEvidence(file);
                  }}
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <img
                src={nftReceipt?.evidenceImageDataUrl || `/api/guarantees/${encodeURIComponent(guaranteeId)}/nft-receipt?format=svg`}
                alt={`NFT Receipt Evidence ${guaranteeId}`}
                className="h-24 w-36 rounded-xl border border-[var(--ox-line)] bg-[#090c12] object-contain p-1"
              />
              <div className="min-w-0 flex-1 space-y-1.5 font-mono text-[11px]">
                <p className="truncate text-[var(--ox-muted)]">
                  Evidence Hash: <span className="text-[var(--ox-ink)]">{truncateHex(nftReceipt?.evidenceHash ?? commitmentHex, 8)}</span>
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={`/api/guarantees/${encodeURIComponent(guaranteeId)}/nft-receipt?format=svg`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-[var(--ox-ok-ink)] hover:underline"
                  >
                    <span>View NFT Image (SVG)</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <a
                    href={`/api/guarantees/${encodeURIComponent(guaranteeId)}/nft-receipt`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 font-semibold text-[var(--ox-muted)] hover:text-[var(--ox-ink)] hover:underline"
                  >
                    <span>ERC-721 Metadata JSON</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {guarantee && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--ox-ink)]">Avalanche Fuji On-Chain Proofs:</p>
            <div className="flex flex-wrap gap-2">
              <OnChainProofBadge label="1. Enterprise" txHash={guarantee.proofBundle.enterpriseTxHash} />
              <OnChainProofBadge label="2. Bank" txHash={guarantee.proofBundle.bankTxHash} />
              <OnChainProofBadge label="3. OpalXCore" txHash={guarantee.proofBundle.guaranteeTxHash} />
              <OnChainProofBadge label="4. Fee AVAX" txHash={feeTxHash} />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2.5 border-t border-[var(--ox-line)] pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            {guarantee && (
              <Link href={`/print/${encodeURIComponent(guaranteeId)}`} className="ox-btn-ghost inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold">
                <Printer className="h-3.5 w-3.5" />
                <span>View &amp; Print Receipt</span>
              </Link>
            )}
            <a
              href={`https://testnet.snowtrace.io/address/${onChain.opalxCoreAddress}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-[var(--ox-muted)] hover:text-[var(--ox-ink)] hover:underline"
            >
              <span>Snowtrace</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <button
            type="button"
            disabled={payingFee}
            onClick={() => void handlePayAvaxFee()}
            className="ox-btn-avax inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl px-4 py-2 text-xs disabled:opacity-60"
          >
            {payingFee && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>Record Verification Fee (0.00001 AVAX)</span>
          </button>
        </div>
      </div>

      <VerifyX402AuditDrawer guaranteeId={guaranteeId} />
      <AvalancheTechVerifier guaranteeId={guaranteeId} compact defaultOpen />
    </div>
  );
}

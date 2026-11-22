import { keccak256, toHex } from "viem";
import type { GuaranteeCertificate, NftReceiptProof } from "@/types";
import { AVALANCHE_FUJI_NETWORK } from "@/lib/avalanche/avalanche.network";

/** Computes a deterministic keccak256 digest for an uploaded manual invoice or payment photo. */
export function computeEvidenceImageDigest(imageDataUrl: string): `0x${string}` {
  return keccak256(toHex(imageDataUrl.trim()));
}

/** Derives a deterministic uint256 ERC-721 Token ID bound to Avalanche Fuji (43113). */
export function deriveNftReceiptTokenId(guaranteeId: string, orderCommitment: string): string {
  const hash = keccak256(
    toHex(`avalanche:fuji:${AVALANCHE_FUJI_NETWORK.chainId}:erc721:${guaranteeId}:${orderCommitment}`),
  );
  return BigInt(hash).toString(10);
}

/** Builds a non-fungible ERC-721 Receipt Proof bound strictly to Avalanche Fuji (43113). */
export function buildNftReceiptProof(params: {
  guaranteeId: string;
  orderCommitment: `0x${string}`;
  bankRefCommitment: `0x${string}`;
  invoiceCommitment: `0x${string}`;
  manualReceiptImageDataUrl?: string;
  manualReceiptDigestHex?: `0x${string}`;
  mintedAtIso: string;
}): NftReceiptProof {
  const cleanImage = params.manualReceiptImageDataUrl?.trim() || undefined;
  const evidenceHash =
    params.manualReceiptDigestHex ??
    (cleanImage
      ? computeEvidenceImageDigest(cleanImage)
      : keccak256(
          toHex(
            `nft-receipt:${params.guaranteeId}:${params.orderCommitment}:${params.bankRefCommitment}:${params.invoiceCommitment}`,
          ),
        ));

  return {
    standard: "ERC-721",
    chainId: AVALANCHE_FUJI_NETWORK.chainId,
    caip2: AVALANCHE_FUJI_NETWORK.caip2,
    tokenId: deriveNftReceiptTokenId(params.guaranteeId, params.orderCommitment),
    evidenceHash,
    hasManualEvidenceImage: Boolean(cleanImage),
    ...(cleanImage ? { evidenceImageDataUrl: cleanImage } : {}),
    metadataUri: `/api/guarantees/${encodeURIComponent(params.guaranteeId)}/nft-receipt`,
    imageUri: `/api/guarantees/${encodeURIComponent(params.guaranteeId)}/nft-receipt?format=svg`,
    mintedAtIso: params.mintedAtIso,
  };
}

/** Ensures a guarantee always exposes an Avalanche Fuji ERC-721 Receipt Proof. */
export function resolveNftReceiptForGuarantee(g: GuaranteeCertificate): NftReceiptProof {
  if (g.nftReceipt) return g.nftReceipt;
  return buildNftReceiptProof({
    guaranteeId: g.guaranteeId,
    orderCommitment: g.orderCommitment,
    bankRefCommitment: g.bankRefCommitment,
    invoiceCommitment: g.invoiceCommitment,
    mintedAtIso: g.issuedAtIso,
  });
}

function escapeXml(raw: unknown): string {
  return String(raw ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function shortHex(hex: string, edge = 8): string {
  if (hex.length <= edge * 2 + 4) return hex;
  return `${hex.slice(0, edge + 2)}...${hex.slice(-edge)}`;
}

/** Builds standard ERC-721 metadata JSON for an Avalanche Fuji Receipt Proof NFT. */
export function buildNftReceiptMetadata(guarantee: GuaranteeCertificate, origin: string) {
  const proof = resolveNftReceiptForGuarantee(guarantee);
  const base = origin.replace(/\/$/, "");
  return {
    name: `OpalX Receipt Proof · ${guarantee.guaranteeId}`,
    description:
      "Non-fungible bank reconciliation & manual invoice evidence certificate anchored on Avalanche Fuji C-Chain (43113). Zero PII stored on-chain.",
    image: `${base}${proof.imageUri}`,
    external_url: `${base}${guarantee.verifyPath}`,
    network: {
      name: "Avalanche Fuji C-Chain",
      chainId: proof.chainId,
      caip2: proof.caip2,
      standard: proof.standard,
    },
    tokenId: proof.tokenId,
    evidenceHash: proof.evidenceHash,
    hasManualEvidenceImage: proof.hasManualEvidenceImage,
    attributes: [
      { trait_type: "Blockchain", value: "Avalanche Fuji (43113)" },
      { trait_type: "Standard", value: "ERC-721 Receipt Proof" },
      { trait_type: "Guarantee ID", value: guarantee.guaranteeId },
      { trait_type: "Order Code", value: String(guarantee.orderCode) },
      { trait_type: "Amount (VND)", value: guarantee.amountVnd },
      { trait_type: "Rail Mode", value: guarantee.railMode },
      { trait_type: "Manual Invoice Photo", value: proof.hasManualEvidenceImage ? "Attached" : "On-Chain Hash Only" },
      { trait_type: "Evidence Hash", value: proof.evidenceHash },
    ],
  };
}

/** Renders a self-contained printable SVG card for the Avalanche Fuji ERC-721 Receipt Proof. */
export function renderNftReceiptSvg(guarantee: GuaranteeCertificate, origin: string): string {
  const proof = resolveNftReceiptForGuarantee(guarantee);
  const amountText = `${new Intl.NumberFormat("en-US").format(Math.round(guarantee.amountVnd))} VND`;
  const enterprise = escapeXml(guarantee.enterpriseName || "OpalX Verified Enterprise");
  const tokenShort =
    proof.tokenId.length > 20 ? `${proof.tokenId.slice(0, 10)}...${proof.tokenId.slice(-8)}` : proof.tokenId;
  const verifyUrl = escapeXml(`${origin.replace(/\/$/, "")}${guarantee.verifyPath}`);
  const safeImage =
    proof.evidenceImageDataUrl && proof.evidenceImageDataUrl.startsWith("data:image/")
      ? `<rect x="440" y="96" width="240" height="240" rx="14" fill="#0f172a" stroke="#334155" stroke-width="1.5" />
         <image href="${escapeXml(proof.evidenceImageDataUrl)}" x="448" y="104" width="224" height="200" preserveAspectRatio="xMidYMid meet" />
         <text x="560" y="324" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="10">ATTACHED MANUAL RECEIPT</text>`
      : `<rect x="440" y="96" width="240" height="240" rx="14" fill="#0f172a" stroke="#1e293b" stroke-width="1.5" stroke-dasharray="6 4" />
         <text x="560" y="205" text-anchor="middle" fill="#10b981" font-family="monospace" font-size="13" font-weight="700">AVALANCHE SEAL</text>
         <text x="560" y="226" text-anchor="middle" fill="#94a3b8" font-family="monospace" font-size="11">${escapeXml(guarantee.guaranteeId)}</text>
         <text x="560" y="248" text-anchor="middle" fill="#64748b" font-family="monospace" font-size="10">0 PII · FUJI 43113</text>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="400" viewBox="0 0 720 400">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090c12" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
    <linearGradient id="avax" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#e84142" />
      <stop offset="100%" stop-color="#0d9488" />
    </linearGradient>
  </defs>
  <rect width="720" height="400" rx="22" fill="url(#bg)" />
  <rect x="12" y="12" width="696" height="376" rx="16" fill="none" stroke="url(#avax)" stroke-width="1.5" opacity="0.65" />
  <rect x="32" y="28" width="215" height="26" rx="13" fill="#e84142" fill-opacity="0.16" stroke="#e84142" stroke-opacity="0.55" />
  <text x="46" y="45" fill="#fca5a5" font-family="monospace" font-size="11" font-weight="700">AVALANCHE FUJI (43113) · ERC-721</text>
  <text x="32" y="88" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="22" font-weight="700">${escapeXml(guarantee.guaranteeId)}</text>
  <text x="32" y="114" fill="#94a3b8" font-family="system-ui, sans-serif" font-size="13">${enterprise}</text>
  <text x="32" y="154" fill="#10b981" font-family="monospace" font-size="24" font-weight="700">${escapeXml(amountText)}</text>
  <text x="32" y="198" fill="#64748b" font-family="monospace" font-size="11">TOKEN ID</text>
  <text x="32" y="216" fill="#e2e8f0" font-family="monospace" font-size="12">${escapeXml(tokenShort)}</text>
  <text x="32" y="246" fill="#64748b" font-family="monospace" font-size="11">EVIDENCE HASH (KECCAK-256)</text>
  <text x="32" y="264" fill="#e2e8f0" font-family="monospace" font-size="12">${escapeXml(shortHex(proof.evidenceHash, 10))}</text>
  <text x="32" y="294" fill="#64748b" font-family="monospace" font-size="11">FUJI TX / ORDER COMMITMENT</text>
  <text x="32" y="312" fill="#e2e8f0" font-family="monospace" font-size="12">${escapeXml(shortHex(guarantee.proofBundle.guaranteeTxHash, 10))}</text>
  ${safeImage}
  <text x="32" y="366" fill="#64748b" font-family="monospace" font-size="10">Verify: ${verifyUrl}</text>
</svg>`;
}

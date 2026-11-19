import { keccak256, toHex } from "viem";
import { deriveEmbeddedUserWallet } from "@/core/auth/auth.wallet";
import { ENTERPRISE_PRODUCT_CATALOG, findSupportedVnBank, normalizeAccountHolderName } from "@/core/enterprise/enterprise.catalog";
import type { LedgerState } from "@/core/ledger/ledger.seed";
import { mutateLedger, readLedger } from "@/core/ledger/ledger.store";
import { getGatewayAddresses, isNonZeroAddress } from "@/lib/avalanche/avalanche.network";
import type { BankPartnerRail, EnterpriseServicePackage, VerifiedEnterpriseProfile } from "@/types";

const FALLBACK_BANK_GATEWAY = "0xf786333845a1b373b455d8f419b42291f821e721" as const;
const DEFAULT_DEPLOYED_AT_ISO = "2026-04-01T08:00:00.000Z";
const DEFAULT_BINDINGS: Record<string, { railId: string; accountNo: string; accountName: string }> = {
  "california-fitness": { railId: "bank-mb", accountNo: "03120006789", accountName: "CONG TY CALIFORNIA FITNESS" },
  "opalx-roastery": { railId: "bank-tcb", accountNo: "19038899123", accountName: "OPALX ROASTERY COFFEE" },
  "saigon-medequip": { railId: "bank-vcb", accountNo: "0071001234567", accountName: "SAIGON CARE CLINIC" },
  "mekong-agro": { railId: "bank-acb", accountNo: "8899001122", accountName: "MEKONG AGRO SUPPLY" },
};
const DEFAULT_PACKAGE_META: Record<string, { benefits: string[]; guaranteeRightLabel: string }> = {
  "california-fitness": {
    benefits: [
      "Club-wide QR check-in access",
      "PolicyVault Fuji escrow protection",
      "ERC-8004 membership tier credits",
    ],
    guaranteeRightLabel: "Membership Pass & Club Guarantee",
  },
  "opalx-roastery": {
    benefits: [
      "Redeem QR pass at barista counter",
      "PolicyVault Fuji card balance protection",
      "ERC-8004 loyalty points accumulation",
    ],
    guaranteeRightLabel: "Loyalty Card & QR Redemption",
  },
  "mekong-agro": {
    benefits: [
      "Shipment & TT78 e-invoice reconciliation",
      "PolicyVault delivery escrow guarantee",
      "ERC-8004 B2B credit reputation",
    ],
    guaranteeRightLabel: "Delivery Certificate & B2B Escrow",
  },
  "saigon-medequip": {
    benefits: [
      "Priority QR appointment check-in",
      "PolicyVault Fuji refund protection",
      "ERC-8004 verified medical guarantee",
    ],
    guaranteeRightLabel: "Clinic Pass & Medical Guarantee",
  },
};
const DEFAULT_RAIL_SPECS: Array<[string, string, string, string, string, "SEPAY" | "PAYOS" | "SANDBOX", string, number]> = [
  ["bank-mb", "970422", "MB Bank", "Military Commercial Joint Stock Bank (MB Bank)", "mb", "SEPAY", "NAPAS 247 · SePay Instant", 15],
  ["bank-vcb", "970436", "Vietcombank", "Joint Stock Commercial Bank for Foreign Trade of Vietnam (VCB)", "vcb", "PAYOS", "NAPAS 247 · PayOS Direct", 12],
  ["bank-tcb", "970407", "Techcombank", "Vietnam Technological and Commercial Bank (TCB)", "tcb", "SEPAY", "NAPAS 247 · TCB Virtual", 15],
  ["bank-acb", "970416", "ACB", "Asia Commercial Joint Stock Bank (ACB)", "acb", "SANDBOX", "NAPAS 247 · ACB Business", 18],
  ["bank-bidv", "970418", "BIDV", "Bank for Investment and Development of Vietnam (BIDV)", "bidv", "SEPAY", "NAPAS 247 · BIDV SmartBanking", 14],
  ["bank-vpbank", "970432", "VPBank", "Vietnam Prosperity Joint Stock Commercial Bank (VPBank)", "vpb", "PAYOS", "NAPAS 247 · VPBank NEO", 15],
];

const resolveBankGatewayAddress = (): `0x${string}` => {
  const addr = getGatewayAddresses().bankGateway;
  return isNonZeroAddress(addr) ? addr : FALLBACK_BANK_GATEWAY;
};
const toSlug = (raw: string): string =>
  raw.replace(/[đĐ]/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "partner";
const normalizeHolderOrThrow = (raw: string): string => {
  const name = normalizeAccountHolderName(raw);
  if (name.length < 2) throw new Error("INVALID_ACCOUNT_HOLDER_NAME");
  return name;
};
const normalizeBenefits = (benefits?: string[]): string[] | undefined => {
  if (!benefits?.length) return undefined;
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const item of benefits) {
    const trimmed = item.trim();
    if (trimmed.length < 2 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    cleaned.push(trimmed.slice(0, 120));
    if (cleaned.length >= 6) break;
  }
  return cleaned.length > 0 ? cleaned : undefined;
};
const buildPackageRecord = (params: {
  id: string;
  label: string;
  durationLabel: string;
  amountVnd: number;
  active?: boolean;
  imageDataUrl?: string;
  benefits?: string[];
  guaranteeRightLabel?: string;
}): EnterpriseServicePackage => {
  const benefits = normalizeBenefits(params.benefits);
  const guaranteeRightLabel = params.guaranteeRightLabel?.trim();
  const imageDataUrl = params.imageDataUrl?.trim();
  return {
    id: params.id,
    label: params.label.trim(),
    durationLabel: params.durationLabel.trim(),
    amountVnd: Math.round(params.amountVnd),
    active: params.active ?? true,
    ...(imageDataUrl ? { imageDataUrl } : {}),
    ...(benefits ? { benefits } : {}),
    ...(guaranteeRightLabel ? { guaranteeRightLabel: guaranteeRightLabel.slice(0, 80) } : {}),
  };
};
const computeEnterpriseProofMeta = (params: {
  id: string;
  taxId: string;
  merchantContractAddress: `0x${string}`;
  deployedAtIso: string;
}): {
  kybCommitmentHash: `0x${string}`;
  contractDeploymentTxHash: `0x${string}`;
  contractDeployedAtIso: string;
} => ({
  kybCommitmentHash: keccak256(toHex(`kyb:${params.taxId}:${params.merchantContractAddress}`)),
  contractDeploymentTxHash: keccak256(
    toHex(`deploy-fuji:${params.id}:${params.merchantContractAddress}:${params.deployedAtIso}`),
  ),
  contractDeployedAtIso: params.deployedAtIso,
});
const hydrateEnterpriseMetadata = (ent: VerifiedEnterpriseProfile): VerifiedEnterpriseProfile => {
  const deployedAtIso = ent.contractDeployedAtIso ?? (DEFAULT_PACKAGE_META[ent.id] ? DEFAULT_DEPLOYED_AT_ISO : ent.updatedAtIso);
  const fallbackProof = computeEnterpriseProofMeta({
    id: ent.id,
    taxId: ent.taxId,
    merchantContractAddress: ent.merchantContractAddress,
    deployedAtIso,
  });
  const defaultMeta = DEFAULT_PACKAGE_META[ent.id];
  const packages = defaultMeta
    ? ent.packages.map((p) => ({
        ...p,
        benefits: p.benefits?.length ? p.benefits : [...defaultMeta.benefits],
        guaranteeRightLabel: p.guaranteeRightLabel ?? defaultMeta.guaranteeRightLabel,
      }))
    : ent.packages;
  return {
    ...ent,
    kybCommitmentHash: ent.kybCommitmentHash ?? fallbackProof.kybCommitmentHash,
    contractDeploymentTxHash: ent.contractDeploymentTxHash ?? fallbackProof.contractDeploymentTxHash,
    contractDeployedAtIso: deployedAtIso,
    packages,
  };
};
const buildDefaultBankRails = (nowIso = new Date().toISOString()): BankPartnerRail[] => {
  const gw = resolveBankGatewayAddress();
  return DEFAULT_RAIL_SPECS.map(([id, bankBin, shortName, bankName, appId, webhookProvider, settlementRailLabel, feeBps]) => ({
    id, bankBin, shortName, bankName, appId, webhookProvider, settlementRailLabel, feeBps, active: true, gatewayContractAddress: gw, updatedAtIso: nowIso,
  }));
};
const buildDefaultEnterprises = (rails: BankPartnerRail[], nowIso = new Date().toISOString()): VerifiedEnterpriseProfile[] =>
  ENTERPRISE_PRODUCT_CATALOG.map((cat) => {
    const bind = DEFAULT_BINDINGS[cat.id] ?? { railId: rails[0].id, accountNo: "03120006789", accountName: normalizeAccountHolderName(cat.enterpriseName) };
    const rail = rails.find((r) => r.id === bind.railId) ?? rails[0];
    const ownerEmail = `kyb.${cat.id}@opalx.vn`;
    const derived = deriveEmbeddedUserWallet({ provider: "EMAIL", email: ownerEmail, displayName: cat.enterpriseName, defaultScopeId: cat.id });
    const proofMeta = computeEnterpriseProofMeta({
      id: cat.id,
      taxId: cat.taxId,
      merchantContractAddress: derived.merchantContractAddress,
      deployedAtIso: DEFAULT_DEPLOYED_AT_ISO,
    });
    const pkgMeta = DEFAULT_PACKAGE_META[cat.id];
    return {
      id: cat.id, enterpriseName: cat.enterpriseName, taxId: cat.taxId, categoryCode: cat.categoryCode, categoryLabel: cat.categoryLabel,
      ownerEmail, ownerWalletAddress: derived.walletAddress, merchantContractAddress: derived.merchantContractAddress,
      ...proofMeta,
      kybVerified: true, linkedBankRailId: rail.id, bankBin: rail.bankBin, bankShortName: rail.shortName, accountNo: bind.accountNo, accountName: bind.accountName,
      packages: (cat.packages ?? []).map((p) =>
        buildPackageRecord({
          ...p,
          active: true,
          ...(pkgMeta ? { benefits: [...pkgMeta.benefits], guaranteeRightLabel: pkgMeta.guaranteeRightLabel } : {}),
        }),
      ),
      updatedAtIso: nowIso,
    };
  });
const mergeMissingDefaultRails = (existing: BankPartnerRail[]): BankPartnerRail[] => {
  const seen = new Set(existing.map((r) => r.id));
  const missing = buildDefaultBankRails().filter((d) => !seen.has(d.id));
  return missing.length > 0 ? [...existing, ...missing] : existing;
};
const ensureRails = (ledger: LedgerState): BankPartnerRail[] =>
  (ledger.bankRails = mergeMissingDefaultRails(ledger.bankRails ?? []));
const ensureEnterprises = (ledger: LedgerState): VerifiedEnterpriseProfile[] => {
  const rails = ensureRails(ledger);
  const base = ledger.enterprises?.length ? ledger.enterprises : buildDefaultEnterprises(rails);
  return (ledger.enterprises = base.map(hydrateEnterpriseMetadata));
};
const matchRail = (rails: BankPartnerRail[], idOrBin: string): BankPartnerRail | undefined => {
  const needle = idOrBin.trim().toLowerCase();
  return needle ? rails.find((r) => r.id.toLowerCase() === needle || r.bankBin === idOrBin.trim()) : undefined;
};
const requireActiveRail = (rails: BankPartnerRail[], idOrBin: string): BankPartnerRail => {
  const rail = matchRail(rails, idOrBin);
  if (!rail || !rail.active) throw new Error("BANK_RAIL_INACTIVE_OR_MISSING");
  return rail;
};
function withEnterprise(enterpriseId: string, fn: (ent: VerifiedEnterpriseProfile, rails: BankPartnerRail[]) => void): VerifiedEnterpriseProfile {
  return mutateLedger((ledger) => {
    const rails = ensureRails(ledger);
    const needle = enterpriseId.trim().toLowerCase();
    const ent = ensureEnterprises(ledger).find((e) => e.id.toLowerCase() === needle);
    if (!ent) throw new Error("ENTERPRISE_NOT_FOUND");
    fn(ent, rails);
    ent.updatedAtIso = new Date().toISOString();
    return ent;
  });
}

export const listBankPartnerRails = (): BankPartnerRail[] => {
  const ledger = readLedger();
  return mergeMissingDefaultRails(ledger.bankRails ?? []);
};
export const findBankPartnerRail = (idOrBin: string): BankPartnerRail | undefined => matchRail(listBankPartnerRails(), idOrBin);

export function upsertBankPartnerRail(input: {
  id?: string; bankBin: string; webhookProvider: "SEPAY" | "PAYOS" | "SANDBOX";
  settlementRailLabel?: string; feeBps?: number; active?: boolean;
}): BankPartnerRail {
  return mutateLedger((ledger) => {
    const rails = ensureRails(ledger);
    const bank = findSupportedVnBank(input.bankBin);
    const idx = rails.findIndex((r) => (input.id ? r.id === input.id : r.bankBin === input.bankBin));
    const prev = idx >= 0 ? rails[idx] : undefined;
    const next: BankPartnerRail = {
      id: prev?.id ?? (input.id?.trim() || (bank ? `bank-${bank.appId}` : `bank-${input.bankBin}`)),
      bankBin: input.bankBin, shortName: bank?.shortName ?? prev?.shortName ?? "NAPAS Bank",
      bankName: bank?.name ?? prev?.bankName ?? `NAPAS Bank (${input.bankBin})`, appId: bank?.appId ?? prev?.appId ?? "napas",
      webhookProvider: input.webhookProvider, feeBps: input.feeBps ?? prev?.feeBps ?? 15, active: input.active ?? prev?.active ?? true,
      settlementRailLabel: input.settlementRailLabel?.trim() || prev?.settlementRailLabel || `NAPAS 247 · ${input.webhookProvider} Direct`,
      gatewayContractAddress: resolveBankGatewayAddress(), updatedAtIso: new Date().toISOString(),
    };
    if (idx >= 0) rails[idx] = next;
    else rails.push(next);
    return next;
  });
}

export function toggleBankPartnerRail(railId: string, active: boolean): BankPartnerRail | null {
  return mutateLedger((ledger) => {
    const rail = matchRail(ensureRails(ledger), railId);
    if (!rail) return null;
    rail.active = active;
    rail.updatedAtIso = new Date().toISOString();
    return rail;
  });
}

export function listVerifiedEnterprises(): VerifiedEnterpriseProfile[] {
  const ledger = readLedger();
  const rails = ledger.bankRails?.length ? ledger.bankRails : buildDefaultBankRails();
  const raw = ledger.enterprises?.length ? ledger.enterprises : buildDefaultEnterprises(rails);
  return raw.map(hydrateEnterpriseMetadata);
}

export function findVerifiedEnterprise(id?: string): VerifiedEnterpriseProfile | undefined {
  const raw = id?.trim().toLowerCase();
  if (!raw) return undefined;
  const needle = raw === "cali-tech-cloud" || raw === "cali-fitness" ? "california-fitness" : raw;
  return listVerifiedEnterprises().find((e) => e.id.toLowerCase() === needle);
}

export function registerVerifiedEnterprise(input: {
  enterpriseName: string; taxId: string; categoryLabel: string; categoryCode?: string;
  description?: string; logoImageUrl?: string; ownerEmail?: string;
  ownerWalletAddress?: `0x${string}`; merchantContractAddress?: `0x${string}`; linkedBankRailId: string;
  accountNo: string; accountName: string;
  initialPackage?: {
    label: string;
    durationLabel: string;
    amountVnd: number;
    imageDataUrl?: string;
    benefits?: string[];
    guaranteeRightLabel?: string;
  };
}): VerifiedEnterpriseProfile {
  return mutateLedger((ledger) => {
    const rail = requireActiveRail(ensureRails(ledger), input.linkedBankRailId);
    const enterprises = ensureEnterprises(ledger);
    const accountName = normalizeHolderOrThrow(input.accountName);
    const taxId = input.taxId.trim();
    const nowIso = new Date().toISOString();
    const shortHash = keccak256(toHex(`${taxId}:${input.enterpriseName}:${Date.now()}:${enterprises.length}`)).slice(2, 8);
    const id = `ent-${toSlug(input.enterpriseName)}-${shortHash}`;
    const ownerEmail = input.ownerEmail?.trim().toLowerCase() || `kyb.${taxId}@opalx.vn`;
    const derived = deriveEmbeddedUserWallet({ provider: "EMAIL", email: ownerEmail, displayName: input.enterpriseName, defaultScopeId: id });
    const ownerWalletAddress = input.ownerWalletAddress ?? derived.walletAddress;
    const merchantContractAddress = input.merchantContractAddress ?? derived.merchantContractAddress;
    const proofMeta = computeEnterpriseProofMeta({
      id,
      taxId,
      merchantContractAddress,
      deployedAtIso: nowIso,
    });
    const packages: EnterpriseServicePackage[] = input.initialPackage
      ? [
          buildPackageRecord({
            id: `pkg-${shortHash}-1`,
            label: input.initialPackage.label,
            durationLabel: input.initialPackage.durationLabel,
            amountVnd: input.initialPackage.amountVnd,
            active: true,
            imageDataUrl: input.initialPackage.imageDataUrl,
            benefits: input.initialPackage.benefits,
            guaranteeRightLabel: input.initialPackage.guaranteeRightLabel,
          }),
        ]
      : [];
    const created: VerifiedEnterpriseProfile = {
      id,
      enterpriseName: input.enterpriseName.trim(),
      taxId,
      categoryCode: input.categoryCode?.trim().toUpperCase() || toSlug(input.categoryLabel).replace(/-/g, "_").toUpperCase(),
      categoryLabel: input.categoryLabel.trim(),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(input.logoImageUrl?.trim() ? { logoImageUrl: input.logoImageUrl.trim() } : {}),
      ownerEmail,
      ownerWalletAddress,
      merchantContractAddress,
      ...proofMeta,
      kybVerified: true,
      linkedBankRailId: rail.id,
      bankBin: rail.bankBin,
      bankShortName: rail.shortName,
      accountNo: input.accountNo.trim(),
      accountName,
      packages,
      updatedAtIso: nowIso,
    };
    enterprises.unshift(created);
    return created;
  });
}

export function updateEnterpriseProfile(input: {
  enterpriseId: string;
  enterpriseName?: string;
  categoryLabel?: string;
  description?: string;
  logoImageUrl?: string;
}): VerifiedEnterpriseProfile {
  return withEnterprise(input.enterpriseId, (ent) => {
    if (input.enterpriseName?.trim()) ent.enterpriseName = input.enterpriseName.trim();
    if (input.categoryLabel?.trim()) ent.categoryLabel = input.categoryLabel.trim();
    if (input.description !== undefined) {
      if (input.description.trim()) ent.description = input.description.trim();
      else delete ent.description;
    }
    if (input.logoImageUrl !== undefined) {
      if (input.logoImageUrl.trim()) ent.logoImageUrl = input.logoImageUrl.trim();
      else delete ent.logoImageUrl;
    }
  });
}

export function updateEnterpriseBankLink(input: {
  enterpriseId: string; linkedBankRailId: string; accountNo: string; accountName: string;
  useCustomQrImage?: boolean; customQrImageDataUrl?: string;
}): VerifiedEnterpriseProfile {
  return withEnterprise(input.enterpriseId, (ent, rails) => {
    const rail = requireActiveRail(rails, input.linkedBankRailId);
    const accountName = normalizeHolderOrThrow(input.accountName);
    const nextQr = input.customQrImageDataUrl !== undefined ? input.customQrImageDataUrl || undefined : ent.customQrImageDataUrl;
    Object.assign(ent, { linkedBankRailId: rail.id, bankBin: rail.bankBin, bankShortName: rail.shortName, accountNo: input.accountNo.trim(), accountName });
    if (nextQr) ent.customQrImageDataUrl = nextQr;
    else delete ent.customQrImageDataUrl;
    if (input.useCustomQrImage !== undefined || (ent.useCustomQrImage && !nextQr)) {
      ent.useCustomQrImage = Boolean(input.useCustomQrImage ?? ent.useCustomQrImage) && Boolean(nextQr);
    }
  });
}

export function addEnterprisePackage(input: {
  enterpriseId: string;
  label: string;
  durationLabel: string;
  amountVnd: number;
  imageDataUrl?: string;
  benefits?: string[];
  guaranteeRightLabel?: string;
}): VerifiedEnterpriseProfile {
  return withEnterprise(input.enterpriseId, (ent) => {
    const pkgHash = keccak256(toHex(`${ent.id}:${input.label}:${Date.now()}:${ent.packages.length}`)).slice(2, 8);
    ent.packages.push(
      buildPackageRecord({
        id: `pkg-${toSlug(input.label).slice(0, 12)}-${pkgHash}`,
        label: input.label,
        durationLabel: input.durationLabel,
        amountVnd: input.amountVnd,
        active: true,
        imageDataUrl: input.imageDataUrl,
        benefits: input.benefits,
        guaranteeRightLabel: input.guaranteeRightLabel,
      }),
    );
  });
}

export function toggleEnterprisePackage(input: { enterpriseId: string; packageId: string; active: boolean }): VerifiedEnterpriseProfile {
  return withEnterprise(input.enterpriseId, (ent) => {
    const pkg = ent.packages.find((p) => p.id === input.packageId);
    if (!pkg) throw new Error("PACKAGE_NOT_FOUND");
    pkg.active = input.active;
  });
}

export function deleteEnterprisePackage(input: { enterpriseId: string; packageId: string }): VerifiedEnterpriseProfile {
  return withEnterprise(input.enterpriseId, (ent) => {
    const idx = ent.packages.findIndex((p) => p.id === input.packageId);
    if (idx < 0) throw new Error("PACKAGE_NOT_FOUND");
    ent.packages.splice(idx, 1);
  });
}

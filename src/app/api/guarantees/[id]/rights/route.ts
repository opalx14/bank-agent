import { z } from "zod";
import { signUserWalletAction } from "@/core/auth/wallet-auth";
import { findGuarantee, getActiveUserSession, mutateLedger } from "@/core/ledger/store";
import type { GuaranteeCertificate, GuaranteeRightClaim, GuaranteeRightKind } from "@/types";

const claimRightSchema = z.object({
  kind: z.enum(["CHECKIN_PASS", "VAULT_COVERAGE", "ERC8004_PRIVILEGE"]),
  email: z.string().trim().email().optional().or(z.literal("")),
});

function buildRightCopy(
  kind: GuaranteeRightKind,
  guarantee: GuaranteeCertificate,
): { label: string; verificationNote: string } {
  const enterprise = guarantee.enterpriseName ?? "OpalX";
  const product = guarantee.productName ?? guarantee.guaranteeId;
  if (kind === "CHECKIN_PASS") {
    return {
      label: "Present Club / Service Check-in",
      verificationNote: `Signed member QR verification at ${enterprise} counter for ${product} (0 PII on-chain).`,
    };
  }
  if (kind === "VAULT_COVERAGE") {
    return {
      label: "Activate PolicyVault Coverage",
      verificationNote: `Verified ${guarantee.collateralAvax} AVAX escrow collateral on Avalanche Fuji PolicyVault for ${guarantee.guaranteeId}.`,
    };
  }
  return {
    label: "Verify ERC-8004 Membership Rights",
    verificationNote: `Verified membership benefits & ERC-8004 reputation bound to Contract ${guarantee.merchantContractAddress ?? guarantee.enterpriseAddress}.`,
  };
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const parsed = claimRightSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_RIGHT_CLAIM_PAYLOAD", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const decodedId = decodeURIComponent(id).trim();
  const guarantee = findGuarantee(decodedId);

  if (!guarantee) {
    return Response.json(
      { error: "GUARANTEE_NOT_FOUND", guaranteeId: decodedId },
      { status: 404 },
    );
  }
  if (guarantee.revoked) {
    return Response.json(
      { error: "GUARANTEE_REVOKED", guaranteeId: guarantee.guaranteeId },
      { status: 400 },
    );
  }

  const email = (
    parsed.data.email?.trim() ||
    getActiveUserSession()?.email ||
    guarantee.buyerEmail ||
    "member.opalx@gmail.com"
  ).toLowerCase();

  const confirmation = await signUserWalletAction({
    email,
    action: "CLAIM_GUARANTEE_RIGHT",
    summary: `${parsed.data.kind}:${guarantee.guaranteeId}:${guarantee.enterpriseName ?? "OpalX"}`,
  });

  const rightMeta = buildRightCopy(parsed.data.kind, guarantee);
  const claim: GuaranteeRightClaim = {
    id: `RGT-${Date.now()}-${parsed.data.kind}`,
    kind: parsed.data.kind,
    label: rightMeta.label,
    claimedByEmail: email,
    walletAddress: confirmation.walletAddress,
    signature: confirmation.signature,
    digestHex: confirmation.digestHex,
    claimedAtIso: confirmation.signedAtIso,
    verificationNote: rightMeta.verificationNote,
  };

  const updated = mutateLedger((ledger) => {
    const target = ledger.guarantees.find(
      (g) => g.guaranteeId.toLowerCase() === guarantee.guaranteeId.toLowerCase(),
    );
    if (!target) return null;
    const prev = Array.isArray(target.claimedRights) ? target.claimedRights : [];
    target.claimedRights = [claim, ...prev.filter((item) => item.kind !== parsed.data.kind)];
    return { ...target, claimedRights: [...target.claimedRights] };
  });

  if (!updated) {
    return Response.json(
      { error: "GUARANTEE_NOT_FOUND", guaranteeId: decodedId },
      { status: 404 },
    );
  }

  return Response.json(
    {
      guarantee: updated,
      claim,
      avalancheProof: {
        chainId: 43113 as const,
        txHash: updated.proofBundle.guaranteeTxHash,
      },
    },
    { status: 200 },
  );
}

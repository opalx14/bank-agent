import { describe, expect, test } from "bun:test";
import { AVAX_FAUCET_RESOURCES, resolveAccountClassification } from "@/core/bank/bank.account-mode";
import { OPALX_PROJECT_ROADMAP } from "@/core/opalx/opalx.roadmap-data";
import { buildAvaxTreasurySnapshot, computeLiquidityCredits, resolveTierFromCredits } from "@/core/opalx/opalx.treasury";
import { BANK_GATEWAY_ABI, ENTERPRISE_GATEWAY_ABI, OPALX_CORE_ABI } from "@/lib/avalanche/avalanche.abis";
import { buildAgentRegistrationCard } from "@/lib/avalanche/avalanche.agent-card";
import { getAgentWalletStatus } from "@/lib/avalanche/avalanche.agent-wallet";
import type { GuaranteeCertificate } from "@/types";

function makeGuarantee(sandbox: boolean, index: number): GuaranteeCertificate {
  return {
    guaranteeId: `OPX-2026-${String(index).padStart(4, "0")}`,
    orderCode: 20260000 + index,
    amountVnd: 1_500_000,
    railMode: sandbox ? "SANDBOX" : "LIVE_BANK",
    sandbox,
    maskedBankRef: "FT26***0001",
    orderCommitment: `0x${"1".repeat(64)}`,
    bankRefCommitment: `0x${"2".repeat(64)}`,
    invoiceCommitment: `0x${"3".repeat(64)}`,
    enterpriseAddress: "0x78BF34e40C66b5B3Ed5f14612b927239BAC88676",
    collateralAvax: "0.0002",
    reputationCreditsAwarded: sandbox ? 0 : 10,
    creditTierAfter: "STANDARD",
    proofBundle: {
      mode: "LIVE_FUJI_AVAX",
      enterpriseTxHash: `0x${"a".repeat(64)}`,
      bankTxHash: `0x${"b".repeat(64)}`,
      guaranteeTxHash: `0x${"c".repeat(64)}`,
      collateralAvax: "0.0002",
    },
    verifyPath: `/verify/OPX-2026-${String(index).padStart(4, "0")}`,
    issuedAtIso: "2026-11-14T05:00:00.000Z",
    revoked: false,
  };
}

describe("Pure-AVAX Account Classification, Treasury & 3-Gateway ABIs", () => {
  test("classifies DEMO vs LIVE_DIRECT_ACCOUNT safely without leaking secrets and lists AVAX faucet only", () => {
    const demoOnly = resolveAccountClassification({ AVALANCHE_ISSUER_PRIVATE_KEY: `0x${"4".repeat(64)}` });
    expect(demoOnly.defaultProfile).toBe("DEMO_ACCOUNT");
    expect(demoOnly.liveReadiness.readyForLiveBank).toBe(false);
    expect(demoOnly.liveReadiness.fujiWalletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(JSON.stringify(demoOnly)).not.toContain("4".repeat(64));

    const liveReady = resolveAccountClassification({
      OPALX_SANDBOX_MODE: "false",
      PAYOS_CLIENT_ID: "cid",
      PAYOS_API_KEY: "apikey",
      PAYOS_CHECKSUM_KEY: "ckey",
      OPALX_VIETQR_ACCOUNT_NO: "03120006789",
      AVALANCHE_ISSUER_PRIVATE_KEY: `0x${"4".repeat(64)}`,
      NEXT_PUBLIC_ENTERPRISE_GATEWAY_ADDRESS: "0xaE97E6Bd5e581D2AFFa6364bdc5975f9eF3f86CB",
      NEXT_PUBLIC_BANK_GATEWAY_ADDRESS: "0xF786333845a1b373b455D8f419b42291F821e721",
      NEXT_PUBLIC_OPALX_CORE_ADDRESS: "0xF83BbE11F98c47423cC343823b15a1028175fe4B",
    });
    expect(liveReady.defaultProfile).toBe("LIVE_DIRECT_ACCOUNT");
    expect(liveReady.profiles.LIVE_DIRECT_ACCOUNT.maskedBankAccount).toBe("****6789");
    expect(AVAX_FAUCET_RESOURCES.every((f) => f.tokenSymbol === "AVAX")).toBe(true);
    expect(AVAX_FAUCET_RESOURCES).toHaveLength(1);
    expect(AVAX_FAUCET_RESOURCES[0]?.faucetUrl).toContain("core.app");
  });

  test("computes pure-AVAX vault reserve math and credit tiers ignoring sandbox spam", () => {
    expect(resolveTierFromCredits(0)).toBe("STANDARD");
    expect(resolveTierFromCredits(30)).toBe("SILVER_NET15");
    expect(resolveTierFromCredits(100)).toBe("GOLD_NET30");

    const guarantees = [
      makeGuarantee(true, 1),
      makeGuarantee(true, 2),
      ...Array.from({ length: 4 }, (_, i) => makeGuarantee(false, i + 10)),
    ];
    expect(computeLiquidityCredits(guarantees)).toBe(40);

    const snapshot = buildAvaxTreasurySnapshot({ guarantees, vaultPaused: false });
    expect(snapshot.currency).toBe("AVAX");
    expect(snapshot.chainId).toBe(43113);
    expect(snapshot.creditTier).toBe("SILVER_NET15");
    expect(snapshot.lockedCollateralAvax).toBe(0.0012);
    expect(snapshot.availableReserveAvax).toBe(0.0038);
  });

  test("exports 3-gateway ABIs, ERC-8004 pure-AVAX card, and structured roadmap phases", () => {
    expect(ENTERPRISE_GATEWAY_ABI.some((item) => item.type === "function" && item.name === "registerEnterpriseOrder")).toBe(true);
    expect(BANK_GATEWAY_ABI.some((item) => item.type === "function" && item.name === "attestBankSettlement")).toBe(true);
    expect(OPALX_CORE_ABI.some((item) => item.type === "function" && item.name === "settleVerificationFee")).toBe(true);

    const card = buildAgentRegistrationCard("https://opalx-go.example/");
    expect(card.settlementCurrency).toBe("AVAX");
    expect(card.services.some((s) => s.endpoint === "https://opalx-go.example/api/avax/settle-fee")).toBe(true);
    expect(OPALX_PROJECT_ROADMAP.length).toBeGreaterThanOrEqual(4);

    const agentStatus = getAgentWalletStatus({
      AVALANCHE_ISSUER_PRIVATE_KEY: `0x${"4".repeat(64)}`,
      NEXT_PUBLIC_PRIVY_APP_ID: "privy_app",
      PRIVY_APP_SECRET: "privy_sec",
      PRIVY_AGENT_SIGNER_ID: "signer_1",
      PRIVY_AGENT_POLICY_ID: "policy_1",
      PRIVY_AGENT_PRIVATE_KEY: "pk_p256",
      AGENT_MAX_AVAX: "0.005",
    });
    expect(agentStatus.popupFree).toBe(true);
    expect(agentStatus.extensionRequired).toBe(false);
    expect(agentStatus.activeDriver).toBe("PRIVY_DELEGATED_SIGNER");
    expect(agentStatus.maxPerTxAvax).toBe("0.005");
    expect(JSON.stringify(agentStatus)).not.toContain("privy_sec");
    expect(JSON.stringify(agentStatus)).not.toContain("pk_p256");
  });
});

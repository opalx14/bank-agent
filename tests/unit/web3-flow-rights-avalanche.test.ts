import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyMessage } from "viem";
import { POST as postWalletLogin } from "@/app/api/auth/wallet-login/route";
import { GET as getVerifyStack } from "@/app/api/avalanche/verify-stack/route";
import { GET as getEnterprises, POST as postEnterprises } from "@/app/api/enterprises/route";
import { POST as claimGuaranteeRight } from "@/app/api/guarantees/[id]/rights/route";
import { POST as createOrder } from "@/app/api/orders/create/route";
import { POST as simulateBank } from "@/app/api/sandbox/simulate-bank/route";
import type { AvalancheStackVerification, GuaranteeCertificate, VerifiedEnterpriseProfile } from "@/types";

let tempDir = "";
let prevLedgerPath: string | undefined;
let prevOffline: string | undefined;

const jsonPost = (url: string, body: unknown) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeAll(() => {
  prevLedgerPath = process.env.OPALX_LEDGER_PATH;
  prevOffline = process.env.OPALX_OFFLINE_TEST;
  tempDir = mkdtempSync(path.join(tmpdir(), "opalx-web3-flow-"));
  process.env.OPALX_LEDGER_PATH = path.join(tempDir, "ledger.json");
  process.env.OPALX_OFFLINE_TEST = "1";
});

afterAll(() => {
  if (prevLedgerPath === undefined) delete process.env.OPALX_LEDGER_PATH;
  else process.env.OPALX_LEDGER_PATH = prevLedgerPath;
  if (prevOffline === undefined) delete process.env.OPALX_OFFLINE_TEST;
  else process.env.OPALX_OFFLINE_TEST = prevOffline;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe("End-to-End Web3 Onboarding, Smart Contract Enterprise, Dual Payment, Guarantee Rights & Avalanche Stack", () => {
  test("executes Enterprise Email -> Smart Contract + Packages -> Customer Dual Pay -> Guarantee Rights -> Avalanche 6-Pillar Verify", async () => {
    const entLoginRes = await postWalletLogin(
      jsonPost("http://localhost/api/auth/wallet-login", {
        mode: "LOGIN",
        provider: "EMAIL",
        email: "founder@goldengym.vn",
        displayName: "Golden Gym Founder",
        role: "ENTERPRISE",
      }),
    );
    expect(entLoginRes.status).toBe(200);
    const entLogin = await entLoginRes.json();
    expect(entLogin.session.role).toBe("ENTERPRISE");
    expect(entLogin.session.merchantContractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);

    const regRes = await postEnterprises(
      jsonPost("http://localhost/api/enterprises", {
        action: "REGISTER_ENTERPRISE",
        enterpriseName: "Golden Gym Wellness",
        taxId: "0319876543",
        categoryLabel: "Fitness, Gym & Yoga",
        ownerEmail: "founder@goldengym.vn",
        ownerWalletAddress: entLogin.session.walletAddress,
        merchantContractAddress: entLogin.session.merchantContractAddress,
        linkedBankRailId: "bank-mb",
        accountNo: "0988776655",
        accountName: "Golden Gym Corp",
        initialPackage: {
          label: "Diamond 6-Month Pass",
          durationLabel: "6 months · All Clubs",
          amountVnd: 3_600_000,
          guaranteeRightLabel: "Membership Pass & Club Guarantee",
          benefits: ["Front-desk QR check-in", "100% PolicyVault coverage"],
        },
      }),
    );
    expect(regRes.status).toBe(200);
    const regJson = (await regRes.json()) as { enterprise: VerifiedEnterpriseProfile; enterprises: VerifiedEnterpriseProfile[] };
    const ent = regJson.enterprise;
    expect(ent.ownerEmail).toBe("founder@goldengym.vn");
    expect(ent.kybCommitmentHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(ent.contractDeploymentTxHash).toMatch(/^0x[a-f0-9]{64}$/);
    expect(ent.packages[0].benefits).toContain("Front-desk QR check-in");

    const addPkgRes = await postEnterprises(
      jsonPost("http://localhost/api/enterprises", {
        action: "ADD_PACKAGE",
        enterpriseId: ent.id,
        label: "PT VIP 12-Month Pass",
        durationLabel: "12 months · With Coach",
        amountVnd: 9_800_000,
        guaranteeRightLabel: "Platinum Privileges",
        benefits: ["Front-desk QR check-in", "ERC-8004 membership tier credits"],
      }),
    );
    expect(addPkgRes.status).toBe(200);

    const listRes = await getEnterprises();
    const listJson = (await listRes.json()) as { enterprises: VerifiedEnterpriseProfile[] };
    expect(listJson.enterprises[0].id).toBe(ent.id);
    expect(listJson.enterprises.some((e) => e.id === "california-fitness")).toBe(true);

    const custLoginRes = await postWalletLogin(
      jsonPost("http://localhost/api/auth/wallet-login", {
        mode: "LOGIN",
        provider: "EMAIL",
        email: "member.vip@gmail.com",
        displayName: "Minh Khoa Nguyen",
        role: "CUSTOMER",
      }),
    );
    expect(custLoginRes.status).toBe(200);
    const custLogin = await custLoginRes.json();

    const ordRes = await createOrder(
      jsonPost("http://localhost/api/orders/create", {
        orderCode: 20269951,
        enterpriseId: ent.id,
        useEnterpriseBank: true,
        amountVnd: 9_800_000,
        productName: "PT VIP 12-Month Pass",
        payerName: "Minh Khoa Nguyen",
        buyerEmail: "member.vip@gmail.com",
        paymentMethod: "OPALX_DIRECT",
        confirmedByWallet: custLogin.session.walletAddress,
        merchantContractAddress: custLogin.session.merchantContractAddress,
      }),
    );
    expect(ordRes.status).toBe(201);
    const ordJson = await ordRes.json();
    expect(ordJson.order.buyerEmail).toBe("member.vip@gmail.com");
    expect(ordJson.order.paymentMethod).toBe("OPALX_DIRECT");
    expect(ordJson.order.bankAccountNo).toBe("0988776655");

    const settleRes = await simulateBank(
      jsonPost("http://localhost/api/sandbox/simulate-bank", {
        orderCode: 20269951,
        scenario: "ALLOW_VALID",
        bankReference: "FT_OPALX_DIRECT_9951",
      }),
    );
    expect(settleRes.status).toBe(200);
    const settleJson = (await settleRes.json()) as { guarantee: GuaranteeCertificate };
    const guarantee = settleJson.guarantee;
    expect(guarantee.buyerEmail).toBe("member.vip@gmail.com");
    expect(guarantee.enterpriseId).toBe(ent.id);
    expect(guarantee.benefits).toContain("ERC-8004 membership tier credits");

    for (const kind of ["CHECKIN_PASS", "VAULT_COVERAGE", "ERC8004_PRIVILEGE"] as const) {
      const rightRes = await claimGuaranteeRight(
        jsonPost(`http://localhost/api/guarantees/${guarantee.guaranteeId}/rights`, { kind, email: "member.vip@gmail.com" }),
        { params: Promise.resolve({ id: guarantee.guaranteeId }) },
      );
      expect(rightRes.status).toBe(200);
      const rightJson = await rightRes.json();
      expect(rightJson.claim.kind).toBe(kind);
      expect(rightJson.avalancheProof.chainId).toBe(43113);

      const expectedSummary = `${kind}:${guarantee.guaranteeId}:${ent.enterpriseName}`;
      const expectedMessage = `OpalX GO Confirmation\nAction: CLAIM_GUARANTEE_RIGHT\nWallet: ${rightJson.claim.walletAddress}\nContract: ${custLogin.session.merchantContractAddress}\nSummary: ${expectedSummary}\nHash: ${rightJson.claim.digestHex}`;
      const sigOk = await verifyMessage({
        address: rightJson.claim.walletAddress,
        message: expectedMessage,
        signature: rightJson.claim.signature,
      });
      expect(sigOk).toBe(true);
    }

    const repeatRes = await claimGuaranteeRight(
      jsonPost(`http://localhost/api/guarantees/${guarantee.guaranteeId}/rights`, { kind: "CHECKIN_PASS", email: "member.vip@gmail.com" }),
      { params: Promise.resolve({ id: guarantee.guaranteeId }) },
    );
    expect(repeatRes.status).toBe(200);
    const repeatJson = (await repeatRes.json()) as { guarantee: GuaranteeCertificate };
    expect(repeatJson.guarantee.claimedRights?.length).toBe(3);

    const missingRes = await claimGuaranteeRight(
      jsonPost("http://localhost/api/guarantees/NO_SUCH_GUARANTEE/rights", { kind: "CHECKIN_PASS" }),
      { params: Promise.resolve({ id: "NO_SUCH_GUARANTEE" }) },
    );
    expect(missingRes.status).toBe(404);

    const verifyRes = await getVerifyStack(
      new Request(`http://localhost/api/avalanche/verify-stack?guaranteeId=${encodeURIComponent(guarantee.guaranteeId)}`),
    );
    expect(verifyRes.status).toBe(200);
    const verifyJson = (await verifyRes.json()) as AvalancheStackVerification;
    expect(verifyJson.chainId).toBe(43113);
    expect(verifyJson.pillars.map((p) => p.id)).toEqual(["FUJI_CHAIN", "THREE_GATEWAYS", "WASM_KERNEL", "ERC_8004", "X402_USDC", "PASSKEY_P256"]);
    expect(verifyJson.x402.assetAddress).toBe("0x5425890298aed601595a70AB815c96711a31Bc65");
    expect(verifyJson.x402.domainName).toBe("USD Coin");
    expect(verifyJson.x402.domainVersion).toBe("2");
    expect(verifyJson.erc8004.identityRegistry).toBe("0x8004A818BFB912233c491871b3d84c89A494BD9e");
    expect(verifyJson.erc8004.reputationRegistry).toBe("0x8004B663056A597Dffe9eCcC1965A193B7388713");
    expect(verifyJson.passkeyP256Verifier).toBe("0xc2b78104907F722DABAc4C69f826a522B2754De4");
    expect(verifyJson.wasmPolicyKernel.verdictSample).toBe("ALLOW");
    expect(verifyJson.wasmPolicyKernel.zeroPiiOnChain).toBe(true);
    expect(verifyJson.guaranteeChecked?.guaranteeId).toBe(guarantee.guaranteeId);
  });
});

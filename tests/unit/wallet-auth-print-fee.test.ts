import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { verifyMessage } from "viem";
import { GET as getWalletLogin, POST as postWalletLogin } from "@/app/api/auth/wallet-login/route";
import { POST as postBankConfig } from "@/app/api/bank/config/route";
import { GET as getPrintHtml } from "@/app/api/guarantees/[id]/print-html/route";
import { POST as recordPrint } from "@/app/api/guarantees/[id]/record-print/route";
import { POST as createOrder } from "@/app/api/orders/create/route";
import { POST as simulateBank } from "@/app/api/sandbox/simulate-bank/route";
import { deriveEmbeddedUserWallet, signUserWalletAction } from "@/core/auth/wallet-auth";
import { resolveEnterpriseCategory } from "@/core/enterprise/catalog";
import { computePrintFeeBreakdown } from "@/core/opalx/print-fee";

let tempDir = "";
let prevLedgerPath: string | undefined;
let prevOffline: string | undefined;

const jsonPost = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

beforeAll(() => {
  prevLedgerPath = process.env.OPALX_LEDGER_PATH;
  prevOffline = process.env.OPALX_OFFLINE_TEST;
  tempDir = mkdtempSync(path.join(tmpdir(), "opalx-wallet-fee-"));
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

describe("Google/Email wallet provisioning, California Fitness catalog & Avalanche print fees", () => {
  test("derives deterministic EVM wallet + merchant contract and verifies ECDSA confirmation", async () => {
    const s1 = deriveEmbeddedUserWallet({ provider: "GOOGLE", email: "  Member.Gym@Gmail.com " });
    const s2 = deriveEmbeddedUserWallet({ provider: "EMAIL", email: "member.gym@gmail.com" });
    expect(s1.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(s1.merchantContractAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(s1.walletAddress).toBe(s2.walletAddress);
    expect(s1.merchantContractAddress).toBe(s2.merchantContractAddress);
    expect(s1.walletAddress).not.toBe(s1.merchantContractAddress);
    expect(s1.defaultScopeId).toBe("california-fitness");

    const signed = await signUserWalletAction({
      email: "member.gym@gmail.com",
      provider: "GOOGLE",
      action: "CREATE_PAYMENT",
      summary: "12-Month Gym Pass",
    });
    const message = `OpalX GO Confirmation\nAction: ${signed.action}\nWallet: ${signed.walletAddress}\nContract: ${signed.merchantContractAddress}\nSummary: 12-Month Gym Pass\nHash: ${signed.digestHex}`;
    const valid = await verifyMessage({
      address: signed.walletAddress as `0x${string}`,
      message,
      signature: signed.signature as `0x${string}`,
    });
    expect(valid).toBe(true);
  });

  test("resolves California Fitness & Yoga gym packages & calculates Avalanche Fuji print fees", () => {
    const cali = resolveEnterpriseCategory("california-fitness");
    const alias = resolveEnterpriseCategory("cali-tech-cloud");
    if (!cali || !alias) throw new Error("Expected California Fitness catalog item");
    expect(cali.id).toBe("california-fitness");
    expect(alias.id).toBe("california-fitness");
    expect(cali.enterpriseName).toBe("California Fitness & Yoga");
    expect(cali.packages?.some((p) => p.amountVnd === 12_000_000)).toBe(true);
    expect(cali.packages?.some((p) => p.amountVnd === 6_800_000)).toBe(true);

    const fee1 = computePrintFeeBreakdown(1);
    expect(fee1.protocolFeePerPrintAvax).toBe(0.00001);
    expect(fee1.estimatedGasPerPrintAvax).toBe(0.00055);
    expect(fee1.totalFeePerPrintAvax).toBe(0.00056);
    expect(fee1.totalFeePerPrintVnd).toBe(336);

    const fee3 = computePrintFeeBreakdown(3);
    expect(fee3.cumulativeFeeAvax).toBe(0.00168);
    expect(fee3.cumulativeFeeVnd).toBe(1008);
  });

  test("executes wallet login -> custom demo QR -> order -> settle -> record-print & A4 HTML", async () => {
    const loginRes = await postWalletLogin(
      jsonPost("http://localhost/api/auth/wallet-login", {
        mode: "LOGIN",
        provider: "GOOGLE",
        email: "demo.gym@opalx.vn",
        displayName: "Minh Anh",
        role: "ENTERPRISE",
      }),
    );
    expect(loginRes.status).toBe(200);
    const authHeaders = { Cookie: (loginRes.headers.get("set-cookie") ?? "").split(";")[0] };
    const loginJson = await loginRes.json();
    expect(loginJson.session.walletAddress).toMatch(/^0x[a-fA-F0-9]{40}$/);

    const sessionRes = await getWalletLogin(new Request("http://localhost/api/auth/wallet-login", { headers: authHeaders }));
    expect((await sessionRes.json()).session.email).toBe("demo.gym@opalx.vn");

    const confirmRes = await postWalletLogin(
      jsonPost("http://localhost/api/auth/wallet-login", {
        mode: "CONFIRM_WALLET",
        action: "CREATE_PAYMENT",
        summary: "12-Month Gym Pass 12,000,000 VND",
      }, authHeaders),
    );
    expect(confirmRes.status).toBe(200);
    const confirmJson = await confirmRes.json();

    const qrSample = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const bankRes = await postBankConfig(
      jsonPost("http://localhost/api/bank/config", {
        useCustomQrImage: true,
        customQrImageDataUrl: qrSample,
      }, authHeaders),
    );
    expect(bankRes.status).toBe(200);
    expect((await bankRes.json()).bankConfig.useCustomQrImage).toBe(true);

    const ordRes = await createOrder(
      jsonPost("http://localhost/api/orders/create", {
        orderCode: 20269501,
        amountVnd: 12_000_000,
        enterpriseId: "california-fitness",
        productName: "12-Month Gym Pass (All-Club)",
        confirmedByWallet: loginJson.session.walletAddress,
        merchantContractAddress: loginJson.session.merchantContractAddress,
        walletSignature: confirmJson.confirmation.signature,
      }),
    );
    expect(ordRes.status).toBe(201);
    const ordJson = await ordRes.json();
    expect(ordJson.order.customQrImageDataUrl).toBe(qrSample);
    expect(ordJson.qr.qrSvgDataUrl.startsWith("data:image/png;base64,")).toBe(true);
    expect(ordJson.order.confirmedByWallet).toBe(loginJson.session.walletAddress);

    const settleRes = await simulateBank(
      jsonPost("http://localhost/api/sandbox/simulate-bank", {
        orderCode: 20269501,
        scenario: "ALLOW_VALID",
        bankReference: "FT_CALI_GYM_9501",
      }),
    );
    expect(settleRes.status).toBe(200);
    const gId = (await settleRes.json()).guarantee.guaranteeId as string;

    const print1 = await recordPrint(new Request(`http://localhost/api/guarantees/${gId}/record-print`), {
      params: Promise.resolve({ id: gId }),
    });
    expect(print1.status).toBe(200);
    const p1Json = await print1.json();
    expect(p1Json.printed).toBe(true);
    expect(p1Json.guarantee.printCount).toBe(1);
    expect(p1Json.feeBreakdown.cumulativeFeeAvax).toBe(0.00056);

    const print2 = await recordPrint(new Request(`http://localhost/api/guarantees/${gId}/record-print`), {
      params: Promise.resolve({ id: gId }),
    });
    expect(print2.status).toBe(200);
    const p2Json = await print2.json();
    expect(p2Json.guarantee.printCount).toBe(2);
    expect(p2Json.feeBreakdown.cumulativeFeeAvax).toBe(0.00112);

    const htmlRes = await getPrintHtml(new Request(`http://localhost/api/guarantees/${gId}/print-html?paper=a4`), {
      params: Promise.resolve({ id: gId }),
    });
    const html = await htmlRes.text();
    expect(htmlRes.status).toBe(200);
    expect(html).toContain("GUARANTEE RECONCILIATION CERTIFICATE");
    expect(html).toContain("California Fitness &amp; Yoga");
    expect(html).toContain("0.00056 AVAX");
  });
});

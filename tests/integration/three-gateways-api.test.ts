import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET as getAccountMode } from "@/app/api/account-mode/route";
import { GET as getAgentCard } from "@/app/api/agent-card/route";
import { POST as settleAvaxFee } from "@/app/api/avax/settle-fee/route";
import { GET as getBankConfig, POST as postBankConfig } from "@/app/api/bank/config/route";
import { GET as getGuarantees } from "@/app/api/guarantees/route";
import { GET as getGuaranteeById } from "@/app/api/guarantees/[id]/route";
import { GET as getPrintHtml } from "@/app/api/guarantees/[id]/print-html/route";
import { POST as createOrder } from "@/app/api/orders/create/route";
import { POST as toggleKillSwitch } from "@/app/api/policy/kill-switch/route";
import { POST as simulateBank } from "@/app/api/sandbox/simulate-bank/route";
import { GET as getTreasuryStatus } from "@/app/api/treasury/status/route";
import { GET as getAgentWalletSession, POST as postAgentWalletSession } from "@/app/api/wallet/agent-session/route";
import { POST as postPayosWebhook } from "@/app/api/webhooks/payos/route";
import { POST as postSepayWebhook } from "@/app/api/webhooks/sepay/route";
import { computePayosHmacSignature } from "@/core/bank/payos-webhook";
import { buildSampleTt78Xml } from "@/core/enterprise/einvoice-samples";

let tempDir = "";
let prevLedgerPath: string | undefined;
let prevOffline: string | undefined;
let prevChecksum: string | undefined;
let prevSepayKey: string | undefined;

beforeAll(() => {
  prevLedgerPath = process.env.OPALX_LEDGER_PATH;
  prevOffline = process.env.OPALX_OFFLINE_TEST;
  prevChecksum = process.env.PAYOS_CHECKSUM_KEY;
  prevSepayKey = process.env.SEPAY_WEBHOOK_API_KEY;
  tempDir = mkdtempSync(path.join(tmpdir(), "opalx-e2e-"));
  process.env.OPALX_LEDGER_PATH = path.join(tempDir, "ledger.json");
  process.env.OPALX_OFFLINE_TEST = "1";
  process.env.PAYOS_CHECKSUM_KEY = "e2e_test_checksum_key";
  process.env.SEPAY_WEBHOOK_API_KEY = "e2e_sepay_key_2026";
});

afterAll(() => {
  if (prevLedgerPath === undefined) delete process.env.OPALX_LEDGER_PATH;
  else process.env.OPALX_LEDGER_PATH = prevLedgerPath;
  if (prevOffline === undefined) delete process.env.OPALX_OFFLINE_TEST;
  else process.env.OPALX_OFFLINE_TEST = prevOffline;
  if (prevChecksum === undefined) delete process.env.PAYOS_CHECKSUM_KEY;
  else process.env.PAYOS_CHECKSUM_KEY = prevChecksum;
  if (prevSepayKey === undefined) delete process.env.SEPAY_WEBHOOK_API_KEY;
  else process.env.SEPAY_WEBHOOK_API_KEY = prevSepayKey;
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

function jsonPost(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("3-Gateway End-to-End API Integration", () => {
  test("hydrates seeded live Fuji AVAX proof OPX-2026-0001 and advertises pure-AVAX agent card", async () => {
    const seedRes = await getGuaranteeById(new Request("http://localhost/api/guarantees/OPX-2026-0001"), {
      params: Promise.resolve({ id: "OPX-2026-0001" }),
    });
    expect(seedRes.status).toBe(200);
    const seedJson = await seedRes.json();
    expect(seedJson.guarantee.proofBundle.mode).toBe("LIVE_FUJI_AVAX");
    expect(seedJson.guarantee.proofBundle.guaranteeTxHash).toMatch(/^0x[a-f0-9]{64}$/);

    const cardRes = await getAgentCard(new Request("http://localhost:5238/api/agent-card"));
    const cardJson = await cardRes.json();
    expect(cardJson.settlementCurrency).toBe("AVAX");

    const modeRes = await getAccountMode();
    expect(modeRes.status).toBe(200);
  });

  test("executes Enterprise order -> Bank sandbox/webhook -> OpalXGo AVAX fee & Kill Switch", async () => {
    const orderRes = await createOrder(
      jsonPost("http://localhost/api/orders/create", {
        orderCode: 20269001,
        amountVnd: 1_500_000,
        description: "OPX E2E LIVE ORDER",
        requireInvoiceXml: true,
        invoiceXml: buildSampleTt78Xml({ amountVnd: 1_500_000 }),
        railMode: "LIVE_BANK",
      }),
    );
    expect(orderRes.status).toBe(201);
    const created = await orderRes.json();
    expect(created.qr.qrSvgDataUrl.startsWith("data:image/png;base64,")).toBe(true);

    const webhookData = {
      orderCode: 20269001,
      amount: 1_500_000,
      description: "OPX E2E LIVE ORDER",
      reference: "FT_E2E_LIVE_9001",
      transactionDateTime: "2026-11-14 09:00:00",
      currency: "VND",
    };

    const badSigRes = await postPayosWebhook(
      jsonPost("http://localhost/api/webhooks/payos", {
        code: "00",
        desc: "ok",
        success: true,
        signature: "f".repeat(64),
        data: webhookData,
      }),
    );
    expect(badSigRes.status).toBe(401);

    const goodSig = computePayosHmacSignature(webhookData, "e2e_test_checksum_key");
    const goodHookRes = await postPayosWebhook(
      jsonPost("http://localhost/api/webhooks/payos", {
        code: "00",
        desc: "ok",
        success: true,
        signature: goodSig,
        data: webhookData,
      }),
    );
    expect(goodHookRes.status).toBe(200);
    const hookOutcome = await goodHookRes.json();
    expect(hookOutcome.decision.verdict).toBe("ALLOW");
    const guaranteeId = hookOutcome.guarantee.guaranteeId as string;

    const feeRes = await settleAvaxFee(jsonPost("http://localhost/api/avax/settle-fee", { guaranteeId }));
    expect(feeRes.status).toBe(200);

    const replayRes = await simulateBank(
      jsonPost("http://localhost/api/sandbox/simulate-bank", {
        orderCode: 20269002,
        scenario: "ALLOW_VALID",
        bankReference: "FT_E2E_LIVE_9001",
      }),
    );
    const replayJson = await replayRes.json();
    expect(replayJson.decision.verdict).toBe("DENY");
    expect(replayJson.decision.reasonCode).toBe("MISSING_OR_DUPLICATE_BANK_REF");

    await toggleKillSwitch(jsonPost("http://localhost/api/policy/kill-switch", { action: "pause" }));
    const pausedRes = await simulateBank(
      jsonPost("http://localhost/api/sandbox/simulate-bank", {
        orderCode: 20269003,
        scenario: "ALLOW_VALID",
      }),
    );
    expect((await pausedRes.json()).decision.reasonCode).toBe("VAULT_PAUSED");

    await toggleKillSwitch(jsonPost("http://localhost/api/policy/kill-switch", { action: "unpause" }));
    const treasuryRes = await getTreasuryStatus(
      new Request("http://localhost/api/treasury/status?live=0"),
    );
    expect((await treasuryRes.json()).snapshot.currency).toBe("AVAX");

    const listRes = await getGuarantees();
    expect((await listRes.json()).guarantees.length).toBeGreaterThanOrEqual(2);

    const sessionOffRes = await postAgentWalletSession(jsonPost("http://localhost/api/wallet/agent-session", { enabled: false }));
    expect((await sessionOffRes.json()).agentEnabled).toBe(false);
    const sessionOnRes = await postAgentWalletSession(jsonPost("http://localhost/api/wallet/agent-session", { enabled: true }));
    expect((await sessionOnRes.json()).agentEnabled).toBe(true);
    const sessionGet = await (await getAgentWalletSession()).json();
    expect(sessionGet.popupFree).toBe(true);
    expect(sessionGet.extensionRequired).toBe(false);
  });

  test("configures custom bank STK, settles via SePay webhook, and renders A4/POS80 print HTML", async () => {
    expect((await (await getBankConfig()).json()).supportedBanks).toHaveLength(10);
    const cfgSave = await postBankConfig(jsonPost("http://localhost/api/bank/config", {
      bankBin: "970436", accountNo: "001100889900", accountName: "Nguyễn Văn An", webhookProvider: "SEPAY",
    }));
    expect(cfgSave.status).toBe(200);
    expect((await cfgSave.json()).bankConfig.accountName).toBe("NGUYEN VAN AN");

    const ordRes = await createOrder(jsonPost("http://localhost/api/orders/create", {
      orderCode: 20269100, amountVnd: 5_000_000, enterpriseId: "mekong-agro", payerName: "Green Farm <Demo>",
    }));
    expect(ordRes.status).toBe(201);
    const ordJson = await ordRes.json();
    expect(ordJson.order.bankAccountNo).toBe("001100889900");
    expect(ordJson.order.categoryLabel).toBe("Agro & B2B Supply");

    expect((await postSepayWebhook(jsonPost("http://localhost/api/webhooks/sepay", {
      transferType: "in", transferAmount: 5_000_000, content: "OPX20269100",
    }))).status).toBe(401);
    const auth = { Authorization: "Apikey e2e_sepay_key_2026" };
    expect((await (await postSepayWebhook(jsonPost("http://localhost/api/webhooks/sepay", {
      transferType: "out", transferAmount: 5_000_000, content: "OPX20269100",
    }, auth))).json()).ignored).toBe(true);

    const sepayRes = await postSepayWebhook(jsonPost("http://localhost/api/webhooks/sepay", {
      id: 9901, transferType: "in", transferAmount: 5_000_000, content: "VCB OPX20269100", referenceCode: "FT_SEPAY_9100",
    }, auth));
    expect(sepayRes.status).toBe(200);
    const gId = (await sepayRes.json()).guarantee.guaranteeId as string;

    const a4Res = await getPrintHtml(new Request(`http://localhost/api/guarantees/${gId}/print-html?paper=a4`), { params: Promise.resolve({ id: gId }) });
    const a4Html = await a4Res.text();
    expect(a4Res.status).toBe(200);
    expect(a4Html).toContain("A4 portrait");
    expect(a4Html).toContain("Green Farm &lt;Demo&gt;");
    const posRes = await getPrintHtml(new Request(`http://localhost/api/guarantees/${gId}/print-html?paper=pos80&download=1&autoprint=1`), { params: Promise.resolve({ id: gId }) });
    expect(posRes.headers.get("content-disposition")).toContain(`OpalX-Guarantee-${gId}.html`);
    expect(await posRes.text()).toContain("80mm auto");
    expect((await getPrintHtml(new Request("http://localhost/api/guarantees/NO_SUCH/print-html"), { params: Promise.resolve({ id: "NO_SUCH" }) })).status).toBe(404);
  });
});

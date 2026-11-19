import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET as getBankRails, POST as postBankRails } from "@/app/api/bank/rails/route";
import { GET as getEnterprises, POST as postEnterprises } from "@/app/api/enterprises/route";
import { POST as createOrder } from "@/app/api/orders/create/route";
import { POST as simulateBank } from "@/app/api/sandbox/simulate-bank/route";
import type { BankPartnerRail, VerifiedEnterpriseProfile } from "@/types";

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
  tempDir = mkdtempSync(path.join(tmpdir(), "opalx-three-party-"));
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

describe("3-Party Connected Registry & VietQR Routing", () => {
  test("executes /bank rails -> /enterprise KYB & packages -> /opalx VietQR order & guarantee", async () => {
    const railsRes = await getBankRails();
    expect(railsRes.status).toBe(200);
    const railsJson = (await railsRes.json()) as { bankRails: BankPartnerRail[] };
    const defaultNames = railsJson.bankRails.filter((r) => r.active).map((r) => r.shortName);
    for (const name of ["MB Bank", "Vietcombank", "Techcombank", "ACB"]) {
      expect(defaultNames).toContain(name);
    }

    const addTpbRes = await postBankRails(jsonPost("http://localhost/api/bank/rails", {
      action: "UPSERT_RAIL", bankBin: "970423", webhookProvider: "SEPAY",
      settlementRailLabel: "NAPAS 247 · TPBank Live", feeBps: 14, active: true,
    }));
    expect(addTpbRes.status).toBe(200);
    const tpbJson = (await addTpbRes.json()) as { bankRail: BankPartnerRail };
    expect(tpbJson.bankRail.shortName).toBe("TPBank");
    expect(tpbJson.bankRail.bankBin).toBe("970423");

    const disableAcbRes = await postBankRails(jsonPost("http://localhost/api/bank/rails", {
      action: "TOGGLE_RAIL", railId: "bank-acb", active: false,
    }));
    expect(disableAcbRes.status).toBe(200);
    expect(((await disableAcbRes.json()) as { bankRail: BankPartnerRail }).bankRail.active).toBe(false);

    const blockedEntRes = await postEnterprises(jsonPost("http://localhost/api/enterprises", {
      action: "REGISTER_ENTERPRISE", enterpriseName: "Blocked Rail Corp", taxId: "0319998887",
      categoryLabel: "B2B Services", linkedBankRailId: "bank-acb", accountNo: "1122334455", accountName: "BLOCKED RAIL CORP",
    }));
    expect(blockedEntRes.status).toBe(400);
    expect((await blockedEntRes.json()).error).toBe("BANK_RAIL_INACTIVE_OR_MISSING");

    const regRes = await postEnterprises(jsonPost("http://localhost/api/enterprises", {
      action: "REGISTER_ENTERPRISE", enterpriseName: "OpalX Wellness Spa", taxId: "0317776665",
      categoryLabel: "Spa & Wellness", linkedBankRailId: tpbJson.bankRail.id,
      accountNo: "04455667788", accountName: "OpalX Wellness Corp",
      initialPackage: { label: "Basic Relaxation Pass", durationLabel: "1 month", amountVnd: 990_000 },
    }));
    expect(regRes.status).toBe(200);
    const ent = ((await regRes.json()) as { enterprise: VerifiedEnterpriseProfile }).enterprise;
    expect(ent.kybVerified).toBe(true);
    expect(ent.bankBin).toBe("970423");
    expect(ent.accountName).toBe("OPALX WELLNESS CORP");

    const addPkgRes = await postEnterprises(jsonPost("http://localhost/api/enterprises", {
      action: "ADD_PACKAGE", enterpriseId: ent.id, label: "VIP Pass 2026",
      durationLabel: "12 months · Full Spa", amountVnd: 2_500_000,
    }));
    expect(addPkgRes.status).toBe(200);
    const entWithPkg = ((await addPkgRes.json()) as { enterprise: VerifiedEnterpriseProfile }).enterprise;
    const vipPkg = entWithPkg.packages.find((p) => p.label === "VIP Pass 2026");
    const basePkg = entWithPkg.packages[0];
    expect(vipPkg?.amountVnd).toBe(2_500_000);
    if (!vipPkg || !basePkg) throw new Error("Missing expected packages");

    const togglePkgRes = await postEnterprises(jsonPost("http://localhost/api/enterprises", {
      action: "TOGGLE_PACKAGE", enterpriseId: ent.id, packageId: basePkg.id, active: false,
    }));
    expect(togglePkgRes.status).toBe(200);
    expect(((await togglePkgRes.json()) as { enterprise: VerifiedEnterpriseProfile }).enterprise.packages[0].active).toBe(false);

    const updBankRes = await postEnterprises(jsonPost("http://localhost/api/enterprises", {
      action: "UPDATE_BANK_LINK", enterpriseId: ent.id, linkedBankRailId: tpbJson.bankRail.id,
      accountNo: "88997766554", accountName: "OPALX WELLNESS OFFICIAL",
    }));
    expect(updBankRes.status).toBe(200);
    expect(((await updBankRes.json()) as { enterprise: VerifiedEnterpriseProfile }).enterprise.accountNo).toBe("88997766554");

    const entListJson = (await (await getEnterprises()).json()) as { activeBanks: BankPartnerRail[] };
    expect(entListJson.activeBanks.some((b) => b.id === "bank-acb")).toBe(false);

    const orderRes = await createOrder(jsonPost("http://localhost/api/orders/create", {
      orderCode: 20269801, enterpriseId: ent.id, useEnterpriseBank: true,
      amountVnd: vipPkg.amountVnd, productName: vipPkg.label,
    }));
    expect(orderRes.status).toBe(201);
    const ordJson = await orderRes.json();
    expect(ordJson.order.bankBin).toBe("970423");
    expect(ordJson.order.bankAccountNo).toBe("88997766554");
    expect(ordJson.qr.qrCode).toContain("970423");
    expect(ordJson.qr.qrCode).toContain("88997766554");

    const settleRes = await simulateBank(jsonPost("http://localhost/api/sandbox/simulate-bank", {
      orderCode: 20269801, scenario: "ALLOW_VALID", bankReference: "FT_TPB_WELLNESS_9801",
    }));
    expect(settleRes.status).toBe(200);
    const settleJson = await settleRes.json();
    expect(settleJson.decision.verdict).toBe("ALLOW");
    expect(settleJson.guarantee.enterpriseId).toBe(ent.id);
    expect(settleJson.guarantee.enterpriseName).toBe("OpalX Wellness Spa");
    expect(settleJson.guarantee.productName).toBe("VIP Pass 2026");
    expect(settleJson.guarantee.amountVnd).toBe(2_500_000);
  });
});

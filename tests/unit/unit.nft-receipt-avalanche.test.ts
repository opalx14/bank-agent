import { describe, expect, test } from "bun:test";
import { POST as createOrderPost } from "@/app/api/orders/create/route";
import { GET as getNftReceipt, POST as postNftReceipt } from "@/app/api/guarantees/[id]/nft-receipt/route";
import { renderGuaranteePrintHtml } from "@/core/opalx/opalx.print-certificate";
import { reconcileAndBroadcastProofs } from "@/core/opalx/opalx.reconcile";

const SAMPLE_MANUAL_RECEIPT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const SAMPLE_UPDATED_RECEIPT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8BQzwAEjDAGggAAI+MD/5rQ0wQAAAAASUVORK5CYII=";

describe("Avalanche Fuji ERC-721 NFT Receipt Proof & Manual Invoice Evidence", () => {
  test("anchors manual invoice photo on order creation, binds ERC-721 NFT proof on Fuji (43113), serves JSON/SVG, and embeds in print HTML", async () => {
    const orderCode = Math.floor(Date.now() / 1000) + 7777;
    const req = new Request("http://127.0.0.1:5238/api/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderCode,
        amountVnd: 1_500_000,
        description: `OPX${orderCode} MANUAL RECEIPT`,
        manualReceiptImageDataUrl: SAMPLE_MANUAL_RECEIPT_PNG,
        requireInvoiceXml: false,
        broadcastOnChain: false,
      }),
    });

    const res = await createOrderPost(req);
    expect(res.status).toBe(201);
    const { order } = (await res.json()) as {
      order: Parameters<typeof reconcileAndBroadcastProofs>[0]["order"];
    };
    expect(order.manualReceiptImageDataUrl).toBe(SAMPLE_MANUAL_RECEIPT_PNG);
    expect(order.manualReceiptDigestHex?.startsWith("0x")).toBe(true);

    const outcome = await reconcileAndBroadcastProofs({
      order,
      bankPaidAmountVnd: 1_500_000,
      bankReference: `FT-NFT-${orderCode}`,
      webhookSignatureValid: true,
    });

    expect(outcome.decision.verdict).toBe("ALLOW");
    const guarantee = outcome.guarantee!;
    expect(guarantee.nftReceipt?.standard).toBe("ERC-721");
    expect(guarantee.nftReceipt?.chainId).toBe(43113);
    expect(guarantee.nftReceipt?.caip2).toBe("eip155:43113");
    expect(guarantee.nftReceipt?.hasManualEvidenceImage).toBe(true);
    expect(guarantee.nftReceipt?.evidenceHash).toBe(order.manualReceiptDigestHex!);

    const metaRes = await getNftReceipt(
      new Request(`https://bankagent.opalx14.com/api/guarantees/${guarantee.guaranteeId}/nft-receipt`),
      { params: Promise.resolve({ id: guarantee.guaranteeId }) },
    );
    expect(metaRes.status).toBe(200);
    const metaJson = (await metaRes.json()) as {
      network: { chainId: number; caip2: string };
      tokenId: string;
      hasManualEvidenceImage: boolean;
    };
    expect(metaJson.network.chainId).toBe(43113);
    expect(metaJson.network.caip2).toBe("eip155:43113");
    expect(metaJson.hasManualEvidenceImage).toBe(true);

    const svgRes = await getNftReceipt(
      new Request(`https://bankagent.opalx14.com/api/guarantees/${guarantee.guaranteeId}/nft-receipt?format=svg`),
      { params: Promise.resolve({ id: guarantee.guaranteeId }) },
    );
    expect(svgRes.status).toBe(200);
    expect(svgRes.headers.get("Content-Type")).toContain("image/svg+xml");
    const svgText = await svgRes.text();
    expect(svgText).toContain("AVALANCHE FUJI (43113)");
    expect(svgText).toContain("ATTACHED MANUAL RECEIPT");

    const updateRes = await postNftReceipt(
      new Request(`https://bankagent.opalx14.com/api/guarantees/${guarantee.guaranteeId}/nft-receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceImageDataUrl: SAMPLE_UPDATED_RECEIPT_PNG }),
      }),
      { params: Promise.resolve({ id: guarantee.guaranteeId }) },
    );
    expect(updateRes.status).toBe(200);
    const updateJson = (await updateRes.json()) as {
      ok: boolean;
      nftReceipt: { evidenceHash: `0x${string}`; evidenceImageDataUrl?: string };
    };
    expect(updateJson.ok).toBe(true);
    expect(updateJson.nftReceipt.evidenceImageDataUrl).toBe(SAMPLE_UPDATED_RECEIPT_PNG);
    expect(updateJson.nftReceipt.evidenceHash).not.toBe(guarantee.nftReceipt?.evidenceHash);

    const printHtml = await renderGuaranteePrintHtml({
      guarantee: { ...guarantee, nftReceipt: { ...guarantee.nftReceipt!, ...updateJson.nftReceipt } },
      order,
      origin: "https://bankagent.opalx14.com",
      paper: "a4",
    });
    expect(printHtml).toContain("Avalanche ERC-721 NFT Receipt Evidence (Chain 43113)");
    expect(printHtml).toContain(SAMPLE_UPDATED_RECEIPT_PNG);
  });
});

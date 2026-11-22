import { z } from "zod";
import { attachNftEvidenceToGuarantee, findGuarantee } from "@/core/ledger/ledger.store";
import {
  buildNftReceiptMetadata,
  buildNftReceiptProof,
  computeEvidenceImageDigest,
  renderNftReceiptSvg,
  resolveNftReceiptForGuarantee,
} from "@/core/opalx/opalx.nft-receipt";

const attachEvidenceSchema = z.object({
  evidenceImageDataUrl: z
    .string()
    .min(20)
    .max(900_000)
    .refine((v) => v.startsWith("data:image/"), "INVALID_EVIDENCE_IMAGE_DATA_URL"),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const guarantee = findGuarantee(id);
  if (!guarantee) {
    return Response.json({ error: "GUARANTEE_NOT_FOUND", guaranteeId: id }, { status: 404 });
  }

  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || url.origin;
  const format = url.searchParams.get("format")?.trim().toLowerCase();

  if (format === "svg") {
    const svg = renderNftReceiptSvg(guarantee, origin);
    return new Response(svg, {
      status: 200,
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  const proof = resolveNftReceiptForGuarantee(guarantee);
  const metadata = buildNftReceiptMetadata(guarantee, origin);
  return Response.json(
    {
      ...metadata,
      nftReceipt: proof,
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const existing = findGuarantee(id);
  if (!existing) {
    return Response.json({ error: "GUARANTEE_NOT_FOUND", guaranteeId: id }, { status: 404 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const parsed = attachEvidenceSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_EVIDENCE_PAYLOAD", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const evidenceImageDataUrl = parsed.data.evidenceImageDataUrl.trim();
  const evidenceHash = computeEvidenceImageDigest(evidenceImageDataUrl);

  if (!existing.nftReceipt) {
    existing.nftReceipt = buildNftReceiptProof({
      guaranteeId: existing.guaranteeId,
      orderCommitment: existing.orderCommitment,
      bankRefCommitment: existing.bankRefCommitment,
      invoiceCommitment: existing.invoiceCommitment,
      manualReceiptImageDataUrl: evidenceImageDataUrl,
      manualReceiptDigestHex: evidenceHash,
      mintedAtIso: existing.issuedAtIso,
    });
  }

  const updated = attachNftEvidenceToGuarantee({
    guaranteeId: existing.guaranteeId,
    evidenceImageDataUrl,
    evidenceHash,
  });

  const target = updated ?? existing;
  const origin = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim() || new URL(request.url).origin;
  const proof = resolveNftReceiptForGuarantee(target);
  return Response.json(
    {
      ok: true,
      nftReceipt: proof,
      metadata: buildNftReceiptMetadata(target, origin),
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

import { z } from "zod";
import { requireApiRole } from "@/core/auth/auth.session-guard";
import { SUPPORTED_VN_BANKS } from "@/core/enterprise/enterprise.catalog";
import {
  listBankPartnerRails,
  toggleBankPartnerRail,
  upsertBankPartnerRail,
} from "@/core/registry/registry.portal";

const upsertRailSchema = z.object({
  action: z.literal("UPSERT_RAIL"),
  id: z.string().trim().max(40).optional(),
  bankBin: z.string().trim().regex(/^\d{6}$/, "BANK_BIN_MUST_BE_6_DIGITS"),
  webhookProvider: z.enum(["SEPAY", "PAYOS", "SANDBOX"]).default("SEPAY"),
  settlementRailLabel: z.string().trim().min(2).max(80).optional(),
  feeBps: z.number().int().min(0).max(500).optional(),
  active: z.boolean().optional(),
});

const toggleRailSchema = z.object({
  action: z.literal("TOGGLE_RAIL"),
  railId: z.string().trim().min(1).max(64),
  active: z.boolean(),
});

const bankRailActionSchema = z.discriminatedUnion("action", [
  upsertRailSchema,
  toggleRailSchema,
]);

export async function GET(): Promise<Response> {
  return Response.json(
    {
      bankRails: listBankPartnerRails(),
      supportedBanks: SUPPORTED_VN_BANKS,
      webhookEndpoints: {
        sepayPath: "/api/webhooks/sepay",
        payosPath: "/api/webhooks/payos",
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<Response> {
  const guard = requireApiRole(request, ["BANK"]);
  if (!guard.ok) return guard.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const parsed = bankRailActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_BANK_RAIL_PAYLOAD", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  if (payload.action === "UPSERT_RAIL") {
    const bankRail = upsertBankPartnerRail({
      ...(payload.id ? { id: payload.id } : {}),
      bankBin: payload.bankBin,
      webhookProvider: payload.webhookProvider,
      ...(payload.settlementRailLabel ? { settlementRailLabel: payload.settlementRailLabel } : {}),
      ...(payload.feeBps !== undefined ? { feeBps: payload.feeBps } : {}),
      ...(payload.active !== undefined ? { active: payload.active } : {}),
    });
    return Response.json(
      { bankRail, bankRails: listBankPartnerRails() },
      { status: 200 },
    );
  }

  const toggled = toggleBankPartnerRail(payload.railId, payload.active);
  if (!toggled) {
    return Response.json({ error: "BANK_RAIL_NOT_FOUND" }, { status: 404 });
  }
  return Response.json(
    { bankRail: toggled, bankRails: listBankPartnerRails() },
    { status: 200 },
  );
}

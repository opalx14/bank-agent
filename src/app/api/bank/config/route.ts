import { z } from "zod";
import { requireApiRole } from "@/core/auth/auth.session-guard";
import {
  findSupportedVnBank,
  normalizeAccountHolderName,
  SUPPORTED_VN_BANKS,
} from "@/core/enterprise/enterprise.catalog";
import { getBankConfig, saveBankConfig } from "@/core/ledger/ledger.store";

const bankConfigSchema = z.object({
  bankBin: z.string().trim().regex(/^\d{6}$/, "BANK_BIN_MUST_BE_6_DIGITS").optional(),
  accountNo: z.string().trim().regex(/^[a-zA-Z0-9]{5,24}$/, "INVALID_ACCOUNT_NO").optional(),
  accountName: z.string().trim().min(2).max(60).optional(),
  webhookProvider: z.enum(["SEPAY", "PAYOS", "SANDBOX"]).optional(),
  bankName: z.string().trim().max(80).optional(),
  bankShortName: z.string().trim().max(40).optional(),
  useCustomQrImage: z.boolean().optional(),
  customQrImageDataUrl: z
    .string()
    .max(600_000)
    .refine((v) => v === "" || v.startsWith("data:image/"), "INVALID_QR_IMAGE_DATA_URL")
    .optional(),
});

export async function GET(): Promise<Response> {
  return Response.json(
    {
      bankConfig: getBankConfig(),
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
  const guard = requireApiRole(request, ["ENTERPRISE", "BANK"]);
  if (!guard.ok) return guard.response;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "INVALID_JSON_BODY" }, { status: 400 });
  }

  const parsed = bankConfigSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_BANK_CONFIG_PAYLOAD", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const current = getBankConfig();
  const bankBin = parsed.data.bankBin ?? current.bankBin;
  const accountNo = parsed.data.accountNo ?? current.accountNo;
  const rawHolder = parsed.data.accountName ?? current.accountName;
  const normalizedName = normalizeAccountHolderName(rawHolder);
  if (normalizedName.length < 2) {
    return Response.json({ error: "INVALID_ACCOUNT_HOLDER_NAME" }, { status: 400 });
  }

  const bank = findSupportedVnBank(bankBin);
  const bankShortName = bank?.shortName ?? parsed.data.bankShortName ?? current.bankShortName ?? "NAPAS Bank";
  const bankName = bank?.name ?? parsed.data.bankName ?? current.bankName ?? `NAPAS Bank (${bankBin})`;
  const customQrImageDataUrl =
    parsed.data.customQrImageDataUrl !== undefined
      ? parsed.data.customQrImageDataUrl || undefined
      : current.customQrImageDataUrl;
  const useCustomQrImage =
    parsed.data.useCustomQrImage !== undefined
      ? parsed.data.useCustomQrImage && Boolean(customQrImageDataUrl)
      : Boolean(current.useCustomQrImage && customQrImageDataUrl);

  const bankConfig = saveBankConfig({
    bankBin,
    bankShortName,
    bankName,
    accountNo,
    accountName: normalizedName,
    webhookProvider: parsed.data.webhookProvider ?? current.webhookProvider,
    useCustomQrImage,
    ...(customQrImageDataUrl ? { customQrImageDataUrl } : {}),
    updatedAtIso: new Date().toISOString(),
  });

  return Response.json({ bankConfig }, { status: 200 });
}

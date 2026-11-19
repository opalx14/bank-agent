import { z } from "zod";
import { canMutateEnterprise, requireApiRole } from "@/core/auth/session-guard";
import {
  addEnterprisePackage,
  deleteEnterprisePackage,
  findVerifiedEnterprise,
  listBankPartnerRails,
  listVerifiedEnterprises,
  registerVerifiedEnterprise,
  toggleEnterprisePackage,
  updateEnterpriseBankLink,
  updateEnterpriseProfile,
} from "@/core/registry/portal-registry";

const evmAddrSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, "INVALID_EVM_ADDRESS");
const accountNoSchema = z.string().trim().regex(/^[a-zA-Z0-9]{5,24}$/, "INVALID_ACCOUNT_NO");
const taxIdSchema = z.string().trim().min(10, "TAX_ID_TOO_SHORT").max(14, "TAX_ID_TOO_LONG");
const packageBenefitsSchema = z.array(z.string().trim().min(2).max(120)).max(6).optional();
const guaranteeRightLabelSchema = z.string().trim().max(80).optional();
const imageUrlSchema = z
  .string()
  .max(600_000)
  .refine(
    (v) =>
      v === "" ||
      v.startsWith("data:image/") ||
      v.startsWith("https://") ||
      v.startsWith("http://") ||
      v.startsWith("/"),
    "INVALID_IMAGE_URL",
  )
  .optional();

const enterpriseActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("REGISTER_ENTERPRISE"),
    enterpriseName: z.string().trim().min(2).max(120),
    taxId: taxIdSchema,
    categoryLabel: z.string().trim().min(2).max(80),
    categoryCode: z.string().trim().max(40).optional(),
    description: z.string().trim().max(400).optional(),
    logoImageUrl: imageUrlSchema,
    ownerEmail: z.string().trim().email().optional().or(z.literal("")),
    ownerWalletAddress: evmAddrSchema.optional(),
    merchantContractAddress: evmAddrSchema.optional(),
    linkedBankRailId: z.string().trim().min(1).max(64),
    accountNo: accountNoSchema,
    accountName: z.string().trim().min(2).max(80),
    initialPackage: z
      .object({
        label: z.string().trim().min(2).max(100),
        durationLabel: z.string().trim().min(1).max(60),
        amountVnd: z.number().finite().min(2000),
        imageDataUrl: imageUrlSchema,
        benefits: packageBenefitsSchema,
        guaranteeRightLabel: guaranteeRightLabelSchema,
      })
      .optional(),
  }),
  z.object({
    action: z.literal("UPDATE_PROFILE"),
    enterpriseId: z.string().trim().min(1).max(64),
    enterpriseName: z.string().trim().min(2).max(120).optional(),
    categoryLabel: z.string().trim().min(2).max(80).optional(),
    description: z.string().trim().max(400).optional(),
    logoImageUrl: imageUrlSchema,
  }),
  z.object({
    action: z.literal("UPDATE_BANK_LINK"),
    enterpriseId: z.string().trim().min(1).max(64),
    linkedBankRailId: z.string().trim().min(1).max(64),
    accountNo: accountNoSchema,
    accountName: z.string().trim().min(2).max(80),
    useCustomQrImage: z.boolean().optional(),
    customQrImageDataUrl: z
      .string()
      .max(600_000)
      .refine((v) => v === "" || v.startsWith("data:image/"), "INVALID_QR_IMAGE_DATA_URL")
      .optional(),
  }),
  z.object({
    action: z.literal("ADD_PACKAGE"),
    enterpriseId: z.string().trim().min(1).max(64),
    label: z.string().trim().min(2).max(100),
    durationLabel: z.string().trim().min(1).max(60),
    amountVnd: z.number().finite().min(2000),
    imageDataUrl: imageUrlSchema,
    benefits: packageBenefitsSchema,
    guaranteeRightLabel: guaranteeRightLabelSchema,
  }),
  z.object({
    action: z.literal("TOGGLE_PACKAGE"),
    enterpriseId: z.string().trim().min(1).max(64),
    packageId: z.string().trim().min(1).max(64),
    active: z.boolean(),
  }),
  z.object({
    action: z.literal("DELETE_PACKAGE"),
    enterpriseId: z.string().trim().min(1).max(64),
    packageId: z.string().trim().min(1).max(64),
  }),
]);

export async function GET(): Promise<Response> {
  return Response.json(
    {
      enterprises: listVerifiedEnterprises(),
      activeBanks: listBankPartnerRails().filter((b) => b.active),
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

  const parsed = enterpriseActionSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json(
      { error: "INVALID_ENTERPRISE_PAYLOAD", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  try {
    if (data.action !== "REGISTER_ENTERPRISE") {
      const target = findVerifiedEnterprise(data.enterpriseId);
      if (target && !canMutateEnterprise(guard.session, guard.viaAdminKey, target)) {
        return Response.json({ error: "FORBIDDEN_ENTERPRISE_OWNER" }, { status: 403 });
      }
    }
    let enterprise;
    if (data.action === "REGISTER_ENTERPRISE") {
      enterprise = registerVerifiedEnterprise({
        enterpriseName: data.enterpriseName,
        taxId: data.taxId,
        categoryLabel: data.categoryLabel,
        ...(data.categoryCode ? { categoryCode: data.categoryCode } : {}),
        ...(data.description ? { description: data.description } : {}),
        ...(data.logoImageUrl ? { logoImageUrl: data.logoImageUrl } : {}),
        ...(data.ownerEmail ? { ownerEmail: data.ownerEmail } : {}),
        ...(data.ownerWalletAddress
          ? { ownerWalletAddress: data.ownerWalletAddress as `0x${string}` }
          : {}),
        ...(data.merchantContractAddress
          ? { merchantContractAddress: data.merchantContractAddress as `0x${string}` }
          : {}),
        linkedBankRailId: data.linkedBankRailId,
        accountNo: data.accountNo,
        accountName: data.accountName,
        ...(data.initialPackage ? { initialPackage: data.initialPackage } : {}),
      });
    } else if (data.action === "UPDATE_PROFILE") {
      enterprise = updateEnterpriseProfile(data);
    } else if (data.action === "UPDATE_BANK_LINK") {
      enterprise = updateEnterpriseBankLink({
        enterpriseId: data.enterpriseId,
        linkedBankRailId: data.linkedBankRailId,
        accountNo: data.accountNo,
        accountName: data.accountName,
        ...(data.useCustomQrImage !== undefined ? { useCustomQrImage: data.useCustomQrImage } : {}),
        ...(data.customQrImageDataUrl !== undefined
          ? { customQrImageDataUrl: data.customQrImageDataUrl }
          : {}),
      });
    } else if (data.action === "ADD_PACKAGE") {
      enterprise = addEnterprisePackage(data);
    } else if (data.action === "TOGGLE_PACKAGE") {
      enterprise = toggleEnterprisePackage(data);
    } else {
      enterprise = deleteEnterprisePackage(data);
    }

    return Response.json(
      { enterprise, enterprises: listVerifiedEnterprises() },
      { status: 200 },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "ENTERPRISE_ACTION_FAILED";
    const status = msg === "ENTERPRISE_NOT_FOUND" || msg === "PACKAGE_NOT_FOUND" ? 404 : 400;
    return Response.json({ error: msg }, { status });
  }
}

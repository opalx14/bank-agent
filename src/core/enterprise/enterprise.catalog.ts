import type { EnterpriseCategoryItem, SupportedVnBank } from "@/types";

export const ENTERPRISE_PRODUCT_CATALOG: EnterpriseCategoryItem[] = [
  {
    id: "california-fitness",
    enterpriseName: "California Fitness & Yoga",
    taxId: "0312345678",
    categoryCode: "GYM_FITNESS",
    categoryLabel: "Fitness, Gym & Yoga",
    productName: "12-Month Gym Membership",
    defaultAmountVnd: 12_000_000,
    accentTone: "rose",
    enterpriseAddress: "0x78BF34e40C66b5B3Ed5f14612b927239BAC88676",
    packages: [
      { id: "cali-12m", label: "12-Month Gym Pass", durationLabel: "12 months · All Clubs", amountVnd: 12_000_000 },
      { id: "cali-6m", label: "6-Month Gym Pass", durationLabel: "6 months · Yoga & Gym", amountVnd: 6_800_000 },
      { id: "cali-1m", label: "1-Month Trial Pass", durationLabel: "1 month · 30 days", amountVnd: 1_500_000 },
      { id: "cali-demo", label: "Personal QR Demo Pass", durationLabel: "Transfer test", amountVnd: 10_000 },
    ],
  },
  {
    id: "opalx-roastery",
    enterpriseName: "OpalX Café & Roastery",
    taxId: "0316890123",
    categoryCode: "FB_RETAIL",
    categoryLabel: "F&B & Retail",
    productName: "Monthly Café Membership Card",
    defaultAmountVnd: 150_000,
    accentTone: "amber",
    enterpriseAddress: "0x78BF34e40C66b5B3Ed5f14612b927239BAC88676",
    packages: [
      { id: "cafe-month", label: "Monthly Café Combo Pass", durationLabel: "30 cups / month", amountVnd: 450_000 },
      { id: "cafe-set", label: "Roasted Coffee Beans 500g", durationLabel: "In-store retail", amountVnd: 150_000 },
      { id: "cafe-demo", label: "Tasting Cup (Demo)", durationLabel: "Quick test", amountVnd: 10_000 },
    ],
  },
  {
    id: "mekong-agro",
    enterpriseName: "Mekong Agro Supply",
    taxId: "0109876543",
    categoryCode: "AGRO_B2B",
    categoryLabel: "Agro & B2B Supply",
    productName: "Smart Agri-Supply B2B Batch",
    defaultAmountVnd: 5_000_000,
    accentTone: "emerald",
    enterpriseAddress: "0x78BF34e40C66b5B3Ed5f14612b927239BAC88676",
    packages: [
      { id: "agro-batch", label: "Standard B2B Supply Batch", durationLabel: "Wholesale order", amountVnd: 5_000_000 },
      { id: "agro-bulk", label: "3-Month Harvest Supply Contract", durationLabel: "Bulk order", amountVnd: 15_000_000 },
    ],
  },
  {
    id: "saigon-medequip",
    enterpriseName: "Saigon Care Clinic",
    taxId: "0309988776",
    categoryCode: "MED_HEALTH",
    categoryLabel: "Healthcare & Clinics",
    productName: "Family General Checkup Package",
    defaultAmountVnd: 2_500_000,
    accentTone: "sky",
    enterpriseAddress: "0x78BF34e40C66b5B3Ed5f14612b927239BAC88676",
    packages: [
      { id: "med-checkup", label: "General Health Checkup", durationLabel: "1 visit", amountVnd: 2_500_000 },
      { id: "med-follow", label: "Follow-up & Lab Panel", durationLabel: "Standard", amountVnd: 950_000 },
    ],
  },
];

export const SUPPORTED_VN_BANKS: SupportedVnBank[] = [
  { bin: "970422", shortName: "MB Bank", name: "Military Commercial Joint Stock Bank (MB Bank)", appId: "mb" },
  { bin: "970436", shortName: "Vietcombank", name: "Joint Stock Commercial Bank for Foreign Trade of Vietnam (VCB)", appId: "vcb" },
  { bin: "970407", shortName: "Techcombank", name: "Vietnam Technological and Commercial Bank (TCB)", appId: "tcb" },
  { bin: "970416", shortName: "ACB", name: "Asia Commercial Joint Stock Bank (ACB)", appId: "acb" },
  { bin: "970418", shortName: "BIDV", name: "Bank for Investment and Development of Vietnam (BIDV)", appId: "bidv" },
  { bin: "970415", shortName: "VietinBank", name: "Vietnam Joint Stock Commercial Bank for Industry and Trade (ICB)", appId: "icb" },
  { bin: "970432", shortName: "VPBank", name: "Vietnam Prosperity Joint Stock Commercial Bank (VPBank)", appId: "vpb" },
  { bin: "970423", shortName: "TPBank", name: "Tien Phong Commercial Joint Stock Bank (TPBank)", appId: "tpb" },
  { bin: "970403", shortName: "Sacombank", name: "Saigon Thuong Tin Commercial Joint Stock Bank (STB)", appId: "stb" },
  { bin: "970441", shortName: "VIB", name: "Vietnam International Commercial Joint Stock Bank (VIB)", appId: "vib" },
];

export function resolveEnterpriseCategory(enterpriseId?: string): EnterpriseCategoryItem | undefined {
  const needle = enterpriseId?.trim().toLowerCase();
  if (!needle) return undefined;
  if (needle === "cali-tech-cloud" || needle === "cali-fitness") {
    return ENTERPRISE_PRODUCT_CATALOG[0];
  }
  return ENTERPRISE_PRODUCT_CATALOG.find((item) => item.id.toLowerCase() === needle);
}

export function findSupportedVnBank(bankBin?: string): SupportedVnBank | undefined {
  const needle = bankBin?.trim();
  if (!needle) return undefined;
  return SUPPORTED_VN_BANKS.find(
    (bank) => bank.bin === needle || bank.appId.toLowerCase() === needle.toLowerCase(),
  );
}

/** Normalizes Vietnamese account holder names to ASCII uppercase safe for NAPAS VietQR. */
export function normalizeAccountHolderName(raw: string): string {
  return raw
    .replace(/[đĐ]/g, "D")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

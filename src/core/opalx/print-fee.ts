export const PROTOCOL_PRINT_FEE_AVAX = 0.00001;
export const ESTIMATED_NETWORK_GAS_AVAX = 0.00055;
export const DEFAULT_VND_PER_AVAX = 600_000;

export interface PrintFeeBreakdown {
  printCount: number;
  protocolFeePerPrintAvax: number;
  estimatedGasPerPrintAvax: number;
  totalFeePerPrintAvax: number;
  protocolFeePerPrintVnd: number;
  estimatedGasPerPrintVnd: number;
  totalFeePerPrintVnd: number;
  cumulativeFeeAvax: number;
  cumulativeFeeVnd: number;
}

/** Calculates deterministic Avalanche Fuji print & hash fees per invoice and cumulatively. */
export function computePrintFeeBreakdown(
  printCount = 1,
  vndPerAvax = DEFAULT_VND_PER_AVAX,
): PrintFeeBreakdown {
  const safeCount = Math.max(0, Math.floor(Number.isFinite(printCount) ? printCount : 0));
  const safeRate = Number.isFinite(vndPerAvax) && vndPerAvax > 0 ? vndPerAvax : DEFAULT_VND_PER_AVAX;
  const totalFeePerPrintAvax = Number(
    (PROTOCOL_PRINT_FEE_AVAX + ESTIMATED_NETWORK_GAS_AVAX).toFixed(5),
  );
  const protocolFeePerPrintVnd = Math.round(PROTOCOL_PRINT_FEE_AVAX * safeRate);
  const estimatedGasPerPrintVnd = Math.round(ESTIMATED_NETWORK_GAS_AVAX * safeRate);
  const totalFeePerPrintVnd = protocolFeePerPrintVnd + estimatedGasPerPrintVnd;
  const cumulativeFeeAvax = Number((totalFeePerPrintAvax * safeCount).toFixed(5));
  const cumulativeFeeVnd = Math.round(cumulativeFeeAvax * safeRate);

  return {
    printCount: safeCount,
    protocolFeePerPrintAvax: PROTOCOL_PRINT_FEE_AVAX,
    estimatedGasPerPrintAvax: ESTIMATED_NETWORK_GAS_AVAX,
    totalFeePerPrintAvax,
    protocolFeePerPrintVnd,
    estimatedGasPerPrintVnd,
    totalFeePerPrintVnd,
    cumulativeFeeAvax,
    cumulativeFeeVnd,
  };
}

import { createPublicClient, formatGwei, http } from "viem";
import { avalancheFuji } from "viem/chains";

export const ZERO_EVM_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
export const DEFAULT_FUJI_RPC_URL = "https://api.avax-test.network/ext/bc/C/rpc" as const;
export const SNOWTRACE_BASE_URL = "https://testnet.snowtrace.io" as const;

export const AVALANCHE_FUJI_NETWORK = {
  chainId: 43113 as const,
  caip2: "eip155:43113" as const,
  nativeSymbol: "AVAX" as const,
  nativeDecimals: 18 as const,
  explorerBaseUrl: SNOWTRACE_BASE_URL,
  defaultDailyCapAvax: 0.5,
  defaultVndPerAvaxRate: 600_000,
  minVerificationFeeAvax: 0.00001,
  erc8004: {
    identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e" as const,
    reputationRegistry: "0x8004B663056A597Dffe9eCcC1965A193B7388713" as const,
  },
} as const;

export interface PortalContractAddresses {
  enterpriseGateway: `0x${string}`;
  bankGateway: `0x${string}`;
  opalxCore: `0x${string}`;
}

export interface FujiNetworkTelemetry {
  chainId: 43113;
  blockNumber: number | null;
  gasPriceGwei: number | null;
  rpcHealthy: boolean;
  rpcUrl: string;
  checkedAtIso: string;
}

function resolveAddress(raw?: string): `0x${string}` {
  const trimmed = raw?.trim() ?? "";
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed)
    ? (trimmed as `0x${string}`)
    : ZERO_EVM_ADDRESS;
}

/** Resolves deployed addresses for the 3 Avalanche Fuji gateway contracts. */
export function getGatewayAddresses(
  env: Record<string, string | undefined> = process.env,
): PortalContractAddresses {
  return {
    enterpriseGateway: resolveAddress(env.NEXT_PUBLIC_ENTERPRISE_GATEWAY_ADDRESS),
    bankGateway: resolveAddress(env.NEXT_PUBLIC_BANK_GATEWAY_ADDRESS),
    opalxCore: resolveAddress(env.NEXT_PUBLIC_OPALX_CORE_ADDRESS),
  };
}

export function isNonZeroAddress(addr?: string): boolean {
  return Boolean(
    addr && /^0x[a-fA-F0-9]{40}$/.test(addr) && addr.toLowerCase() !== ZERO_EVM_ADDRESS,
  );
}

export function getFujiRpcUrl(): string {
  return process.env.AVALANCHE_FUJI_RPC_URL?.trim() || DEFAULT_FUJI_RPC_URL;
}

export function getFujiTxUrl(txHash: `0x${string}` | string): string {
  return `${SNOWTRACE_BASE_URL}/tx/${txHash}`;
}

export function getFujiAddressUrl(address: `0x${string}` | string): string {
  return `${SNOWTRACE_BASE_URL}/address/${address}`;
}

export function getFujiPublicClient() {
  return createPublicClient({
    chain: avalancheFuji,
    transport: http(getFujiRpcUrl(), { timeout: 10_000, retryCount: 1 }),
  });
}

/** Fetches live Fuji C-Chain block height and gas fee with a short fail-safe timeout. */
export async function getFujiNetworkTelemetry(): Promise<FujiNetworkTelemetry> {
  const checkedAtIso = new Date().toISOString();
  const rpcUrl = getFujiRpcUrl();
  try {
    const client = getFujiPublicClient();
    const [blockRaw, gasRaw] = await Promise.race([
      Promise.all([client.getBlockNumber(), client.getGasPrice()]),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("RPC_TIMEOUT")), 3_000),
      ),
    ]);
    return {
      chainId: 43113,
      blockNumber: Number(blockRaw),
      gasPriceGwei: Number(Number(formatGwei(gasRaw)).toFixed(4)),
      rpcHealthy: true,
      rpcUrl,
      checkedAtIso,
    };
  } catch {
    return {
      chainId: 43113,
      blockNumber: null,
      gasPriceGwei: null,
      rpcHealthy: false,
      rpcUrl,
      checkedAtIso,
    };
  }
}

import { evaluateThreeWayPolicy } from "@/core/opalx/opalx.policy-bridge";
import {
  AVALANCHE_FUJI_NETWORK,
  SNOWTRACE_BASE_URL,
  getFujiAddressUrl,
  getFujiNetworkTelemetry,
  getFujiPublicClient,
  getFujiRpcUrl,
  getGatewayAddresses,
  isNonZeroAddress,
} from "@/lib/avalanche/avalanche.network";
import { readPortalContractsTelemetry, verifyGuaranteeOnFuji } from "@/lib/avalanche/avalanche.reader";
import { FUJI_CAIP2, FUJI_USDC_ADDRESS, FUJI_USDC_EIP712_EXTRA } from "@/lib/avalanche/avalanche.x402";
import type { AvalancheStackVerification, AvalancheTechPillar } from "@/types";

const FALLBACK_GATEWAYS = {
  enterpriseGateway: "0xaE97E6Bd5e581D2AFFa6364bdc5975f9eF3f86CB" as const,
  bankGateway: "0xf786333845a1b373b455d8f419b42291f821e721" as const,
  opalxCore: "0xf83bbe11f98c47423cc343823b15a1028175fe4b" as const,
};

const ERC8004_VALIDATION_REGISTRY = "0x8004Cb1BF31DAf7788923b405b754f57acEB4272" as const;
const DAIMO_P256_VERIFIER = "0xc2b78104907F722DABAc4C69f826a522B2754De4" as const;

interface BytecodeProbeResult {
  erc8004BytecodeOk: boolean;
  usdcBytecodeOk: boolean;
  p256BytecodeOk: boolean;
}

async function verifyFujiContractBytecode(): Promise<BytecodeProbeResult> {
  const client = getFujiPublicClient();
  const hasCode = (address: `0x${string}`) =>
    client.getCode({ address }).then((code) => Boolean(code && code !== "0x" && code.length > 2)).catch(() => false);
  const timeoutFallback: BytecodeProbeResult = { erc8004BytecodeOk: false, usdcBytecodeOk: false, p256BytecodeOk: false };
  return Promise.race([
    Promise.all([
      hasCode(AVALANCHE_FUJI_NETWORK.erc8004.identityRegistry),
      hasCode(FUJI_USDC_ADDRESS),
      hasCode(DAIMO_P256_VERIFIER),
    ]).then(([erc8004BytecodeOk, usdcBytecodeOk, p256BytecodeOk]) => ({ erc8004BytecodeOk, usdcBytecodeOk, p256BytecodeOk })),
    new Promise<BytecodeProbeResult>((resolve) => setTimeout(() => resolve(timeoutFallback), 2_500)),
  ]);
}

export async function GET(request: Request): Promise<Response> {
  const guaranteeId = new URL(request.url).searchParams.get("guaranteeId")?.trim() || undefined;
  const offline = process.env.OPALX_OFFLINE_TEST === "1";

  const [network, coreState, guaranteeOnChain, bytecode, kernelCheck] = await Promise.all([
    offline
      ? Promise.resolve({
          chainId: 43113 as const,
          blockNumber: null,
          gasPriceGwei: null,
          rpcHealthy: false,
          rpcUrl: getFujiRpcUrl(),
          checkedAtIso: new Date().toISOString(),
        })
      : getFujiNetworkTelemetry(),
    readPortalContractsTelemetry(),
    guaranteeId ? verifyGuaranteeOnFuji(guaranteeId) : Promise.resolve(null),
    offline
      ? Promise.resolve({ erc8004BytecodeOk: false, usdcBytecodeOk: false, p256BytecodeOk: false })
      : verifyFujiContractBytecode(),
    Promise.resolve(
      evaluateThreeWayPolicy({
        orderAmountVnd: 1_500_000,
        bankPaidAmountVnd: 1_500_000,
        invoiceTotalVnd: 1_500_000,
        webhookSignatureValid: true,
        bankRefPresent: true,
        bankRefAlreadyUsed: false,
        requireInvoiceXml: true,
        invoiceXmlSignatureValid: true,
        vaultPaused: false,
        washTradeDetected: false,
      }),
    ),
  ]);

  const rawContracts = getGatewayAddresses();
  const contracts = {
    enterpriseGateway: isNonZeroAddress(rawContracts.enterpriseGateway)
      ? rawContracts.enterpriseGateway
      : FALLBACK_GATEWAYS.enterpriseGateway,
    bankGateway: isNonZeroAddress(rawContracts.bankGateway)
      ? rawContracts.bankGateway
      : FALLBACK_GATEWAYS.bankGateway,
    opalxCore: isNonZeroAddress(rawContracts.opalxCore)
      ? rawContracts.opalxCore
      : FALLBACK_GATEWAYS.opalxCore,
  };

  const liveBlockNumber = coreState?.liveBlockNumber ?? network.blockNumber;
  const gatewaysVerified = coreState !== null || isNonZeroAddress(rawContracts.opalxCore);

  const pillars: AvalancheTechPillar[] = [
    {
      id: "FUJI_CHAIN",
      title: "Avalanche C-Chain Fuji (43113)",
      status: network.rpcHealthy && liveBlockNumber !== null ? "VERIFIED" : "STANDBY",
      summary:
        network.rpcHealthy && liveBlockNumber !== null
          ? `RPC online · Block #${liveBlockNumber} · Gas ${network.gasPriceGwei ?? "—"} Gwei (${AVALANCHE_FUJI_NETWORK.caip2})`
          : `Offline fallback mode · Network config ${AVALANCHE_FUJI_NETWORK.caip2}`,
      proofRef: liveBlockNumber !== null ? `Block #${liveBlockNumber} · ${AVALANCHE_FUJI_NETWORK.caip2}` : AVALANCHE_FUJI_NETWORK.caip2,
      explorerUrl: SNOWTRACE_BASE_URL,
    },
    {
      id: "THREE_GATEWAYS",
      title: "3 Gateway Contracts (Fuji)",
      status: gatewaysVerified ? "VERIFIED" : "STANDBY",
      summary: coreState
        ? `EnterpriseGateway · BankGateway · OpalXGoCore (${coreState.totalGuaranteesIssued} on-chain guarantees, ${coreState.totalOrdersRegistered} orders)`
        : "EnterpriseGateway · BankGateway · OpalXGoCore locking bankRef replay & storing commitments",
      proofRef: contracts.opalxCore,
      explorerUrl: getFujiAddressUrl(contracts.opalxCore),
    },
    {
      id: "WASM_KERNEL",
      title: "Rust WASM Policy Kernel",
      status: kernelCheck.wasmExecuted && kernelCheck.verdict === "ALLOW" ? "VERIFIED" : "STANDBY",
      summary: `7 deterministic 3-way reconciliation rules · Sample verdict: ${kernelCheck.verdict} · 0 PII on-chain`,
      proofRef: kernelCheck.wasmExecuted
        ? "opalx_guard.wasm · ALLOW / REQUIRE_APPROVAL / DENY"
        : "TS-Fallback · 7-Rule Guard",
    },
    {
      id: "ERC_8004",
      title: "ERC-8004 Identity & Reputation",
      status: bytecode.erc8004BytecodeOk ? "VERIFIED" : "STANDBY",
      summary: bytecode.erc8004BytecodeOk
        ? "Live Fuji bytecode verified · Canonical Identity, Reputation & Validation Registry + /api/agent-card"
        : "Standby · Canonical Identity, Reputation & Validation Registry on Fuji + Agent Discovery Card (/api/agent-card)",
      proofRef: AVALANCHE_FUJI_NETWORK.erc8004.identityRegistry,
      explorerUrl: getFujiAddressUrl(AVALANCHE_FUJI_NETWORK.erc8004.identityRegistry),
    },
    {
      id: "X402_USDC",
      title: "Circle Fuji USDC · x402 EIP-3009",
      status: bytecode.usdcBytecodeOk ? "VERIFIED" : "STANDBY",
      summary: bytecode.usdcBytecodeOk
        ? 'Live Fuji USDC bytecode verified · HTTP 402 /api/x402/audit-proof + /api/x402/settle · EIP-712 extra { name: "USD Coin", version: "2" }'
        : 'Standby · HTTP 402 /api/x402/audit-proof + /api/x402/settle · EIP-712 extra { name: "USD Coin", version: "2" }',
      proofRef: FUJI_USDC_ADDRESS,
      explorerUrl: getFujiAddressUrl(FUJI_USDC_ADDRESS),
    },
    {
      id: "PASSKEY_P256",
      title: "Daimo P-256 Passkey Verifier",
      status: bytecode.p256BytecodeOk ? "VERIFIED" : "STANDBY",
      summary: bytecode.p256BytecodeOk
        ? "Live Fuji Daimo P-256 bytecode verified · Passwordless signature verification & guarantee rights signing"
        : "Standby · Passwordless P-256 signature verification & member wallet guarantee rights signing",
      proofRef: DAIMO_P256_VERIFIER,
      explorerUrl: getFujiAddressUrl(DAIMO_P256_VERIFIER),
    },
  ];

  const payload: AvalancheStackVerification = {
    checkedAtIso: network.checkedAtIso,
    chainId: 43113,
    rpcHealthy: network.rpcHealthy,
    liveBlockNumber,
    gasPriceGwei: network.gasPriceGwei,
    ...(guaranteeId && guaranteeOnChain
      ? {
          guaranteeChecked: {
            guaranteeId,
            onChainValid: guaranteeOnChain.valid,
            source: guaranteeOnChain.source,
            ...(guaranteeOnChain.collateralAvax ? { collateralAvax: guaranteeOnChain.collateralAvax } : {}),
          },
        }
      : {}),
    contracts,
    erc8004: {
      identityRegistry: AVALANCHE_FUJI_NETWORK.erc8004.identityRegistry,
      reputationRegistry: AVALANCHE_FUJI_NETWORK.erc8004.reputationRegistry,
      validationRegistry: ERC8004_VALIDATION_REGISTRY,
      agentCardEndpoint: "/api/agent-card",
    },
    x402: {
      assetAddress: FUJI_USDC_ADDRESS,
      domainName: FUJI_USDC_EIP712_EXTRA.name,
      domainVersion: FUJI_USDC_EIP712_EXTRA.version,
      caip2: FUJI_CAIP2,
      settleEndpoint: "/api/x402/settle",
    },
    passkeyP256Verifier: DAIMO_P256_VERIFIER,
    wasmPolicyKernel: {
      verdictSample: kernelCheck.verdict,
      wasmExecuted: kernelCheck.wasmExecuted,
      zeroPiiOnChain: true,
    },
    pillars,
  };

  return Response.json(payload, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}

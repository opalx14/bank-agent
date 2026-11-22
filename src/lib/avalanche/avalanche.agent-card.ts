import { AVALANCHE_FUJI_NETWORK, getGatewayAddresses } from "./avalanche.network";
import { FUJI_CAIP2, FUJI_USDC_ADDRESS, FUJI_USDC_EIP712_EXTRA } from "./avalanche.x402";

export interface AgentRegistrationCard {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  name: string;
  description: string;
  chainId: 43113;
  network: "eip155:43113";
  settlementCurrency: "AVAX";
  paymentProtocols: ["x402-v2-exact-eip3009", "avax-native-fuji"];
  x402: {
    network: "eip155:43113";
    asset: typeof FUJI_USDC_ADDRESS;
    extra: typeof FUJI_USDC_EIP712_EXTRA;
    priceUsdc: string;
    auditResourceEndpoint: string;
    settleEndpoint: string;
  };
  active: boolean;
  gatewayContracts: {
    enterpriseGateway: `0x${string}`;
    bankGateway: `0x${string}`;
    opalxCore: `0x${string}`;
  };
  services: Array<{ name: string; endpoint: string }>;
  registrations: Array<{ agentId: string; agentRegistry: string }>;
}

/** Builds ERC-8004 agent discovery card advertising pure-AVAX 3-gateway Fuji settlement. */
export function buildAgentRegistrationCard(origin: string): AgentRegistrationCard {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const contracts = getGatewayAddresses();
  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: "OpalX GO — 3-Gateway AVAX Guarantee Agent",
    description:
      "Direct Bank-to-Chain payment & e-invoice reconciliation backed by pure-AVAX proofs across EnterpriseGateway, BankGateway, and OpalXGoCore on Avalanche Fuji (43113).",
    chainId: AVALANCHE_FUJI_NETWORK.chainId,
    network: AVALANCHE_FUJI_NETWORK.caip2,
    settlementCurrency: "AVAX",
    paymentProtocols: ["x402-v2-exact-eip3009", "avax-native-fuji"],
    x402: {
      network: FUJI_CAIP2,
      asset: FUJI_USDC_ADDRESS,
      extra: { ...FUJI_USDC_EIP712_EXTRA },
      priceUsdc: "0.01",
      auditResourceEndpoint: `${cleanOrigin}/api/x402/audit-proof`,
      settleEndpoint: `${cleanOrigin}/api/x402/settle`,
    },
    active: true,
    gatewayContracts: contracts,
    services: [
      { name: "enterprise-orders", endpoint: `${cleanOrigin}/api/orders/create` },
      { name: "bank-webhook", endpoint: `${cleanOrigin}/api/webhooks/payos` },
      { name: "opalx-avax-fee", endpoint: `${cleanOrigin}/api/avax/settle-fee` },
      { name: "treasury-status", endpoint: `${cleanOrigin}/api/treasury/status` },
      { name: "guarantee-verify", endpoint: `${cleanOrigin}/api/guarantees` },
      { name: "x402-audit-proof", endpoint: `${cleanOrigin}/api/x402/audit-proof` },
      { name: "x402-settle", endpoint: `${cleanOrigin}/api/x402/settle` },
      { name: "ai-security-agent", endpoint: `${cleanOrigin}/api/agent/assist` },
    ],
    registrations: [
      {
        agentId: `opalx-go:${contracts.opalxCore}`,
        agentRegistry: `${AVALANCHE_FUJI_NETWORK.caip2}:${AVALANCHE_FUJI_NETWORK.erc8004.identityRegistry}`,
      },
    ],
  };
}

import { AVALANCHE_FUJI_NETWORK, getGatewayAddresses } from "./avalanche.network";

export interface AgentRegistrationCard {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  name: string;
  description: string;
  chainId: 43113;
  network: "eip155:43113";
  settlementCurrency: "AVAX";
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
    active: true,
    gatewayContracts: contracts,
    services: [
      { name: "enterprise-orders", endpoint: `${cleanOrigin}/api/orders/create` },
      { name: "bank-webhook", endpoint: `${cleanOrigin}/api/webhooks/payos` },
      { name: "opalx-avax-fee", endpoint: `${cleanOrigin}/api/avax/settle-fee` },
      { name: "treasury-status", endpoint: `${cleanOrigin}/api/treasury/status` },
      { name: "guarantee-verify", endpoint: `${cleanOrigin}/api/guarantees` },
    ],
    registrations: [
      {
        agentId: `opalx-go:${contracts.opalxCore}`,
        agentRegistry: `${AVALANCHE_FUJI_NETWORK.caip2}:${AVALANCHE_FUJI_NETWORK.erc8004.identityRegistry}`,
      },
    ],
  };
}

import type { RoadmapPhase } from "@/types";

export const OPALX_PROJECT_ROADMAP: RoadmapPhase[] = [
  {
    phase: "Phase 1 · Current",
    title: "Independent 3-Gateway Architecture & Fuji AVAX Verification",
    timeframe: "Nov 2026 (UniHack Core)",
    status: "COMPLETED",
    summary:
      "Strict domain separation across 3 gateways (Enterprise / Bank / OpalXGo), eliminating external stablecoin dependencies and using 100% native AVAX on Avalanche Fuji (43113) for verifiable on-chain proofs.",
    milestones: [
      {
        id: "M1-CONTRACTS",
        title: "Deploy 3 Dedicated Smart Contracts to Fuji 43113",
        ownerGateway: "CROSS_SYSTEM",
        deliverable: "EnterpriseGateway.sol, BankGateway.sol, OpalXGoCore.sol (funded with live 0.005 AVAX reserve)",
        done: true,
      },
      {
        id: "M1-RUST-WASM",
        title: "Deterministic Rust WASM Policy Kernel & TT78 E-Invoice",
        ownerGateway: "OPALX_CORE",
        deliverable: "3-way reconciliation Order <-> Bank <-> TT78 XML with 40/40 adversarial block rate",
        done: true,
      },
      {
        id: "M1-PORTALS",
        title: "3 Pure Tailwind CSS Portal UIs & 58mm/80mm Receipt Printing",
        ownerGateway: "ENTERPRISE",
        deliverable: "Routes /enterprise, /bank, /opalx, /scan, /verify/[id], /roadmap with zero global CSS bloat",
        done: true,
      },
    ],
  },
  {
    phase: "Phase 2",
    title: "Live PayOS NAPAS 247 Integration & Automated Tax Reconciliation",
    timeframe: "Q1 2027",
    status: "IN_PROGRESS",
    summary:
      "Expand the Bank Gateway with real-time PayOS webhooks from commercial banks in Vietnam and Tax Authority XML signature cross-checking.",
    milestones: [
      {
        id: "M2-PAYOS-LIVE",
        title: "NAPAS 247 Webhook Sync & Parallel Bank Statement Lookup",
        ownerGateway: "BANK",
        deliverable: "Multi-bank support for MB, VCB, TCB, BIDV with on-chain bankRefCommitment replay lock",
        done: false,
      },
      {
        id: "M2-PASSKEY",
        title: "CFO Approval Signing via WebAuthn P-256 Passkey",
        ownerGateway: "OPALX_CORE",
        deliverable: "Biometric authorization for high-value orders above auto-approve limits and Vault Kill Switch",
        done: false,
      },
    ],
  },
  {
    phase: "Phase 3",
    title: "AVAX Liquidity Reserve Scaling & B2B Net-30 Credit Tiers",
    timeframe: "Q2–Q3 2027",
    status: "PLANNED",
    summary:
      "Grow AVAX collateral reserve pools enabling trusted enterprises (GOLD_NET30) to unlock cross-border B2B credit lines without custodial VND holding.",
    milestones: [
      {
        id: "M3-CREDIT-POOL",
        title: "ERC-8004 Enterprise Credit Scoring from Live A2A History",
        ownerGateway: "OPALX_CORE",
        deliverable: "Automated Net-15 / Net-30 credit tier upgrades from verified live settlements, immune to sandbox spam",
        done: false,
      },
    ],
  },
  {
    phase: "Phase 4",
    title: "Dedicated Enterprise Avalanche L1 & Mainnet Audit",
    timeframe: "Q4 2027",
    status: "PLANNED",
    summary:
      "Launch a Vietnam data-compliance Avalanche L1 (0 PII on-chain) with independent security audits across all 3 gateway contracts.",
    milestones: [
      {
        id: "M4-MAINNET",
        title: "Smart Contract Security Audit & Avalanche Mainnet Launch",
        ownerGateway: "CROSS_SYSTEM",
        deliverable: "Independent audit report, 99.95% SLA, and SME accounting ERP integration APIs",
        done: false,
      },
    ],
  },
];

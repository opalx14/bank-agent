import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  keccak256,
  parseAbi,
  parseEther,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

const ROOT_DIR = process.cwd();
const ENV_LOCAL_PATH = path.join(ROOT_DIR, ".env.local");
const PROOFS_OUT_PATH = path.join(ROOT_DIR, "src", "core", "ledger", "ledger.fuji-proofs.json");
const DEFAULT_FUJI_RPC = "https://api.avax-test.network/ext/bc/C/rpc";

const ENTERPRISE_ABI = parseAbi([
  "function registerEnterpriseOrder(bytes32 orderCommitment, bytes32 invoiceCommitment, address enterprise)",
]);
const BANK_ABI = parseAbi([
  "function attestBankSettlement(bytes32 bankRefCommitment, bytes32 orderCommitment)",
]);
const CORE_ABI = parseAbi([
  "function issueGuarantee(bytes32 guaranteeId, bytes32 orderCommitment, bytes32 bankRefCommitment, bytes32 invoiceCommitment, address enterprise, uint256 collateralWei, bool sandbox)",
  "function settleVerificationFee(bytes32 guaranteeId) payable",
]);

function loadEnvLocal(): void {
  if (!existsSync(ENV_LOCAL_PATH)) return;
  for (const rawLine of readFileSync(ENV_LOCAL_PATH, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function hmacBytes32(pepper: string, namespace: string, raw: string): `0x${string}` {
  return `0x${createHmac("sha256", pepper).update(`${namespace}:${raw}`).digest("hex")}`;
}

async function main(): Promise<void> {
  loadEnvLocal();
  const rawPk = process.env.AVALANCHE_ISSUER_PRIVATE_KEY?.trim() ?? "";
  const pk = (rawPk.startsWith("0x") ? rawPk : `0x${rawPk}`) as `0x${string}`;
  const enterpriseGateway = process.env.NEXT_PUBLIC_ENTERPRISE_GATEWAY_ADDRESS as `0x${string}`;
  const bankGateway = process.env.NEXT_PUBLIC_BANK_GATEWAY_ADDRESS as `0x${string}`;
  const opalxCore = process.env.NEXT_PUBLIC_OPALX_CORE_ADDRESS as `0x${string}`;
  const pepper = process.env.OPALX_COMMITMENT_PEPPER?.trim() || "opalx-dev-pepper";
  const rpcUrl = process.env.AVALANCHE_FUJI_RPC_URL?.trim() || DEFAULT_FUJI_RPC;

  if (!/^0x[a-fA-F0-9]{64}$/.test(pk) || !enterpriseGateway || !bankGateway || !opalxCore) {
    console.error("ERROR: Thiếu key hoặc địa chỉ 3 gateway trên Fuji.");
    process.exit(1);
  }

  const account = privateKeyToAccount(pk);
  const publicClient = createPublicClient({ chain: avalancheFuji, transport: http(rpcUrl) });
  const walletClient = createWalletClient({ account, chain: avalancheFuji, transport: http(rpcUrl) });

  const orderCode = 20260001;
  const guaranteeId = "OPX-2026-0001";
  const guaranteeBytes32 = keccak256(toHex(guaranteeId));
  const orderCommitment = hmacBytes32(pepper, "order", `${orderCode}:1500000:0312345678`);
  const invoiceCommitment = hmacBytes32(pepper, "invoice", "K26TOPX-000188:1500000");
  const bankRefCommitment = hmacBytes32(pepper, "bankRef", "FT2601889921_LIVE_SEED");
  const collateralWei = parseEther("0.0002");
  const feeWei = parseEther("0.00001");

  const enterpriseTxHash = await walletClient.writeContract({
    address: enterpriseGateway,
    abi: ENTERPRISE_ABI,
    functionName: "registerEnterpriseOrder",
    args: [orderCommitment, invoiceCommitment, account.address],
  });
  const entReceipt = await publicClient.waitForTransactionReceipt({ hash: enterpriseTxHash });

  const bankTxHash = await walletClient.writeContract({
    address: bankGateway,
    abi: BANK_ABI,
    functionName: "attestBankSettlement",
    args: [bankRefCommitment, orderCommitment],
  });
  const bankReceipt = await publicClient.waitForTransactionReceipt({ hash: bankTxHash });

  const guaranteeTxHash = await walletClient.writeContract({
    address: opalxCore,
    abi: CORE_ABI,
    functionName: "issueGuarantee",
    args: [
      guaranteeBytes32,
      orderCommitment,
      bankRefCommitment,
      invoiceCommitment,
      account.address,
      collateralWei,
      false,
    ],
  });
  const coreReceipt = await publicClient.waitForTransactionReceipt({ hash: guaranteeTxHash });

  const feeSettlementTxHash = await walletClient.writeContract({
    address: opalxCore,
    abi: CORE_ABI,
    functionName: "settleVerificationFee",
    args: [guaranteeBytes32],
    value: feeWei,
  });
  const feeReceipt = await publicClient.waitForTransactionReceipt({ hash: feeSettlementTxHash });

  const balanceAfter = await publicClient.getBalance({ address: account.address });
  const payload = {
    chainId: 43113,
    guaranteeId,
    guaranteeBytes32,
    orderCode,
    orderCommitment,
    bankRefCommitment,
    invoiceCommitment,
    enterpriseAddress: account.address,
    enterpriseGateway,
    bankGateway,
    opalxCore,
    collateralWei: collateralWei.toString(),
    feeWei: feeWei.toString(),
    enterpriseTxHash,
    enterpriseBlock: Number(entReceipt.blockNumber),
    bankTxHash,
    bankBlock: Number(bankReceipt.blockNumber),
    guaranteeTxHash,
    guaranteeBlock: Number(coreReceipt.blockNumber),
    feeSettlementTxHash,
    feeBlock: Number(feeReceipt.blockNumber),
    seededAtIso: new Date().toISOString(),
  };

  mkdirSync(path.dirname(PROOFS_OUT_PATH), { recursive: true });
  writeFileSync(PROOFS_OUT_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log(`SEED_ENTERPRISE_TX=${enterpriseTxHash} block=${payload.enterpriseBlock}`);
  console.log(`SEED_BANK_TX=${bankTxHash} block=${payload.bankBlock}`);
  console.log(`SEED_GUARANTEE_TX=${guaranteeTxHash} block=${payload.guaranteeBlock}`);
  console.log(`SEED_FEE_AVAX_TX=${feeSettlementTxHash} block=${payload.feeBlock}`);
  console.log(`WALLET_AVAX_REMAINING=${formatEther(balanceAfter)}`);
}

await main();

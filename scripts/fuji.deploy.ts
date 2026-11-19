import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { avalancheFuji } from "viem/chains";

const ROOT_DIR = process.cwd();
const ENV_LOCAL_PATH = path.join(ROOT_DIR, ".env.local");
const BROADCAST_JSON_PATH = path.join(
  ROOT_DIR,
  "contracts",
  "broadcast",
  "DeploySystem.s.sol",
  "43113",
  "run-latest.json",
);
const DEFAULT_FUJI_RPC = "https://api.avax-test.network/ext/bc/C/rpc";

interface BroadcastTx {
  transactionType?: string;
  contractName?: string;
  contractAddress?: string;
  hash?: string;
}

/** Loads KEY=VALUE pairs from `.env.local` when unset in `process.env`. */
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

/** Redacts hex private keys before printing Foundry output. */
function redactSecrets(text: string, normalizedPk: string): string {
  const bareHex = normalizedPk.slice(2);
  return text.replace(new RegExp(`(0x)?${bareHex}`, "gi"), "[REDACTED_PK]");
}

/** Upserts the 3 pure-AVAX gateway contract addresses and removes obsolete keys in `.env.local`. */
function updateEnvLocalContracts(addresses: {
  enterpriseGateway?: string;
  bankGateway?: string;
  opalxCore?: string;
}): void {
  if (!existsSync(ENV_LOCAL_PATH)) return;
  let content = readFileSync(ENV_LOCAL_PATH, "utf8")
    .replace(/^NEXT_PUBLIC_GUARANTEE_REGISTRY_ADDRESS=.*\r?\n?/gm, "")
    .replace(/^NEXT_PUBLIC_POLICY_VAULT_ADDRESS=.*\r?\n?/gm, "");

  const upsert = (src: string, key: string, value?: string): string => {
    if (!value) return src;
    const re = new RegExp(`^${key}=.*$`, "m");
    return re.test(src)
      ? src.replace(re, `${key}=${value}`)
      : `${src.trimEnd()}\n${key}=${value}\n`;
  };

  content = upsert(content, "NEXT_PUBLIC_ENTERPRISE_GATEWAY_ADDRESS", addresses.enterpriseGateway);
  content = upsert(content, "NEXT_PUBLIC_BANK_GATEWAY_ADDRESS", addresses.bankGateway);
  content = upsert(content, "NEXT_PUBLIC_OPALX_CORE_ADDRESS", addresses.opalxCore);
  writeFileSync(ENV_LOCAL_PATH, content, { mode: 0o600 });
}

async function main(): Promise<void> {
  loadEnvLocal();
  const rawPk = process.env.AVALANCHE_ISSUER_PRIVATE_KEY?.trim() ?? "";
  const normalizedPk = rawPk.startsWith("0x") ? rawPk : `0x${rawPk}`;
  if (!/^0x[a-fA-F0-9]{64}$/.test(normalizedPk)) {
    console.error("ERROR: Thiếu hoặc sai định dạng AVALANCHE_ISSUER_PRIVATE_KEY trong .env.local");
    process.exit(1);
  }

  const account = privateKeyToAccount(normalizedPk as `0x${string}`);
  const rpcUrl = process.env.AVALANCHE_FUJI_RPC_URL?.trim() || DEFAULT_FUJI_RPC;
  const client = createPublicClient({
    chain: avalancheFuji,
    transport: http(rpcUrl, { timeout: 10_000, retryCount: 1 }),
  });
  const avaxBalance = await client.getBalance({ address: account.address });

  console.log("FUJI_CHAIN_ID=43113");
  console.log(`FUJI_WALLET_ADDRESS=${account.address}`);
  console.log(`FUJI_AVAX_BALANCE=${formatEther(avaxBalance)}`);
  console.log(`SNOWTRACE_URL=https://testnet.snowtrace.io/address/${account.address}`);

  if (process.argv.includes("--check-only")) return;

  if (avaxBalance < 6_000_000_000_000_000n) {
    console.error(
      `Số dư AVAX (${formatEther(avaxBalance)}) chưa đủ để deploy + nạp 0.005 AVAX reserve. Vui lòng faucet thêm AVAX vào ${account.address}.`,
    );
    process.exit(1);
  }

  const deployResult = spawnSync(
    "forge",
    [
      "script",
      "script/DeploySystem.s.sol:DeploySystemScript",
      "--rpc-url",
      rpcUrl,
      "--private-key",
      normalizedPk,
      "--broadcast",
    ],
    { cwd: path.join(ROOT_DIR, "contracts"), encoding: "utf8" },
  );

  if (deployResult.stdout) console.log(redactSecrets(deployResult.stdout, normalizedPk));
  if (deployResult.stderr) console.error(redactSecrets(deployResult.stderr, normalizedPk));
  if (deployResult.status !== 0) process.exit(deployResult.status ?? 1);

  if (!existsSync(BROADCAST_JSON_PATH)) {
    console.error(`ERROR: Không tìm thấy file broadcast: ${BROADCAST_JSON_PATH}`);
    process.exit(1);
  }

  const parsed = JSON.parse(readFileSync(BROADCAST_JSON_PATH, "utf8")) as {
    transactions?: BroadcastTx[];
  };
  const creates = (parsed.transactions ?? []).filter(
    (tx) => tx.transactionType === "CREATE" && tx.contractAddress,
  );
  const entTx = creates.find((tx) => tx.contractName === "EnterpriseGateway");
  const bankTx = creates.find((tx) => tx.contractName === "BankGateway");
  const coreTx = creates.find((tx) => tx.contractName === "OpalXGoCore");

  updateEnvLocalContracts({
    enterpriseGateway: entTx?.contractAddress,
    bankGateway: bankTx?.contractAddress,
    opalxCore: coreTx?.contractAddress,
  });

  console.log(`DEPLOYED_ENTERPRISE_GATEWAY=${entTx?.contractAddress ?? "n/a"} tx=${entTx?.hash ?? "n/a"}`);
  console.log(`DEPLOYED_BANK_GATEWAY=${bankTx?.contractAddress ?? "n/a"} tx=${bankTx?.hash ?? "n/a"}`);
  console.log(`DEPLOYED_OPALX_CORE=${coreTx?.contractAddress ?? "n/a"} tx=${coreTx?.hash ?? "n/a"}`);
}

await main();

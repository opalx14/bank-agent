import { resolveAccountClassification } from "@/core/bank/bank.account-mode";
import { getLedgerStorageInfo } from "@/core/ledger/ledger.storage-adapter";
import { readWalletAvaxBalance } from "@/lib/avalanche/avalanche.reader";

export async function GET(): Promise<Response> {
  const classification = resolveAccountClassification();
  const walletAvaxBalance = await readWalletAvaxBalance();
  const storageInfo = getLedgerStorageInfo();
  return Response.json(
    {
      ...classification,
      ...(walletAvaxBalance !== null ? { walletAvaxBalance } : {}),
      storageBackend: {
        backend: storageInfo.backend,
        remoteConfigured: storageInfo.remoteConfigured,
      },
    },
    { status: 200, headers: { "Cache-Control": "no-store" } },
  );
}

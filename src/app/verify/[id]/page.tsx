import { notFound } from "next/navigation";
import { GuaranteeVerifyCard } from "@/components/verify/verify.guarantee-card";
import { findGuarantee } from "@/core/ledger/ledger.store";
import { verifyGuaranteeOnFuji } from "@/lib/avalanche/avalanche.reader";

export const dynamic = "force-dynamic";

export default async function VerifyGuaranteePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id).trim();
  const [guarantee, onChain] = await Promise.all([
    Promise.resolve(findGuarantee(decodedId)),
    verifyGuaranteeOnFuji(decodedId),
  ]);

  const hasOnChainRecord = onChain.source === "ON_CHAIN_FUJI_RPC" && (onChain.issuedAt ?? 0) > 0;
  if (!guarantee && !hasOnChainRecord) {
    notFound();
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <GuaranteeVerifyCard
        guaranteeId={guarantee?.guaranteeId ?? decodedId}
        guarantee={guarantee ?? null}
        onChain={onChain}
      />
    </main>
  );
}

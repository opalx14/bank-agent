import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PrintableCertificateClient } from "@/components/verify/verify.printable-certificate";
import { findGuarantee, findOrder } from "@/core/ledger/ledger.store";
import { renderGuaranteePrintHtml } from "@/core/opalx/opalx.print-certificate";

export const dynamic = "force-dynamic";

export default async function PrintGuaranteePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id).trim();
  const guarantee = findGuarantee(decodedId);

  if (!guarantee) {
    notFound();
  }

  const order = findOrder(guarantee.orderCode);
  const reqHeaders = await headers();
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN?.trim().replace(/\/+$/, "");
  const rawHost = reqHeaders.get("x-forwarded-host") ?? reqHeaders.get("host");
  const origin = rawHost
    ? `${reqHeaders.get("x-forwarded-proto") ?? (rawHost.includes("localhost") || rawHost.startsWith("127.") ? "http" : "https")}://${rawHost}`
    : configuredOrigin || "http://127.0.0.1:5238";

  const [initialHtmlA4, initialHtmlPos80, initialHtmlPos58] = await Promise.all([
    renderGuaranteePrintHtml({ guarantee, order, origin, paper: "a4", autoPrint: false }),
    renderGuaranteePrintHtml({ guarantee, order, origin, paper: "pos80", autoPrint: false }),
    renderGuaranteePrintHtml({ guarantee, order, origin, paper: "pos58", autoPrint: false }),
  ]);

  return (
    <PrintableCertificateClient
      initialHtmlA4={initialHtmlA4}
      initialHtmlPos80={initialHtmlPos80}
      initialHtmlPos58={initialHtmlPos58}
      guarantee={guarantee}
    />
  );
}

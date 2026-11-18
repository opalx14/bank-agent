import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { PrintableCertificateClient } from "@/components/verify/PrintableCertificateClient";
import { findGuarantee, findOrder } from "@/core/ledger/store";
import { renderGuaranteePrintHtml } from "@/core/opalx/print-certificate-html";

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
  const host = reqHeaders.get("x-forwarded-host") ?? reqHeaders.get("host") ?? "127.0.0.1:5238";
  const proto =
    reqHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");
  const origin = `${proto}://${host}`;

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

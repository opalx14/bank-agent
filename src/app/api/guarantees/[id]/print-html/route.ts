import { findGuarantee, findOrder } from "@/core/ledger/store";
import { renderGuaranteePrintHtml, type PrintPaperSize } from "@/core/opalx/print-certificate-html";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const decodedId = decodeURIComponent(id);
  const guarantee = findGuarantee(decodedId);

  if (!guarantee) {
    return Response.json(
      { error: "GUARANTEE_NOT_FOUND", guaranteeId: decodedId },
      { status: 404 },
    );
  }

  const url = new URL(request.url);
  const rawPaper = url.searchParams.get("paper");
  const paper: PrintPaperSize = rawPaper === "pos80" ? "pos80" : rawPaper === "pos58" ? "pos58" : "a4";
  const download = url.searchParams.get("download") === "1";
  const autoPrint = url.searchParams.get("autoprint") === "1";
  const order = findOrder(guarantee.orderCode);

  const html = await renderGuaranteePrintHtml({
    guarantee,
    order,
    origin: url.origin,
    paper,
    autoPrint,
  });

  const safeId = guarantee.guaranteeId.replace(/[^a-zA-Z0-9._-]/g, "_");
  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
  };
  if (download) {
    headers["Content-Disposition"] = `attachment; filename="OpalX-Guarantee-${safeId}.html"`;
  }

  return new Response(html, { status: 200, headers });
}

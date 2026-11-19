export function buildSampleTt78Xml(params?: {
  invoiceNumber?: string;
  invoiceSerial?: string;
  sellerTaxId?: string;
  sellerName?: string;
  buyerTaxId?: string;
  amountVnd?: number;
  tampered?: boolean;
}): string {
  const invoiceNumber = params?.invoiceNumber ?? "000188";
  const invoiceSerial = params?.invoiceSerial ?? "K26TOPX";
  const sellerTaxId = params?.sellerTaxId ?? "0312345678";
  const sellerName = params?.sellerName ?? "CONG TY TNHH OPALX VIETNAM";
  const buyerTaxId = params?.buyerTaxId ?? "0109876543";
  const amountVnd = params?.amountVnd ?? 1_500_000;
  const sigValue = params?.tampered
    ? ""
    : `<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">
    <SignatureValue>MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A_VALID_TT78_SIG</SignatureValue>
  </Signature>`;

  return `<HDon>
  <DLHDon Id="TT78_OPALX">
    <TTChung>
      <KHMSHDon>1</KHMSHDon>
      <KHHDon>${invoiceSerial}</KHHDon>
      <SHDon>${invoiceNumber}</SHDon>
    </TTChung>
    <NDHDon>
      <NBan>
        <Ten>${sellerName}</Ten>
        <MST>${sellerTaxId}</MST>
      </NBan>
      <NMua>
        <Ten>CONG TY DOI TAC B2B VIET NAM</Ten>
        <MST>${buyerTaxId}</MST>
      </NMua>
      <TToan>
        <TgTTTBSo>${amountVnd}</TgTTTBSo>
      </TToan>
    </NDHDon>
  </DLHDon>
  <DSCKS><NBan>${sigValue}</NBan></DSCKS>
</HDon>`;
}

export const SAMPLE_VALID_TT78_XML = buildSampleTt78Xml();
export const SAMPLE_TAMPERED_TT78_XML = buildSampleTt78Xml({ tampered: true });

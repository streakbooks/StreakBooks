// Isolated browser fixture only. No auth/DB/provider verification is implied.
import { useState } from "react";
import { buildPosCatalogueQuote, type PosQuoteInput } from "@/lib/pos/catalogue-quote";
const companyId = "11111111-1111-4111-8111-111111111111";
const productId = "22222222-2222-4222-8222-222222222222";
const products = [
  {
    id: productId,
    company_id: companyId,
    name: "Consultation",
    code: "CONS",
    unit: "hour",
    is_active: true,
    sales_price_minor: 10000,
    sales_tax_rate_bps: 1000,
  },
];
export const useServerFn = <T>(fn: T): T => fn;
export const useCanDo = () => new URLSearchParams(location.search).get("denied") !== "true";
export function useActiveCompany() {
  const [activeId, setActiveId] = useState(companyId);
  (window as unknown as { switchPosCompany: () => void }).switchPosCompany = () =>
    setActiveId(productId);
  return { company: { id: activeId }, isPending: false, isError: false };
}
export async function searchPosCatalogue({ data }: { data: { companyId: string; q?: string } }) {
  return products.filter(
    (p) =>
      p.company_id === data.companyId &&
      (p.name + p.code).toLowerCase().includes((data.q ?? "").toLowerCase()),
  );
}
let quoteFailed = false;
export async function previewPosCatalogueCart({ data }: { data: PosQuoteInput }) {
  if (new URLSearchParams(location.search).get("quoteError") === "true" && !quoteFailed) {
    quoteFailed = true;
    throw new Error("Price service unavailable");
  }
  return buildPosCatalogueQuote(data, products, "USD", "exclusive");
}

import type { Sb } from "@/lib/accounting/ledger-data";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";
import { resolveTaxAccountIds } from "@/lib/accounting/control-accounts";
import { loadCashReportInput } from "./cash-report.server";
import { cashLedger } from "./cash-ledger";
import {
  cashContacts,
  cashItems,
  type CashAnalysisDocument,
  type CashAnalysisLine,
} from "./cash-analysis";

export async function cashDocumentAnalysis(
  supabase: Sb,
  companyId: string,
  from: string,
  to: string,
  side: "income" | "expense",
  items = false,
) {
  const input = await loadCashReportInput(supabase, companyId, to);
  const tables =
    side === "income"
      ? ["sales_invoices", "sales_credit_notes"]
      : ["purchase_bills", "purchase_credit_notes"];
  const documents: CashAnalysisDocument[] = [];
  for (const [index, table] of tables.entries()) {
    const rows = await fetchAllPages<{
      id: string;
      posted_journal_id: string | null;
      contact_id: string;
      contacts: { name: string } | null;
    }>(
      (start, end) =>
        supabase
          .from(table as never)
          .select("id, posted_journal_id, contact_id, contacts!inner(name)" as never)
          .eq("company_id" as never, companyId as never)
          .not("posted_journal_id" as never, "is", null)
          .order("id" as never)
          .range(start, end) as unknown as PromiseLike<
          PageResult<{
            id: string;
            posted_journal_id: string | null;
            contact_id: string;
            contacts: { name: string } | null;
          }>
        >,
    );
    for (const row of rows)
      if (row.posted_journal_id)
        documents.push({
          id: row.id,
          posted_journal_id: row.posted_journal_id,
          contact_id: row.contact_id,
          contact_name: row.contacts?.name ?? "",
          credit: index === 1,
        });
  }
  const { data: taxSettings, error } = await supabase
    .from("company_tax_settings" as never)
    .select("input_tax_account_id, output_tax_account_id" as never)
    .eq("company_id" as never, companyId as never)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const taxIds = new Set(
    resolveTaxAccountIds(
      input.accounts.map((a) => ({ ...a, is_active: true })),
      taxSettings,
    ),
  );
  const entries = cashLedger(input, { from: items ? "0001-01-01" : from, to });
  if (!items) return { contacts: cashContacts(entries, documents, taxIds, side), items: [] };
  const products = await fetchAllPages<{ id: string; code: string; name: string }>(
    (start, end) =>
      supabase
        .from("products" as never)
        .select("id,code,name" as never)
        .eq("company_id" as never, companyId as never)
        .order("id" as never)
        .range(start, end) as unknown as PromiseLike<
        PageResult<{ id: string; code: string; name: string }>
      >,
  );
  const productById = new Map(products.map((product) => [product.id, product]));
  const lines: CashAnalysisLine[] = [];
  for (const [index, table] of ["sales_invoice_lines", "sales_credit_note_lines"].entries()) {
    const fk = index ? "credit_note_id" : "invoice_id";
    const rows = await fetchAllPages<Record<string, unknown>>(
      (start, end) =>
        supabase
          .from(table as never)
          .select(`id, ${fk}, product_id, quantity, net_minor, tax_minor` as never)
          .eq("company_id" as never, companyId as never)
          .order("id" as never)
          .range(start, end) as unknown as PromiseLike<PageResult<Record<string, unknown>>>,
    );
    for (const row of rows) {
      const product = productById.get(String(row["product_id"]));
      lines.push({
        id: String(row["id"]),
        document_id: String(row[fk]),
        product_id: row["product_id"] as string | null,
        item_code: product?.code ?? null,
        item_name: product?.name ?? null,
        quantity: Number(row["quantity"]),
        net_minor: String(row["net_minor"]),
        tax_minor: String(row["tax_minor"]),
      });
    }
  }
  return { contacts: [], items: cashItems(entries, documents, lines, taxIds, from) };
}

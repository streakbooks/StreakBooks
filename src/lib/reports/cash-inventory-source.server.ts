import type { Sb } from "@/lib/accounting/ledger-data";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";
type Row = Record<string, unknown>;
class AcquisitionSchemaMissing extends Error {}
/** Both queries retain tenant scope. Only a known missing extension column permits fallback. */
export async function loadCashInventoryEvidenceRows(
  db: Sb,
  companyId: string,
): Promise<{ rows: Row[]; acquisitionsSupported: boolean }> {
  const read = (extended: boolean) =>
    fetchAllPages<Row>(async (from, to) => {
      const result = await db
        .from("cash_inventory_evidence" as never)
        .select(
          (extended
            ? "*,cost_minor::text,opening_paid_minor::text"
            : "*,cost_minor::text") as never,
        )
        .eq("company_id" as never, companyId as never)
        .order("id" as never)
        .range(from, to);
      const page = result as unknown as PageResult<Row>;
      const error = page.error as { code?: string; message: string } | null;
      if (
        extended &&
        error &&
        ["42703", "PGRST204"].includes(error.code ?? "") &&
        error.message.includes("opening_paid_minor")
      )
        throw new AcquisitionSchemaMissing(error.message);
      return page;
    });
  try {
    return { rows: await read(true), acquisitionsSupported: true };
  } catch (error) {
    if (!(error instanceof AcquisitionSchemaMissing)) throw error;
    return { rows: await read(false), acquisitionsSupported: false };
  }
}

import type { Sb } from "@/lib/accounting/ledger-data";
import { fetchAllPages, type PageResult } from "@/lib/accounting/fetch-all";
import { loadCashReportInput } from "@/lib/reports/cash-report.server";
import {
  cashProjectProfitability,
  type ProjectSourceLine,
  type DirectProjectTag,
} from "./cash-project";
import type { ProjectProfitRow } from "./projects";

type Row = Record<string, unknown>;

export async function loadCashProjectProfitability(
  sb: Sb,
  companyId: string,
  period: { from: string; to: string },
): Promise<ProjectProfitRow[]> {
  const read = (table: string, columns: string) =>
    fetchAllPages<Row>(
      (from, to) =>
        sb
          .from(table as never)
          .select(columns as never)
          .eq("company_id" as never, companyId as never)
          .order("id" as never)
          .range(from, to) as unknown as PromiseLike<PageResult<Row>>,
    );
  const specs = [
    ["sales_invoice", "sales_invoice_lines", "invoice_id"],
    ["sales_credit_note", "sales_credit_note_lines", "credit_note_id"],
    ["purchase_bill", "purchase_bill_lines", "bill_id"],
    ["purchase_credit_note", "purchase_credit_note_lines", "credit_note_id"],
  ] as const;
  const [input, projects, lineSets, banks, money] = await Promise.all([
    loadCashReportInput(sb, companyId, period.to),
    read("projects", "id,code,name,status,budget_minor"),
    Promise.all(
      specs.map(([, table, fk]) => read(table, `id,${fk},account_id,project_id,net_minor`)),
    ),
    read("bank_transactions", "id,project_id"),
    read("money_documents", "id,project_id"),
  ]);
  const sourceLines: ProjectSourceLine[] = lineSets.flatMap((rows, index) =>
    rows.map((row) => ({
      sourceType: specs[index]![0],
      sourceId: String(row[specs[index]![2]]),
      accountId: String(row["account_id"]),
      projectId: row["project_id"] == null ? null : String(row["project_id"]),
      netMinor: BigInt(String(row["net_minor"])),
    })),
  );
  const direct: DirectProjectTag[] = [...banks, ...money].map((row) => ({
    sourceId: String(row["id"]),
    projectId: row["project_id"] == null ? null : String(row["project_id"]),
  }));
  const heads: ProjectProfitRow[] = projects
    .map((row) => ({
      projectId: String(row["id"]),
      code: String(row["code"]),
      name: String(row["name"]),
      status: String(row["status"]),
      budgetMinor: row["budget_minor"] == null ? null : Number(row["budget_minor"]),
      revenueMinor: 0,
      costMinor: 0,
      profitMinor: 0,
      unconvertedDocuments: 0,
    }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return cashProjectProfitability(input, heads, sourceLines, direct, period);
}

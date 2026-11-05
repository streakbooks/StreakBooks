// Isolated UI adapter. Real authorization, journals and rollback are tested separately in SQL.
import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { TransactionCorrectionsView } from "../../src/components/accounting/corrections/TransactionCorrectionsView";
import type {
  CorrectionLine,
  CorrectionBatch,
  CorrectionPlan,
  CorrectionFilter,
} from "../../src/lib/accounting/corrections/contracts";
import "../../src/styles.css";
const company = "00000000-0000-4000-8000-000000000001",
  a = "00000000-0000-4000-8000-000000000002",
  target = "00000000-0000-4000-8000-000000000003",
  lineId = "00000000-0000-4000-8000-000000000004",
  bsTarget = "00000000-0000-4000-8000-000000000009",
  journal = "00000000-0000-4000-8000-000000000005";
const line: CorrectionLine = {
  id: lineId,
  journal_id: journal,
  journal_date: "2026-10-01",
  journal_number: "123",
  source_type: "purchase_bill",
  source_id: journal,
  source_reference: "BILL-123",
  contact_name: "Example supplier",
  account_id: a,
  account_code: "6000",
  account_name: "Operating costs",
  account_type: "expense",
  currency: "GBP",
  currency_decimals: 2,
  base_gross_minor: "10000",
  description: "Office supplies",
  memo: "Fixture bill",
  debit_minor: "10000",
  credit_minor: "0",
  fingerprint: "a".repeat(32),
  blocked_reason: null,
  metadata: {
    line_amount: "10000",
    document_total: "12000",
    tax_rate: ["20.00"],
    bank_account: ["Example bank"],
    reconciled_date: "2026-10-31",
  },
};
export function Fixture() {
  const [lastFilters, setLastFilters] = useState<CorrectionFilter | null>(null);
  const [history, setHistory] = useState<CorrectionBatch[]>([]),
    [keys, setKeys] = useState<string[]>([]),
    [reviewKeys, setReviewKeys] = useState<string[]>([]);
  const batches = useRef(new Map<string, CorrectionBatch>());
  const lastPlan = useRef<CorrectionPlan | null>(null);
  return (
    <main className="mx-auto max-w-6xl p-5">
      <output aria-label="Submitted search filters">{JSON.stringify(lastFilters)}</output>
      <TransactionCorrectionsView
        companyId={company}
        setup={{
          currency: "GBP",
          decimals: 2,
          can_apply: !location.search.includes("readonly"),
          can_export: !location.search.includes("noexport"),
          accounts: [
            { id: a, code: "6000", name: "Operating costs", type: "expense", eligible: true },
            { id: target, code: "6200", name: "Office expenses", type: "expense", eligible: true },
            { id: bsTarget, code: "1200", name: "Prepaid costs", type: "asset", eligible: true },
          ],
        }}
        busy={false}
        approvalRequired={location.search.includes("approval=1")}
        onSubmitApproval={async (request) => {
          setReviewKeys((current) => [...current, request.requestKey]);
          return { id: "00000000-0000-4000-8000-000000000010", status: "pending" };
        }}
        history={{ rows: history, has_more: false, page: 0 }}
        historyLoading={false}
        historyError=""
        onHistoryPage={() => {}}
        onHistoryRefresh={() => {}}
        onSearch={async (filters) => {
          setLastFilters(filters);
          return {
            rows:
              filters.page === 0
                ? [
                    line,
                    {
                      ...line,
                      id: "00000000-0000-4000-8000-000000000006",
                      journal_number: "124",
                      currency: "USD",
                      base_gross_minor: "12500",
                      metadata: { ...line.metadata, line_amount: "12500", document_total: "15000" },
                      blocked_reason: "Foreign-currency corrections require the source workflow",
                    },
                  ]
                : [],
            has_more: false,
            page: filters.page,
          };
        }}
        onPreview={async (input) => {
          const plan: CorrectionPlan = {
            company_id: company,
            currency: "GBP",
            rows: input.items.map(() => ({
              id: line.id,
              journal_id: line.journal_id,
              journal_number: line.journal_number,
              journal_date: line.journal_date,
              source_type: line.source_type,
              source_reference: line.source_reference,
              contact_name: line.contact_name,
              source_account_id: a,
              source_account_code: "6000",
              source_account_name: "Operating costs",
              description: line.description,
              memo: line.memo,
              debit_minor: "10000",
              credit_minor: "0",
              posting_date: input.mode === "original" ? line.journal_date : input.date!,
              fingerprint: line.fingerprint,
            })),
            gross_minor: "10000",
            line_count: 1,
            journal_count: 1,
            date_mode: input.mode,
            adjustment_date: input.date,
            reason: input.reason,
            target: {
              id: input.targetId,
              code: input.targetId === bsTarget ? "1200" : "6200",
              name: input.targetId === bsTarget ? "Prepaid costs" : "Office expenses",
              updated_at: "2026-11-01T00:00:00Z",
            },
            impact: {
              profit_change_minor: input.targetId === bsTarget ? "10000" : "0",
              cross_statement_lines: input.targetId === bsTarget ? 1 : 0,
              account_changes: [],
            },
            preview_hash: "b".repeat(32),
          };
          lastPlan.current = plan;
          return plan;
        }}
        onApply={async (request) => {
          setKeys((previous) => [...previous, request.requestKey]);
          const previous = batches.current.get(request.requestKey);
          if (previous) return previous;
          const batch: CorrectionBatch = {
            id: "00000000-0000-4000-8000-000000000007",
            company_id: company,
            request_key: request.requestKey,
            reason: request.input.reason,
            date_mode: request.input.mode,
            adjustment_date: request.input.date,
            plan: lastPlan.current!,
            journal_ids: ["00000000-0000-4000-8000-000000000008"],
            status: "applied",
            created_by: company,
            created_at: "2026-11-01T00:00:00Z",
            undo_date: null,
            undo_reason: null,
            undone_by: null,
            undone_at: null,
            undo_journal_ids: null,
          };
          batches.current.set(request.requestKey, batch);
          setHistory([batch]);
          if (request.input.reason === "Simulate lost response")
            throw new Error("Network response lost; retry this request");
          return batch;
        }}
        onUndo={async (input) => {
          const result = {
            ...history[0]!,
            status: "undone" as const,
            undo_date: input.date,
            undo_reason: input.reason,
            undone_by: company,
            undone_at: "2026-11-01T00:00:00Z",
            undo_journal_ids: ["00000000-0000-4000-8000-000000000009"],
          };
          setHistory([result]);
          return result;
        }}
      />
      <output aria-label="Posted request references">{JSON.stringify(keys)}</output>
      <output aria-label="Approval request references">{JSON.stringify(reviewKeys)}</output>
    </main>
  );
}
const root = createRootRoute();
const index = createRoute({ getParentRoute: () => root, path: "/", component: Fixture });
const accounting = createRoute({
  getParentRoute: () => root,
  path: "/accounting",
  component: Fixture,
});
const router = createRouter({ routeTree: root.addChildren([index, accounting]) });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);

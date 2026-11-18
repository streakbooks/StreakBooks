import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import {
  deleteDraftExpense,
  getExpense,
  postDraftExpense,
  voidPurchaseExpense,
} from "@/lib/purchases/purchases.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { WorkspaceInsights } from "@/components/workspace/WorkspaceInsights";
import { StatusBadge } from "@/components/common/stat-card";
import { DocumentRecordPanel } from "@/components/documents/DocumentRecordPanel";
import { ReasonDialog } from "@/components/sales/ReasonDialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/purchases/expenses/$expenseId")({
  component: ExpenseDetail,
});

function ExpenseDetail() {
  const { expenseId } = Route.useParams();
  const { company } = useActiveCompany();
  const fetchExpense = useServerFn(getExpense);
  const doPost = useServerFn(postDraftExpense);
  const doDelete = useServerFn(deleteDraftExpense);
  const doVoid = useServerFn(voidPurchaseExpense);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { can } = useCan();
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";
  const today = new Date().toISOString().slice(0, 10);
  const [voidOpen, setVoidOpen] = useState(false);

  const query = useQuery({
    queryKey: ["expense", companyId, expenseId],
    enabled: Boolean(companyId),
    queryFn: () => fetchExpense({ data: { companyId: companyId!, expenseId } }),
  });

  const postM = useMutation({
    mutationFn: () => doPost({ data: { companyId: companyId!, expenseId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["expense", companyId, expenseId] });
      await queryClient.invalidateQueries({ queryKey: ["expenses", companyId] });
      toast.success("Expense posted to the ledger");
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });
  const deleteM = useMutation({
    mutationFn: () => doDelete({ data: { companyId: companyId!, expenseId } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["expenses", companyId] });
      toast.success("Draft expense deleted");
      navigate({ to: "/purchases/expenses" });
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });
  const voidM = useMutation({
    mutationFn: (input: { reason: string; date: string }) =>
      doVoid({
        data: {
          companyId: companyId!,
          expenseId,
          reason: input.reason,
          voidDate: input.date,
        },
      }),
    onSuccess: async () => {
      setVoidOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["expense", companyId, expenseId] });
      await queryClient.invalidateQueries({ queryKey: ["expenses", companyId] });
      toast.success("Expense voided — reversing journal posted");
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <ErrorState
        onRetry={() => void query.refetch()}
        title="Expense not found"
        description={friendlyAuthError(query.error)}
      />
    );
  }

  const e = query.data as {
    payee_name: string;
    expense_date: string;
    status: string;
    net_minor: number;
    tax_minor: number;
    total_minor: number;
    reference: string | null;
    memo: string | null;
    posted_journal_id: string | null;
  };
  const canVoid = e.status === "paid" && Boolean(e.posted_journal_id) && can("purchases.authorise");

  return (
    <RecordWorkspace
      title={e.payee_name}
      description={`Direct expense · ${e.expense_date}`}
      meta={<StatusBadge status={e.status} />}
      insights={
        <WorkspaceInsights
          title="Related"
          facts={[
            { label: "Status", value: e.status.replaceAll("_", " ") },
            { label: "Total", value: fromMinorUnits(BigInt(e.total_minor), currency) },
            { label: "Net", value: fromMinorUnits(BigInt(e.net_minor), currency) },
            { label: "Tax", value: fromMinorUnits(BigInt(e.tax_minor), currency) },
            {
              label: "Posting",
              value: e.posted_journal_id ? "Posted to ledger" : "Draft — not posted",
            },
          ]}
          links={[
            {
              label: "All expenses",
              to: "/purchases/expenses",
              hint: "Return to the expense list",
            },
            {
              label: "New expense",
              to: "/purchases/expenses/new",
              hint: "Record another direct expense",
            },
          ]}
          footer="Draft expenses have no ledger impact until posted."
        />
      }
      actions={
        <div className="flex flex-wrap gap-2">
          {e.status === "draft" ? (
            <>
              <Button
                size="sm"
                disabled={postM.isPending || !can("purchases.authorise")}
                title={
                  can("purchases.authorise")
                    ? undefined
                    : "You do not have permission to post expenses"
                }
                onClick={() => postM.mutate()}
              >
                Post to ledger
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleteM.isPending || !can("expenses.submit")}
                onClick={() => {
                  if (confirm("Delete this draft expense?")) deleteM.mutate();
                }}
              >
                Delete draft
              </Button>
            </>
          ) : null}
          {canVoid ? (
            <Button
              size="sm"
              variant="destructive"
              disabled={voidM.isPending}
              title="Reverse the posted journal and mark this expense void"
              onClick={() => setVoidOpen(true)}
            >
              Void
            </Button>
          ) : null}
          <Button variant="outline" size="sm" asChild>
            <Link to="/purchases/expenses">Back</Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-2 text-sm">
        <StatusBadge status={e.status} />
        <p>Net {fromMinorUnits(BigInt(e.net_minor), currency)}</p>
        <p>Tax {fromMinorUnits(BigInt(e.tax_minor), currency)}</p>
        <p>Total {fromMinorUnits(BigInt(e.total_minor), currency)}</p>
        {e.reference ? <p>Ref {e.reference}</p> : null}
        {e.memo ? <p>{e.memo}</p> : null}
        {e.posted_journal_id ? (
          <p className="font-mono text-xs text-muted-foreground">Journal {e.posted_journal_id}</p>
        ) : (
          <p className="text-muted-foreground">Not posted yet (draft).</p>
        )}
      </div>
      <div className="mt-6 max-w-3xl">
        <DocumentRecordPanel
          entityType="purchase_expense"
          entityId={expenseId}
          audience="supplier"
        />
      </div>
      <ReasonDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title="Void this expense?"
        description="Posted journals will be reversed. A reason is required. The void date dates the reversing journal (this document has no void_date column)."
        confirmLabel="Void expense"
        dateLabel="Void date"
        minDate={e.expense_date}
        defaultDate={today}
        pending={voidM.isPending}
        onConfirm={(input) => voidM.mutate(input)}
      />
    </RecordWorkspace>
  );
}

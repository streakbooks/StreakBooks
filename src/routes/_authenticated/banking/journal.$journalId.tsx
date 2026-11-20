import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { fromMinorUnits } from "@/lib/accounting/money";
import { getJournalDetail } from "@/lib/banking/journal.functions";
import { LoadingState, EmptyState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { WorkspaceInsights } from "@/components/workspace/WorkspaceInsights";
import {
  decodeBankTransactionReturnContext,
  encodeBankTransactionReturnContext,
} from "@/lib/banking/transaction-return";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentRecordPanel } from "@/components/documents/DocumentRecordPanel";
import { RecordDiscussButton } from "@/components/messaging/RecordDiscussButton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/banking/journal/$journalId")({
  validateSearch: (raw: Record<string, unknown>) => {
    const returnContext = encodeBankTransactionReturnContext(
      decodeBankTransactionReturnContext(raw["returnContext"]),
    );
    return returnContext ? { returnContext } : {};
  },
  head: () => ({ meta: [{ title: "Journal — LinkBooks" }] }),
  component: JournalDetail,
});

function JournalDetail() {
  const { journalId } = Route.useParams();
  const { returnContext } = Route.useSearch();
  const backSearch = decodeBankTransactionReturnContext(returnContext);
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const fetchJournal = useServerFn(getJournalDetail);
  const q = useQuery({
    queryKey: ["journal-detail", companyId, journalId],
    enabled: Boolean(companyId),
    queryFn: () => fetchJournal({ data: { companyId: companyId!, journalId } }),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <QueryErrorState queries={[q]} title="Could not load journal" />;
  if (!q.isSuccess || !q.data) return <LoadingState />;

  const { journal, lines } = q.data;
  const currency = journal.currency_code ?? company?.base_currency ?? "GBP";
  const debit = lines.reduce((a, l) => a + BigInt(l.debit_minor), 0n);
  const credit = lines.reduce((a, l) => a + BigInt(l.credit_minor), 0n);

  return (
    <RecordWorkspace
      title={`Journal #${journal.journal_number}`}
      description={`${journal.journal_date} · ${journal.source_type.replace(/_/g, " ")}${journal.memo ? ` · ${journal.memo}` : ""}`}
      insights={
        <WorkspaceInsights
          title="Related"
          facts={[
            { label: "Status", value: journal.status },
            { label: "Source", value: journal.source_type.replace(/_/g, " ") },
            { label: "Lines", value: String(lines.length) },
            {
              label: `Debits (${currency})`,
              value: fromMinorUnits(debit, currency),
            },
            {
              label: `Credits (${currency})`,
              value: fromMinorUnits(credit, currency),
            },
          ]}
          links={[
            {
              label: "Bank transactions",
              to: "/banking/transactions",
              hint: "Return to the transaction list",
            },
            ...(journal.reversed_by_journal_id
              ? [
                  {
                    label: "Reversing journal",
                    to: "/banking/journal/$journalId",
                    params: { journalId: journal.reversed_by_journal_id },
                    hint: "Journal that reversed this entry",
                  },
                ]
              : []),
            ...(journal.reverses_journal_id
              ? [
                  {
                    label: "Original journal",
                    to: "/banking/journal/$journalId",
                    params: { journalId: journal.reverses_journal_id },
                    hint: "Journal this entry reverses",
                  },
                ]
              : []),
          ]}
          footer="Debit and credit totals are summed from this journal’s posted lines."
        />
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <RecordDiscussButton
            companyId={companyId ?? null}
            recordType="journal"
            recordId={journalId}
            title={`Journal #${journal.journal_number}`}
            label="Discuss"
          />
          <Button size="sm" variant="outline" asChild>
            <Link to="/banking/transactions" search={backSearch}>
              Back to transactions
            </Link>
          </Button>
        </div>
      }
    >
      <div className="mb-3 flex flex-wrap gap-2">
        <Badge variant="outline">{journal.status}</Badge>
        {journal.reversed_by_journal_id ? (
          <Link
            to="/banking/journal/$journalId"
            params={{ journalId: journal.reversed_by_journal_id }}
            search={returnContext ? { returnContext } : {}}
            className="text-sm underline underline-offset-4"
          >
            Reversed by another journal
          </Link>
        ) : null}
        {journal.reverses_journal_id ? (
          <Link
            to="/banking/journal/$journalId"
            params={{ journalId: journal.reverses_journal_id }}
            search={returnContext ? { returnContext } : {}}
            className="text-sm underline underline-offset-4"
          >
            Reverses another journal
          </Link>
        ) : null}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Debit</TableHead>
            <TableHead className="text-right">Credit</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell>{l.accounts ? `${l.accounts.code} ${l.accounts.name}` : "—"}</TableCell>
              <TableCell>{l.description ?? ""}</TableCell>
              <TableCell className="money">
                {l.debit_minor ? fromMinorUnits(l.debit_minor, currency) : ""}
              </TableCell>
              <TableCell className="money">
                {l.credit_minor ? fromMinorUnits(l.credit_minor, currency) : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={2}>Total ({currency})</TableCell>
            <TableCell className="money">{fromMinorUnits(debit, currency)}</TableCell>
            <TableCell className="money">{fromMinorUnits(credit, currency)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
      <DocumentRecordPanel entityType="journal" entityId={journalId} audience="internal" />
    </RecordWorkspace>
  );
}

import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  postingJournalSourceTypes,
  type PostingJournalEntityType,
} from "@/lib/documents/posting-journal-sources";
import { listDocumentPostingJournals } from "@/lib/documents/posting-journals.functions";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Reusable read-only ledger tab for posted source documents. */
export function DocumentPostingJournals({
  entityType,
  entityId,
}: {
  entityType: PostingJournalEntityType;
  entityId: string | null;
}) {
  const { company } = useActiveCompany();
  const { can } = useCan();
  const companyId = company?.id;
  const load = useServerFn(listDocumentPostingJournals);
  const permitted = can("accounting.view") && postingJournalSourceTypes(entityType).length > 0;
  const q = useQuery({
    queryKey: ["document-posting-journals", companyId, entityType, entityId],
    enabled: Boolean(companyId && entityId && permitted),
    queryFn: () =>
      load({
        data: { companyId: companyId!, entityType, entityId: entityId! },
      }),
  });
  if (!permitted) return null;
  if (!entityId)
    return (
      <p className="text-sm text-muted-foreground">
        Save the document before viewing journal entries.
      </p>
    );
  if (q.isPending)
    return <p className="text-sm text-muted-foreground">Loading posted journal entries…</p>;
  if (q.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {friendlyAuthError(q.error)}
      </p>
    );
  if (!q.data?.length)
    return (
      <p className="text-sm text-muted-foreground">
        No posted journal entries for this document. Drafts do not affect the ledger.
      </p>
    );

  return (
    <div className="space-y-5">
      {q.data.map((journal) => {
        const currency = journal.currency_code || company?.base_currency || "GBP";
        const debit = journal.lines.reduce((sum, line) => sum + BigInt(line.debit_minor), 0n);
        const credit = journal.lines.reduce((sum, line) => sum + BigInt(line.credit_minor), 0n);
        return (
          <section key={journal.id} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/banking/journal/$journalId"
                  params={{ journalId: journal.id }}
                  className="font-medium underline underline-offset-4"
                >
                  Journal #{journal.journal_number}
                </Link>
                <Badge variant="outline">{journal.status}</Badge>
                {journal.reverses_journal_id ? <Badge variant="secondary">Reversal</Badge> : null}
                {journal.reversed_by_journal_id ? (
                  <Badge variant="secondary">Reversed</Badge>
                ) : null}
              </div>
              <span className="text-muted-foreground">
                {journal.journal_date} · {currency}
              </span>
            </div>
            <div className="overflow-x-auto">
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
                  {journal.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        {line.account_code} {line.account_name}
                      </TableCell>
                      <TableCell>{line.description || "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {BigInt(line.debit_minor) !== 0n
                          ? fromMinorUnits(BigInt(line.debit_minor), currency)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {BigInt(line.credit_minor) !== 0n
                          ? fromMinorUnits(BigInt(line.credit_minor), currency)
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2}>Total ({currency})</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fromMinorUnits(debit, currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fromMinorUnits(credit, currency)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
            {debit !== credit ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                Journal is out of balance. Contact your accountant.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Balanced posted journal · read only</p>
            )}
          </section>
        );
      })}
    </div>
  );
}

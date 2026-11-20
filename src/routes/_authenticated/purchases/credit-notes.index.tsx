import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useFormat } from "@/hooks/use-format";
import { listCreditNotes } from "@/lib/purchases/purchases.functions";
import { ListSkeleton, EmptyState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { ListToolbar } from "@/components/common/ListTools";
import { useListSearch } from "@/hooks/use-list-search";
import { fromMinorUnits } from "@/lib/accounting/money";
import { Button } from "@/components/ui/button";
import { TableCard } from "@/components/common/table-card";
import { StatusBadge } from "@/components/common/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type CreditRow = {
  id: string;
  credit_date: string;
  status: string;
  total_minor: number;
  amount_allocated_minor: number;
  contacts: { name: string } | null;
};

export const Route = createFileRoute("/_authenticated/purchases/credit-notes/")({
  component: CreditNotesList,
});

function CreditNotesList() {
  const { company } = useActiveCompany();
  const fmt = useFormat();
  const fetch = useServerFn(listCreditNotes);
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";
  const query = useQuery({
    queryKey: ["credits", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetch({ data: { companyId: companyId! } }),
  });
  const rows = (query.data ?? []) as CreditRow[];
  const list = useListSearch(rows, (c) => `${c.credit_date} ${c.contacts?.name ?? ""} ${c.status}`);
  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  return (
    <ListWorkspace
      title="Supplier credit notes"
      description="Authorising posts DR AP / CR expense+tax. Allocate to open bills to reduce outstanding."
      actions={
        <Button size="sm" asChild>
          <Link to="/purchases/credit-notes/new">New credit note</Link>
        </Button>
      }
    >
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load credit notes" />
      ) : !query.isSuccess ? (
        <ListSkeleton />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState
          title="No credit notes"
          description="Create a supplier credit note."
          action={
            <Button size="sm" asChild>
              <Link to="/purchases/credit-notes/new">New credit note</Link>
            </Button>
          }
        />
      ) : (
        <>
          <ListToolbar
            query={list.query}
            onQuery={list.setQuery}
            shown={list.filtered.length}
            total={rows.length}
            placeholder="Search credit notes"
            exportCsv={{
              company: company?.name ?? "",
              title: "Supplier credit notes",
              currency,
              headers: ["Date", "Supplier", "Status", "Total", "Allocated"],
              rows: list.filtered.map((r) => [
                r.credit_date,
                r.contacts?.name ?? "",
                r.status,
                fromMinorUnits(BigInt(r.total_minor), currency),
                fromMinorUnits(BigInt(r.amount_allocated_minor), currency),
              ]),
            }}
          />
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Allocated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        className="underline-offset-2 hover:underline"
                        to="/purchases/credit-notes/$creditNoteId"
                        params={{ creditNoteId: c.id }}
                      >
                        {fmt.date(c.credit_date)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/purchases/credit-notes/$creditNoteId"
                        params={{ creditNoteId: c.id }}
                        className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {c.contacts?.name ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        to="/purchases/credit-notes/$creditNoteId"
                        params={{ creditNoteId: c.id }}
                        className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        <StatusBadge status={c.status} />
                      </Link>
                    </TableCell>
                    <TableCell className="money">
                      <Link
                        to="/purchases/credit-notes/$creditNoteId"
                        params={{ creditNoteId: c.id }}
                        className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {fmt.money(c.total_minor, currency)}
                      </Link>
                    </TableCell>
                    <TableCell className="money">
                      <Link
                        to="/purchases/credit-notes/$creditNoteId"
                        params={{ creditNoteId: c.id }}
                        className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      >
                        {fmt.money(c.amount_allocated_minor, currency)}
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        </>
      )}
    </ListWorkspace>
  );
}

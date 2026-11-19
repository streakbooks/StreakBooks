import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { listBankAccounts } from "@/lib/banking/banking.functions";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function BankFeedsContent({ embedded = false }: { embedded?: boolean }) {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const fetchAccounts = useServerFn(listBankAccounts);
  const accountsQ = useQuery({
    queryKey: ["bank-accounts", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchAccounts({ data: { companyId: companyId! } }),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  const workspace = (
    <>
      <Alert className="mb-4">
        <AlertTitle>Bank feed availability</AlertTitle>
        <AlertDescription>
          Connection status is shown for each account below. If your bank is not connected, you can
          import a CSV statement to continue bookkeeping.
        </AlertDescription>
      </Alert>

      {accountsQ.isPending ? (
        <LoadingState />
      ) : accountsQ.isError ? (
        <QueryErrorState queries={[accountsQ]} title="Could not load bank connections" />
      ) : !accountsQ.data?.length ? (
        <EmptyState
          title="No bank accounts yet"
          description="Add a bank account before importing a statement or reviewing connections."
          action={
            <Button asChild>
              <Link to="/banking">Open bank accounts</Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Feed status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(
              (accountsQ.data ?? []) as Array<{
                id: string;
                name: string;
                currency_code: string;
                feed: { status: string; provider?: string | null };
              }>
            ).map((a) => (
              <TableRow key={a.id}>
                <TableCell>{a.name}</TableCell>
                <TableCell>{a.currency_code}</TableCell>
                <TableCell>
                  <Badge variant="outline">{a.feed?.status ?? "disconnected"}</Badge>
                  {a.feed?.provider ? (
                    <span className="ml-2 text-xs text-muted-foreground">{a.feed.provider}</span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );

  if (embedded) return workspace;
  return (
    <ListWorkspace
      title="Bank feed connections"
      description="Live bank feeds require a configured provider. CSV import remains fully supported without a feed."
      actions={
        <Button size="sm" variant="outline" asChild>
          <Link to="/banking/import">Import CSV</Link>
        </Button>
      }
    >
      {workspace}
    </ListWorkspace>
  );
}

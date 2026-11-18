import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { listCustomers } from "@/lib/sales/sales.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/sales/customers")({
  head: () => ({ meta: [{ title: "Customers — LinkBooks" }] }),
  component: Customers,
});

function Customers() {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const fetch = useServerFn(listCustomers);
  const [q, setQ] = useState("");

  const query = useQuery({
    queryKey: ["customers", companyId, q],
    enabled: Boolean(companyId),
    queryFn: () => fetch({ data: { companyId: companyId!, ...(q ? { q } : {}) } }),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  return (
    <ListWorkspace
      title="Customers"
      description="Shared contact records. Create and edit the full profile in Contacts."
      actions={
        <>
          <Button size="sm" asChild>
            <Link to="/contacts/new" search={{ kind: "customer" }}>
              New customer
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/contacts" search={{ view: undefined }}>
              Open Contacts
            </Link>
          </Button>
        </>
      }
    >
      <Input
        className="mb-4 max-w-xs"
        placeholder="Search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          onRetry={() => void query.refetch()}
          title="Could not load"
          description={friendlyAuthError(query.error)}
        />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState
          title="No customers"
          description="Create a customer contact, then use them on invoices and orders."
          action={
            <Button size="sm" asChild>
              <Link to="/contacts/new" search={{ kind: "customer" }}>
                New customer
              </Link>
            </Button>
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Terms</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(
              query.data as Array<{
                id: string;
                name: string;
                email: string | null;
                payment_terms_days: number;
              }>
            ).map((c) => (
              <TableRow key={c.id}>
                <TableCell>
                  <Link
                    to="/contacts/$contactId"
                    params={{ contactId: c.id }}
                    className="underline-offset-2 hover:underline"
                  >
                    {c.name}
                  </Link>
                </TableCell>
                <TableCell>{c.email ?? "—"}</TableCell>
                <TableCell>{c.payment_terms_days} days</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ListWorkspace>
  );
}

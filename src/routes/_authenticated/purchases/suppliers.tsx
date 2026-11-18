import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { listSuppliers } from "@/lib/purchases/purchases.functions";
import { useCanDo } from "@/hooks/use-can";
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

export const Route = createFileRoute("/_authenticated/purchases/suppliers")({
  head: () => ({ meta: [{ title: "Suppliers — LinkBooks" }] }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const { company } = useActiveCompany();
  const fetchSuppliers = useServerFn(listSuppliers);
  const companyId = company?.id;
  const [q, setQ] = useState("");
  const canManage = useCanDo("contacts.manage");

  const query = useQuery({
    queryKey: ["suppliers", companyId, q],
    enabled: Boolean(companyId),
    queryFn: () => fetchSuppliers({ data: { companyId: companyId!, ...(q ? { q } : {}) } }),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  return (
    <ListWorkspace
      title="Suppliers"
      description="Supplier contacts, payment terms and tax identifiers used on bills and payments. Create the full profile in Contacts."
      actions={
        canManage ? (
          <Button size="sm" asChild>
            <Link to="/contacts/new" search={{ kind: "supplier" }}>
              New supplier
            </Link>
          </Button>
        ) : undefined
      }
    >
      <Input
        className="mb-4 max-w-xs"
        placeholder="Search suppliers"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          title="Could not load suppliers"
          description={friendlyAuthError(query.error)}
          onRetry={() => query.refetch()}
        />
      ) : (query.data ?? []).length === 0 ? (
        <EmptyState
          title="No suppliers"
          description="Create a supplier contact, then use them on bills and payments."
          action={
            canManage ? (
              <Button size="sm" asChild>
                <Link to="/contacts/new" search={{ kind: "supplier" }}>
                  New supplier
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Terms</TableHead>
              <TableHead>Tax #</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(
              query.data as Array<{
                id: string;
                name: string;
                email: string | null;
                payment_terms_days: number;
                tax_number: string | null;
              }>
            ).map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <Link
                    to="/contacts/$contactId"
                    params={{ contactId: s.id }}
                    className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {s.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    to="/contacts/$contactId"
                    params={{ contactId: s.id }}
                    className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {s.email ?? "—"}
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    to="/contacts/$contactId"
                    params={{ contactId: s.id }}
                    className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {s.payment_terms_days} days
                  </Link>
                </TableCell>
                <TableCell>
                  <Link
                    to="/contacts/$contactId"
                    params={{ contactId: s.id }}
                    className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    {s.tax_number ?? "—"}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ListWorkspace>
  );
}

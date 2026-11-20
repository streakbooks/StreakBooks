import { QueryErrorState } from "@/components/common/QueryErrorState";
import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Printer } from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { getSupplierStatement, listSuppliers } from "@/lib/purchases/purchases.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { LoadingState, EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { ContactLookup } from "@/components/lookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/purchases/statements")({
  head: () => ({ meta: [{ title: "Supplier statements — LinkBooks" }] }),
  component: Statements,
});

function Statements() {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const baseCurrency = company?.base_currency ?? "GBP";
  const fetchSuppliers = useServerFn(listSuppliers);
  const fetchStatement = useServerFn(getSupplierStatement);
  const [contactId, setContactId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [currencyChoice, setCurrencyChoice] = useState("");

  const suppliersQ = useQuery({
    queryKey: ["suppliers", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchSuppliers({ data: { companyId: companyId! } }),
  });
  const stmtQ = useQuery({
    queryKey: ["supplier-statement", companyId, contactId, from, to, currencyChoice],
    enabled: Boolean(companyId && contactId),
    queryFn: () =>
      fetchStatement({
        data: {
          companyId: companyId!,
          contactId,
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(currencyChoice ? { currencyCode: currencyChoice } : {}),
        },
      }),
  });

  const currency = (
    (stmtQ.data as { currencyCode?: string } | undefined)?.currencyCode ?? baseCurrency
  ).toUpperCase();
  const availableCurrencies =
    (stmtQ.data as { availableCurrencies?: string[] } | undefined)?.availableCurrencies ?? [];

  const supplierName =
    ((suppliersQ.data ?? []) as Array<{ id: string; name: string }>).find((s) => s.id === contactId)
      ?.name ?? "Supplier";

  const requiredQueries = [suppliersQ];
  if (requiredQueries.some((query) => query.isError))
    return <QueryErrorState queries={requiredQueries} title="Could not load suppliers" />;

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  return (
    <ListWorkspace
      title="Supplier statements"
      description="Opening balance before From, then bills, payments and credits by currency. Print/PDF only — email delivery is not configured."
      actions={
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1 size-4" /> Print / PDF
        </Button>
      }
    >
      <div className="mb-6 flex flex-wrap gap-3">
        <div className="w-64 space-y-1">
          <Label>Supplier</Label>
          <ContactLookup
            ariaLabel="Supplier"
            contacts={(suppliersQ.data ?? []) as Array<{ id: string; name: string }>}
            value={contactId}
            onChange={(id) => {
              setContactId(id);
              setCurrencyChoice("");
            }}
            companyId={companyId}
            createKind="supplier"
            placeholder="Search suppliers"
            allowClear={false}
          />
        </div>
        <div className="space-y-1">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      {availableCurrencies.length > 1 ? (
        <div className="mb-4 flex items-center gap-2 text-sm">
          <Label>Currency</Label>
          <RecordLookupSelect
            className="rounded-md border bg-background px-2 py-1"
            value={currency}
            onValueChange={(e) => setCurrencyChoice(e)}
          >
            {availableCurrencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </RecordLookupSelect>
          <span className="text-muted-foreground">
            Each currency has its own statement; they are never added together.
          </span>
        </div>
      ) : null}
      {!contactId ? (
        <EmptyState
          title="Choose a supplier"
          description="Select a supplier to view their statement."
        />
      ) : stmtQ.isPending ? (
        <LoadingState />
      ) : stmtQ.isError ? (
        <QueryErrorState queries={[stmtQ]} title="Could not load statement" />
      ) : (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{company.name ?? "Organisation"}</h2>
            <p className="text-sm text-muted-foreground">Statement for {supplierName}</p>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <span>
              Open bills <strong>{fromMinorUnits(stmtQ.data!.openBalanceMinor, currency)}</strong>
            </span>
            <span>
              Unapplied credits{" "}
              <strong>
                {fromMinorUnits(
                  (stmtQ.data as { unappliedCreditMinor?: number }).unappliedCreditMinor ?? 0,
                  currency,
                )}
              </strong>
            </span>
            <span>
              Unapplied payments{" "}
              <strong>
                {fromMinorUnits(
                  (stmtQ.data as { unappliedPaymentMinor?: number }).unappliedPaymentMinor ?? 0,
                  currency,
                )}
              </strong>
            </span>
            <span>
              Opening balance{" "}
              <strong>
                {fromMinorUnits(
                  (stmtQ.data as { openingBalanceMinor?: number }).openingBalanceMinor ?? 0,
                  currency,
                )}
              </strong>
            </span>
            <span>
              Closing balance{" "}
              <strong>
                {fromMinorUnits(
                  (stmtQ.data as { closingBalanceMinor?: number }).closingBalanceMinor ?? 0,
                  currency,
                )}
              </strong>
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {from ? (
                <TableRow>
                  <TableCell>{from}</TableCell>
                  <TableCell>Opening</TableCell>
                  <TableCell>Balance brought forward</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">—</TableCell>
                  <TableCell className="text-right">
                    {fromMinorUnits(
                      (stmtQ.data as { openingBalanceMinor?: number }).openingBalanceMinor ?? 0,
                      currency,
                    )}
                  </TableCell>
                </TableRow>
              ) : null}
              {(
                (
                  stmtQ.data as {
                    lines?: Array<{
                      date: string;
                      type: string;
                      id: string;
                      reference: string | null;
                      description?: string;
                      debit_minor: number;
                      credit_minor: number;
                      balance_minor: number;
                    }>;
                  }
                ).lines ?? []
              ).map((l) => (
                <TableRow key={`${l.type}-${l.id}-${l.date}`}>
                  <TableCell>{l.date}</TableCell>
                  <TableCell className="capitalize">{l.type.replace("_", " ")}</TableCell>
                  <TableCell>
                    {l.type === "bill" ? (
                      <Link
                        to="/purchases/bills/$billId"
                        params={{ billId: l.id }}
                        className="underline-offset-2 hover:underline focus-visible:underline"
                      >
                        {l.reference ?? l.id.slice(0, 8)}
                      </Link>
                    ) : l.type === "payment" ? (
                      <Link
                        to="/purchases/payments/$paymentId"
                        params={{ paymentId: l.id }}
                        className="underline-offset-2 hover:underline focus-visible:underline"
                      >
                        {l.reference ?? l.id.slice(0, 8)}
                      </Link>
                    ) : l.type === "credit_note" ? (
                      <Link
                        to="/purchases/credit-notes/$creditNoteId"
                        params={{ creditNoteId: l.id }}
                        className="underline-offset-2 hover:underline focus-visible:underline"
                      >
                        {l.reference ?? l.id.slice(0, 8)}
                      </Link>
                    ) : (
                      (l.description ?? l.reference ?? l.id.slice(0, 8))
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {l.debit_minor ? fromMinorUnits(l.debit_minor, currency) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {l.credit_minor ? fromMinorUnits(l.credit_minor, currency) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {fromMinorUnits(l.balance_minor, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </ListWorkspace>
  );
}

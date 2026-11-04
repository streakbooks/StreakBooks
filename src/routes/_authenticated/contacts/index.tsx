import { nativeTabLinkClass, handleNativeTabKeyDown } from "@/lib/navigation/native-tab";
import { SettingsDestinationLink } from "@/components/settings/ModuleSettingsLinks";
import { useMemo, useState, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Upload, Settings2, Users } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import {
  listContacts,
  getContactsDirectorySummary,
  exportContactsCsv,
} from "@/lib/contacts/contacts.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { PageHeader, ListSkeleton, ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TableCard } from "@/components/common/table-card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/contacts/")({
  validateSearch: (search: Record<string, unknown>): { view?: string | undefined } => ({
    view: [
      "all",
      "customers",
      "suppliers",
      "both",
      "recent",
      "updated",
      "inactive",
      "archived",
    ].includes(String(search["view"]))
      ? String(search["view"])
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Contacts — LinkBooks" },
      { name: "description", content: "LinkBooks contact directory for customers and suppliers." },
    ],
  }),
  component: ContactsPage,
});

type ContactRow = {
  id: string;
  name: string;
  kind: string;
  email: string | null;
  phone: string | null;
  payment_terms_days: number;
  account_number: string | null;
  is_active: boolean;
};

const PAGE_SIZE = 50;

function ContactRecordLink({ contactId, children }: { contactId: string; children: ReactNode }) {
  return (
    <Link
      to="/contacts/$contactId"
      params={{ contactId }}
      className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {children}
    </Link>
  );
}

export function ContactsPage({ initialKind = "customer" }: { initialKind?: string } = {}) {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";
  const qc = useQueryClient();
  const fetch = useServerFn(listContacts);
  const fetchSummary = useServerFn(getContactsDirectorySummary);
  const exportFn = useServerFn(exportContactsCsv);

  const { view: requestedView } = Route.useSearch();
  const view = requestedView ?? "all";
  const [page, setPage] = useState(0);
  const [q, setQ] = useState("");
  const kindForApi = useMemo(() => {
    if (view === "customers") return "customers";
    if (view === "suppliers") return "suppliers";
    return "all";
  }, [view]);

  const query = useQuery({
    queryKey: ["contacts", companyId, view, q, page],
    enabled: Boolean(companyId),
    queryFn: () =>
      fetch({
        data: {
          companyId: companyId!,
          kind: kindForApi,
          view,
          ...(q ? { q } : {}),
          includeInactive: view === "inactive" || view === "archived",
          limit: PAGE_SIZE,
          offset: page * PAGE_SIZE,
        },
      }),
  });

  const summaryQ = useQuery({
    queryKey: ["contacts-summary", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchSummary({ data: { companyId: companyId! } }),
  });

  const exportM = useMutation({
    mutationFn: () =>
      exportFn({
        data: { companyId: companyId!, kind: kindForApi, includeInactive: view === "archived" },
      }),
    onSuccess: (res) => {
      const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `linkbooks-contacts-${view}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${res.count} contacts`);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  const summary = summaryQ.data;

  return (
    <>
      <PageHeader
        title="Contacts"
        description="One directory for customers and suppliers — shared with sales, purchases and statements."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" asChild>
              <Link to="/contacts/new" search={{ kind: "customer" }}>
                New contact
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/contacts/import">
                <Upload className="mr-1 size-4" /> Import
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={exportM.isPending}
              onClick={() => exportM.mutate()}
            >
              <Download className="mr-1 size-4" /> Export
            </Button>
            <Button variant="outline" size="sm" asChild>
              <SettingsDestinationLink destination={{ to: "/contacts/settings" }}>
                <Settings2 className="mr-1 size-4" /> Settings
              </SettingsDestinationLink>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/contacts/duplicates">Duplicates</Link>
            </Button>
          </div>
        }
      />

      {summary ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Active contacts" value={String(summary.activeContactCount)} />
          <Metric
            label={`Receivables (${summary.baseCurrency})`}
            value={fromMinorUnits(summary.receivableMinor, summary.baseCurrency)}
            hint={otherCurrencies(summary.receivableByCurrency, summary.baseCurrency)}
          />
          <Metric
            label={`Payables (${summary.baseCurrency})`}
            value={fromMinorUnits(summary.payableMinor, summary.baseCurrency)}
            hint={otherCurrencies(summary.payableByCurrency, summary.baseCurrency)}
          />
          <Metric
            label="Overdue receivables"
            value={fromMinorUnits(summary.overdueReceivableMinor, summary.baseCurrency)}
          />
          <Metric
            label="Overdue payables"
            value={fromMinorUnits(summary.overduePayableMinor, summary.baseCurrency)}
          />
        </div>
      ) : null}

      <Tabs value={view}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <TabsList onKeyDown={handleNativeTabKeyDown} className="flex h-auto flex-wrap">
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "all"}
              data-state={view === "all" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "all" }}
              onClick={() => setPage(0)}
            >
              All
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "customers"}
              data-state={view === "customers" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "customers" }}
              onClick={() => setPage(0)}
            >
              Customers
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "suppliers"}
              data-state={view === "suppliers" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "suppliers" }}
              onClick={() => setPage(0)}
            >
              Suppliers
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "both"}
              data-state={view === "both" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "both" }}
              onClick={() => setPage(0)}
            >
              Both roles
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "recent"}
              data-state={view === "recent" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "recent" }}
              onClick={() => setPage(0)}
            >
              Recently added
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "updated"}
              data-state={view === "updated" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "updated" }}
              onClick={() => setPage(0)}
            >
              Recently updated
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "inactive"}
              data-state={view === "inactive" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "inactive" }}
              onClick={() => setPage(0)}
            >
              Inactive
            </Link>
            <Link
              className={nativeTabLinkClass}
              role="tab"
              aria-selected={view === "archived"}
              data-state={view === "archived" ? "active" : "inactive"}
              to="/contacts"
              search={{ view: "archived" }}
              onClick={() => setPage(0)}
            >
              Archived
            </Link>
          </TabsList>
          <Input
            placeholder="Search name, email, phone, account #, tax ID…"
            className="lg:max-w-sm"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <TabsContent value={view} className="mt-4">
          {query.isPending ? (
            <ListSkeleton />
          ) : query.isError ? (
            <ErrorState
              onRetry={() => void query.refetch()}
              title="Could not load contacts"
              description={friendlyAuthError(query.error)}
            />
          ) : (query.data ?? []).length === 0 ? (
            <EmptyState
              icon={Users}
              title="No contacts"
              description="Use New contact to create a contact, or import a CSV."
            />
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Account #</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Terms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(query.data as ContactRow[]).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <ContactRecordLink contactId={c.id}>
                          <span className="font-medium">{c.name}</span>
                        </ContactRecordLink>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        <ContactRecordLink contactId={c.id}>
                          {c.account_number ?? "—"}
                        </ContactRecordLink>
                      </TableCell>
                      <TableCell>
                        <ContactRecordLink contactId={c.id}>
                          <Badge variant="neutral" className="capitalize">
                            {c.kind === "both" ? "Customer & supplier" : c.kind}
                          </Badge>
                        </ContactRecordLink>
                      </TableCell>
                      <TableCell>
                        <ContactRecordLink contactId={c.id}>{c.email ?? "—"}</ContactRecordLink>
                      </TableCell>
                      <TableCell>
                        <ContactRecordLink contactId={c.id}>{c.phone ?? "—"}</ContactRecordLink>
                      </TableCell>
                      <TableCell>
                        <ContactRecordLink contactId={c.id}>
                          {c.payment_terms_days}d
                        </ContactRecordLink>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}
          {!query.isPending &&
          !query.isError &&
          (page > 0 || (query.data ?? []).length === PAGE_SIZE) ? (
            <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + (query.data ?? []).length}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={(query.data ?? []).length < PAGE_SIZE}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </>
  );
}

function otherCurrencies(
  rows: Array<{ currency: string; outstandingMinor: number }> | undefined,
  base: string,
): string | undefined {
  const others = (rows ?? []).filter((r) => r.currency !== base.toUpperCase());
  if (!others.length) return undefined;
  return `Also ${others.map((r) => `${fromMinorUnits(r.outstandingMinor, r.currency)} ${r.currency}`).join(", ")}`;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

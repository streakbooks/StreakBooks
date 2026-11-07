import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useFormat } from "@/hooks/use-format";
import { useTablePrefs } from "@/hooks/use-table-prefs";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileListViewToggle,
  type MobileListView,
} from "@/components/common/MobileListViewToggle";
import { InvoiceMobileCards } from "@/components/sales/InvoiceMobileCards";
import { invoiceIsOverdue, invoiceOutstandingMinor } from "@/lib/sales/invoice-list-display";
import { TableAppearanceControls } from "@/components/common/TableAppearanceControls";
import { DocumentPreviewExtras } from "@/components/documents/DocumentPreviewExtras";
import { exportInvoicesCsv, listInvoices } from "@/lib/sales/sales.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { ListSkeleton, ErrorState, EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { StatusBadge } from "@/components/common/stat-card";
import { ListToolbar, Pager, TableCard, SortHead } from "@/components/sales/ListKit";
import { downloadCsv, initialListState, type ListState } from "@/lib/sales/list-state";
import { useDebounced } from "@/hooks/use-debounced";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SavedFilterViews } from "@/components/common/SavedFilterViews";
import type { ViewSchema, ViewSnapshot } from "@/lib/workspaces/saved-filter-views";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/sales/invoices/")({
  head: () => ({ meta: [{ title: "Invoices — LinkBooks" }] }),
  component: InvoicesList,
});

const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "authorised", label: "Authorised" },
  { value: "partly_paid", label: "Partly paid" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

const INVOICE_VIEW_SCHEMA = {
  q: { type: "text", maxLength: 100 },
  status: { type: "choice", choices: ["all", ...STATUSES.map((s) => s.value)] },
  from: { type: "date" },
  to: { type: "date" },
  sort: {
    type: "choice",
    choices: ["invoice_date", "due_date", "invoice_number", "total_minor", "status"],
  },
  dir: { type: "choice", choices: ["asc", "desc"] },
  pageSize: { type: "choice", choices: ["25", "50", "100", "200"] },
  overdue: { type: "boolean" },
} satisfies ViewSchema;

const DEFAULT_INVOICE_VIEW: ViewSnapshot = {
  q: "",
  status: "all",
  from: "",
  to: "",
  sort: "invoice_date",
  dir: "desc",
  pageSize: "50",
  overdue: false,
};

const INVOICE_OPTIONAL_COLUMNS = [
  { id: "date", label: "Invoice date" },
  { id: "due", label: "Due date" },
  { id: "outstanding", label: "Outstanding balance" },
] as const;
const INVOICE_OPTIONAL_IDS = INVOICE_OPTIONAL_COLUMNS.map((column) => column.id);

function InvoicesList() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const { company } = useActiveCompany();
  const fmt = useFormat();
  const fetchInvoices = useServerFn(listInvoices);
  const exportCsv = useServerFn(exportInvoicesCsv);
  const companyId = company?.id;
  const [state, setState] = useState<ListState>(initialListState("invoice_date"));
  const [overdue, setOverdue] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const [mobileView, setMobileView] = useState<MobileListView>("cards");
  const tablePrefs = useTablePrefs(
    `${user.id}:${companyId ?? "none"}:sales-invoices`,
    INVOICE_OPTIONAL_IDS,
  );
  const patch = (p: Partial<ListState>) => setState((s) => ({ ...s, ...p }));
  const q = useDebounced(state.q);
  useEffect(
    () => setPreviewId(null),
    [
      companyId,
      q,
      state.status,
      state.page,
      state.pageSize,
      state.from,
      state.to,
      state.sort,
      state.dir,
      overdue,
    ],
  );

  const filters = () => ({
    companyId: companyId!,
    q,
    ...(state.status !== "all" ? { status: state.status } : {}),
    ...(overdue ? { overdue: true } : {}),
    ...(state.from ? { from: state.from } : {}),
    ...(state.to ? { to: state.to } : {}),
    sort: state.sort,
    dir: state.dir,
  });

  const query = useQuery({
    queryKey: ["sales-invoices", companyId, q, state, overdue],
    enabled: Boolean(companyId),
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchInvoices({ data: { ...filters(), page: state.page, pageSize: state.pageSize } }),
  });
  const exporter = useMutation({
    mutationFn: () => exportCsv({ data: filters() }),
    onSuccess: (r) => {
      downloadCsv(r.filename, r.csv);
      toast.success(`Exported ${r.rowCount} invoices`);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  const rows = query.data?.rows ?? [];
  const today = query.data?.today ?? "";
  const previewInvoice = query.isPlaceholderData
    ? undefined
    : rows.find((invoice) => invoice.id === previewId);

  return (
    <ListWorkspace
      title="Invoices"
      description="Customer invoices. Authorising posts Accounts Receivable via the shared ledger."
      actions={
        <Button size="sm" asChild>
          <Link to="/sales/invoices/new">New invoice</Link>
        </Button>
      }
    >
      <ListToolbar
        state={state}
        onChange={patch}
        statuses={STATUSES}
        searchPlaceholder="Search number, memo or customer"
        onExport={() => exporter.mutate()}
        exporting={exporter.isPending}
        extra={
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              checked={overdue}
              onChange={(e) => {
                setOverdue(e.target.checked);
                patch({ page: 0 });
              }}
            />
            Overdue only
          </label>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card/70 p-3 print:hidden">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Quick filters
        </span>
        <Button
          variant={overdue && state.status === "all" ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            setOverdue(true);
            patch({ status: "all", page: 0 });
          }}
        >
          Overdue
        </Button>
        <Button
          variant={state.status === "draft" && !overdue ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            setOverdue(false);
            patch({ status: "draft", page: 0 });
          }}
        >
          Drafts
        </Button>
        <Button
          variant={state.status === "partly_paid" && !overdue ? "secondary" : "outline"}
          size="sm"
          onClick={() => {
            setOverdue(false);
            patch({ status: "partly_paid", page: 0 });
          }}
        >
          Partly paid
        </Button>
        <div className="ml-auto">
          <SavedFilterViews
            scope={user.id + ":" + companyId + ":sales-invoices"}
            schema={INVOICE_VIEW_SCHEMA}
            defaults={DEFAULT_INVOICE_VIEW}
            current={{
              q: state.q,
              status: state.status,
              from: state.from,
              to: state.to,
              sort: state.sort,
              dir: state.dir,
              pageSize: String(state.pageSize),
              overdue,
            }}
            onApply={(view) => {
              setState({
                ...initialListState("invoice_date"),
                q: String(view["q"] ?? ""),
                status: String(view["status"] ?? "all"),
                from: String(view["from"] ?? ""),
                to: String(view["to"] ?? ""),
                sort: String(view["sort"] ?? "invoice_date"),
                dir: view["dir"] === "asc" ? "asc" : "desc",
                pageSize: Number(view["pageSize"] ?? 50),
              });
              setOverdue(view["overdue"] === true);
            }}
            onReset={() => {
              setState(initialListState("invoice_date"));
              setOverdue(false);
            }}
          />
        </div>
        <MobileListViewToggle view={mobileView} onChange={setMobileView} context="invoices" />
        <TableAppearanceControls
          columns={INVOICE_OPTIONAL_COLUMNS}
          hidden={tablePrefs.hidden}
          density={tablePrefs.density}
          onToggleColumn={tablePrefs.toggle}
          onDensityChange={tablePrefs.setDensity}
          onReset={tablePrefs.reset}
        />
      </div>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <ErrorState
          title="Could not load invoices"
          description={friendlyAuthError(query.error)}
          onRetry={() => query.refetch()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No invoices"
          description={
            q || state.status !== "all" || overdue || state.from || state.to
              ? "No invoices match these filters."
              : "Create a customer invoice to start."
          }
          action={
            <Button size="sm" asChild>
              <Link to="/sales/invoices/new">New invoice</Link>
            </Button>
          }
        />
      ) : (
        <>
          {isMobile && mobileView === "cards" ? (
            <InvoiceMobileCards
              rows={rows}
              today={today}
              density={tablePrefs.density}
              date={(value) => fmt.date(value)}
              money={(minor, currency) => fmt.money(minor, currency)}
              onPreview={setPreviewId}
            />
          ) : (
            <TableCard>
              <Table
                className={
                  tablePrefs.density === "compact"
                    ? "[&_th]:h-8 [&_td]:py-1.5 [&_td]:text-xs"
                    : undefined
                }
              >
                <TableHeader>
                  <TableRow>
                    <SortHead
                      label="Number"
                      column="invoice_number"
                      state={state}
                      onChange={patch}
                    />
                    {tablePrefs.isVisible("date") ? (
                      <SortHead
                        label="Date"
                        column="invoice_date"
                        state={state}
                        onChange={patch}
                        className="hidden lg:table-cell"
                      />
                    ) : null}
                    {tablePrefs.isVisible("due") ? (
                      <SortHead
                        label="Due"
                        column="due_date"
                        state={state}
                        onChange={patch}
                        className="hidden lg:table-cell"
                      />
                    ) : null}
                    <TableHead>Customer</TableHead>
                    <SortHead label="Status" column="status" state={state} onChange={patch} />
                    <SortHead
                      label="Total"
                      column="total_minor"
                      state={state}
                      onChange={patch}
                      className="text-right"
                    />
                    {tablePrefs.isVisible("outstanding") ? (
                      <TableHead className="hidden text-right lg:table-cell">Outstanding</TableHead>
                    ) : null}
                    <TableHead className="sticky right-0 z-10 min-w-[120px] bg-muted/95 text-right">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((inv) => {
                    const out = invoiceOutstandingMinor(inv);
                    const isOverdue = invoiceIsOverdue(inv, today);
                    return (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <Link
                            to="/sales/invoices/$invoiceId"
                            params={{ invoiceId: inv.id }}
                            className="underline-offset-2 hover:underline"
                          >
                            {inv.invoice_number ?? inv.id.slice(0, 8)}
                          </Link>
                        </TableCell>
                        {tablePrefs.isVisible("date") ? (
                          <TableCell className="hidden lg:table-cell">
                            <Link
                              to="/sales/invoices/$invoiceId"
                              params={{ invoiceId: inv.id }}
                              className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            >
                              {fmt.date(inv.invoice_date)}
                            </Link>
                          </TableCell>
                        ) : null}
                        {tablePrefs.isVisible("due") ? (
                          <TableCell className="hidden lg:table-cell">
                            <Link
                              to="/sales/invoices/$invoiceId"
                              params={{ invoiceId: inv.id }}
                              className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            >
                              {fmt.date(inv.due_date)}
                            </Link>
                          </TableCell>
                        ) : null}
                        <TableCell>
                          <Link
                            to="/sales/invoices/$invoiceId"
                            params={{ invoiceId: inv.id }}
                            className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            {inv.contacts?.name ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/sales/invoices/$invoiceId"
                            params={{ invoiceId: inv.id }}
                            className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            <StatusBadge status={isOverdue ? "overdue" : inv.status} />
                          </Link>
                        </TableCell>
                        <TableCell className="money">
                          <Link
                            to="/sales/invoices/$invoiceId"
                            params={{ invoiceId: inv.id }}
                            className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                          >
                            {fmt.money(inv.total_minor, inv.currency_code)}
                          </Link>
                        </TableCell>
                        {tablePrefs.isVisible("outstanding") ? (
                          <TableCell className="money hidden lg:table-cell">
                            <Link
                              to="/sales/invoices/$invoiceId"
                              params={{ invoiceId: inv.id }}
                              className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            >
                              {fmt.money(out, inv.currency_code)}
                            </Link>
                          </TableCell>
                        ) : null}
                        <TableCell className="sticky right-0 z-10 border-l bg-card text-right">
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPreviewId(inv.id)}
                              aria-label={
                                "Preview invoice " + (inv.invoice_number ?? inv.id.slice(0, 8))
                              }
                            >
                              Preview
                            </Button>
                            <Button asChild variant="outline" size="sm">
                              <Link
                                to="/sales/invoices/$invoiceId"
                                params={{ invoiceId: inv.id }}
                                aria-label={
                                  "Open invoice " + (inv.invoice_number ?? inv.id.slice(0, 8))
                                }
                              >
                                Open
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableCard>
          )}
          <Pager total={query.data?.total ?? 0} state={state} onChange={patch} />
        </>
      )}
      <Sheet open={Boolean(previewInvoice)} onOpenChange={(open) => !open && setPreviewId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Invoice {previewInvoice?.invoice_number ?? "preview"}</SheetTitle>
            <SheetDescription>
              Read-only review with line items and attachments. Open the full record for editing,
              payments and posting history.
            </SheetDescription>
          </SheetHeader>
          {previewInvoice ? (
            <div className="mt-6 space-y-5">
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-4">
                <span className="text-sm font-semibold">Status</span>
                <StatusBadge status={previewInvoice.status} />
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">Customer</dt>
                  <dd className="mt-1 font-medium">{previewInvoice.contacts?.name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Invoice date</dt>
                  <dd className="mt-1 font-medium">{fmt.date(previewInvoice.invoice_date)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Due date</dt>
                  <dd className="mt-1 font-medium">{fmt.date(previewInvoice.due_date)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {fmt.money(previewInvoice.total_minor, previewInvoice.currency_code)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Outstanding</dt>
                  <dd className="mt-1 font-semibold tabular-nums">
                    {fmt.money(
                      invoiceOutstandingMinor(previewInvoice),
                      previewInvoice.currency_code,
                    )}
                  </dd>
                </div>
              </dl>
              <DocumentPreviewExtras
                key={`${companyId}:${previewInvoice.id}`}
                companyId={companyId}
                documentId={previewInvoice.id}
                kind="sales_invoice"
                currency={previewInvoice.currency_code}
                money={(minor, code) => fmt.money(minor, code)}
              />
              <Button asChild className="w-full">
                <Link to="/sales/invoices/$invoiceId" params={{ invoiceId: previewInvoice.id }}>
                  Open full invoice
                </Link>
              </Button>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </ListWorkspace>
  );
}

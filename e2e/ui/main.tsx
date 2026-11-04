import { QueryErrorState } from "@/components/common/QueryErrorState";
import { FirmStaffAssignments } from "@/components/firm/FirmStaffAssignments";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route as BatchRoute } from "@/routes/_authenticated/purchases/payments.batch";
import { PortalInvoiceDetail } from "@/components/portals/customer-pages";
import { BillWorkspaceLayout } from "@/components/purchases/BillWorkspaceLayout";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { PageHeader, EmptyState, ErrorState, ListSkeleton } from "@/components/common/states";
import { ModuleSubnav } from "@/components/common/ModuleSubnav";
import { ListToolbar, matchesQuery } from "@/components/common/ListTools";
import { DataTableToolbar } from "@/components/common/data-table-toolbar";
import { CsvImportPreview } from "@/components/common/CsvImportPreview";
import { FormSection, FormField } from "@/components/common/form-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "../../src/styles.css";
// Only browser-local interactions; no database connection or financial mutation.
new Function(THEME_INIT_SCRIPT)();
const rows = [
  { number: "INV-1046", name: "River & Co", amount: "£9,160.00" },
  { number: "INV-1045", name: "Northfield Media", amount: "£4,800.00" },
];
export function Fixture() {
  const [query, setQuery] = useState("");
  const [hidden, setHidden] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [retry, setRetry] = useState(false);
  const [selected, setSelected] = useState(0);
  const filtered = rows.filter((row) => matchesQuery(`${row.number} ${row.name}`, query));
  const csv =
    'name,email,notes\r\n"River, Co",river@example.test,"Quoted ""note"""\r\nNorthfield,north@example.test,"Line 1\nLine 2"';
  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <main className="mx-auto min-w-0 max-w-6xl">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <PageHeader
          title="Invoices"
          description="Review and manage customer invoices."
          actions={
            <Dialog>
              <DialogTrigger asChild>
                <Button>New invoice</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New invoice</DialogTitle>
                  <DialogDescription>
                    Verify long forms remain usable on narrow screens.
                  </DialogDescription>
                </DialogHeader>
                <FormSection title="Customer details" columns={1}>
                  {Array.from({ length: 14 }, (_, i) => (
                    <FormField key={i} label={`Field ${i + 1}`} htmlFor={`field-${i}`}>
                      <Input id={`field-${i}`} />
                    </FormField>
                  ))}
                </FormSection>
                <Button type="button">Save draft</Button>
              </DialogContent>
            </Dialog>
          }
        />
        <ModuleSubnav
          label="Sales"
          settings={{ to: "/sales/settings" }}
          items={[
            { to: "/sales", label: "Overview", exact: true },
            { to: "/sales/invoices", label: "Invoices" },
            { to: "/sales/quotes", label: "Quotes" },
            { to: "/sales/receipts", label: "Receipts" },
            { to: "/sales/credits", label: "Credit notes" },
            { to: "/sales/recurring", label: "Recurring" },
            { to: "/sales/statements", label: "Statements" },
          ]}
        />
        <ListToolbar
          query={query}
          onQuery={setQuery}
          shown={filtered.length}
          total={rows.length}
          placeholder="Search invoices"
          exportCsv={{
            company: "Fixture",
            title: "Invoices",
            currency: "GBP",
            headers: ["Number", "Customer", "Amount"],
            rows: filtered.map((r) => [r.number, r.name, r.amount]),
          }}
        />
        <DataTableToolbar
          columns={[{ id: "customer", label: "Customer", visible: !hidden }]}
          onToggleColumn={() => setHidden(!hidden)}
          density={density}
          onDensityChange={setDensity}
          selectedCount={selected}
          onClearSelection={() => setSelected(0)}
          bulkActions={<Button onClick={() => setSelected(0)}>Review selected</Button>}
        />
        <p role="status">Spacing: {density}</p>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table aria-label="Invoices">
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                {!hidden ? <TableHead>Customer</TableHead> : null}
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.number}>
                  <TableCell>{r.number}</TableCell>
                  {!hidden ? <TableCell>{r.name}</TableCell> : null}
                  <TableCell className="text-right">{r.amount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <Button className="my-4" variant="outline" onClick={() => setSelected(2)}>
          Select records
        </Button>
        <CsvImportPreview text={csv} />
        <section aria-label="Error recovery">
          {retry ? (
            <p role="status">Records reloaded</p>
          ) : (
            <ErrorState title="Could not load records" onRetry={() => setRetry(true)} />
          )}
        </section>
        <div className="mt-4">
          <EmptyState
            title="No records"
            description="Choose a different view."
            actionLabel="Unavailable action"
          />
        </div>
        <div className="mt-4">
          <ListSkeleton />
        </div>
      </main>
    </div>
  );
}
function BillFixture() {
  const [tab, setTab] = useState("summary");
  return (
    <main className="p-4">
      <BillWorkspaceLayout
        companyId="fixture-company"
        contactId="supplier-one"
        currency="GBP"
        sidebarState="open"
        sidebarWidthPx={340}
        sidebarTab={tab}
        onSidebarTabChange={setTab}
        onSidebarStateChange={() => {}}
        onSidebarWidthChange={() => {}}
        header={<PageHeader title="New bill" />}
      >
        <Input aria-label="Unsaved bill note" defaultValue="Keep this note" />
      </BillWorkspaceLayout>
    </main>
  );
}
function QueryFailureFixture() {
  const [retried, setRetried] = useState(0);
  const [successful, setSuccessful] = useState(0);
  return (
    <main>
      <QueryErrorState
        title="Required data unavailable"
        queries={[
          {
            isError: true,
            error: new Error("First failed request"),
            refetch: () => setRetried((n) => n + 1),
          },
          {
            isError: true,
            error: new Error("Second failed request"),
            refetch: () => setRetried((n) => n + 1),
          },
          { isError: false, error: null, refetch: () => setSuccessful((n) => n + 1) },
        ]}
      />
      <p role="status">
        Failed retries: {retried}; successful retries: {successful}
      </p>
    </main>
  );
}
function Scenario() {
  const params = new URLSearchParams(window.location.search);
  const Batch = BatchRoute.options.component!;
  if (params.get("flow") === "query-error") return <QueryFailureFixture />;
  if (params.get("flow") === "staff")
    return (
      <main className="p-4">
        <FirmStaffAssignments
          firmId="firm-fixture"
          clients={[
            {
              id: "client-one",
              company_id: "fixture-company",
              access_level: "full",
              companies: { name: "Acme Studio" },
            },
          ]}
          canManage={params.get("readonly") !== "true"}
        />
      </main>
    );
  if (params.get("flow") === "batch")
    return (
      <main className="p-4">
        <Batch />
      </main>
    );
  if (params.get("flow") === "portal")
    return (
      <main className="p-4">
        <PortalInvoiceDetail invoiceId="invoice-one" />
      </main>
    );
  if (params.get("flow") === "bill") return <BillFixture />;
  return <Fixture />;
}
const root = createRootRoute({ component: Scenario });
const child = createRoute({ getParentRoute: () => root, path: "$" });
const router = createRouter({ routeTree: root.addChildren([child]) });
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);

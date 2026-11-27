import { Route as AccountingRoute } from "@/routes/_authenticated/accounting";
import { useCaptcha } from "@/hooks/use-captcha";
import { SettingsCommandPalette } from "@/components/settings/SettingsCommandPalette";
import { MoneyField } from "@/components/banking/MoneyField";
import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { CheckoutForm } from "@/components/billing/CheckoutForm";
import { Route as ContactImportRoute } from "@/routes/_authenticated/contacts/import";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { FirmStaffAssignments } from "@/components/firm/FirmStaffAssignments";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Route as BatchRoute } from "@/routes/_authenticated/purchases/payments.batch";
import { PortalInvoiceDetail } from "@/components/portals/customer-pages";
import { BillWorkspaceLayout } from "@/components/purchases/BillWorkspaceLayout";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/common/states";
import { ModuleSubnav } from "@/components/common/ModuleSubnav";
import { ListToolbar } from "@/components/common/ListTools";
import { matchesQuery } from "@/lib/list-search";
import { DataTableToolbar } from "@/components/common/data-table-toolbar";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";
import { WorkspaceInsights } from "@/components/workspace/WorkspaceInsights";
import { CsvImportPreview } from "@/components/common/CsvImportPreview";
import {
  FormSection,
  FormField,
  FormGrid,
  FormControlShell,
} from "@/components/common/form-layout";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEmptyDocumentLines } from "@/lib/ui/document-line-defaults";
import { EditableLineItemGrid } from "@/components/common/EditableLineItemGrid";
import { TotalsSummary } from "@/components/common/TotalsSummary";
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
        <ListWorkspace
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
          subnav={
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
          }
          toolbar={
            <>
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
            </>
          }
        >
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
        </ListWorkspace>
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
        header={
          <RecordWorkspace
            title="New bill"
            insights={
              <WorkspaceInsights
                facts={[{ label: "Supplier", value: "Northfield" }]}
                footer="Fixture insight rail — ledger facts only."
              />
            }
          >
            <span className="sr-only">Bill entry workspace</span>
          </RecordWorkspace>
        }
      >
        <Input aria-label="Unsaved bill note" defaultValue="Keep this note" />
      </BillWorkspaceLayout>
    </main>
  );
}

function DensityFixture() {
  const lines = createEmptyDocumentLines(() => ({ id: crypto.randomUUID() }));
  return (
    <main className="min-h-screen bg-background p-4">
      <TransactionWorkspace
        title="New bill density"
        breadcrumbs={[
          { label: "Purchases", to: "/" },
          { label: "Bills", to: "/" },
          { label: "New" },
        ]}
        stickyActions={
          <>
            <Button variant="outline">Save draft</Button>
            <Button>Save & authorise</Button>
          </>
        }
        details={
          <FormGrid columns={4}>
            <FormControlShell width="contact">
              <Label htmlFor="density-supplier">Supplier</Label>
              <Input id="density-supplier" aria-label="Supplier" defaultValue="Northfield" />
            </FormControlShell>
            <FormControlShell width="date">
              <Label htmlFor="density-bill-date">Bill date</Label>
              <Input
                id="density-bill-date"
                aria-label="Bill date"
                type="date"
                defaultValue="2026-11-18"
              />
            </FormControlShell>
            <FormControlShell width="date">
              <Label htmlFor="density-due-date">Due date</Label>
              <Input
                id="density-due-date"
                aria-label="Due date"
                type="date"
                defaultValue="2026-12-18"
              />
            </FormControlShell>
            <FormControlShell width="currency">
              <Label>Currency</Label>
              <Select defaultValue="GBP">
                <SelectTrigger aria-label="Currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GBP">GBP</SelectItem>
                </SelectContent>
              </Select>
            </FormControlShell>
            <FormControlShell width="money">
              <Label htmlFor="density-qty">Quantity</Label>
              <Input id="density-qty" aria-label="Quantity" inputMode="decimal" defaultValue="1" />
            </FormControlShell>
          </FormGrid>
        }
        lines={
          <EditableLineItemGrid
            aria-label="Line items"
            columns={[
              {
                id: "description",
                header: "Description",
                widthPx: 280,
                minWidthPx: 200,
                fluid: true,
              },
              { id: "qty", header: "Qty", align: "right", widthPx: 72, minWidthPx: 64 },
              { id: "price", header: "Price", align: "right", widthPx: 100, minWidthPx: 80 },
              { id: "actions", header: "", widthPx: 48, minWidthPx: 40, resizable: false },
            ]}
            onAddRow={() => undefined}
            footer={
              <TotalsSummary
                lines={[
                  { id: "subtotal", label: "Subtotal", value: "0.00" },
                  { id: "tax", label: "Total tax", value: "0.00" },
                  { id: "total", label: "Total", value: "0.00", emphasis: "total" },
                ]}
              />
            }
          >
            {lines.map((line, index) => (
              <TableRow key={line.id}>
                <TableCell className="p-0">
                  <Input aria-label={`Line ${index + 1} description`} defaultValue="" />
                </TableCell>
                <TableCell className="p-0">
                  <Input
                    aria-label={`Line ${index + 1} qty`}
                    defaultValue=""
                    className="text-right"
                  />
                </TableCell>
                <TableCell className="p-0">
                  <Input
                    aria-label={`Line ${index + 1} price`}
                    defaultValue=""
                    className="text-right"
                  />
                </TableCell>
                <TableCell className="p-0" />
              </TableRow>
            ))}
          </EditableLineItemGrid>
        }
      />
      <output aria-label="Default line count">{lines.length}</output>
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
function AccessibilityFixture() {
  const [amount, setAmount] = useState("invalid");
  const [secondAmount, setSecondAmount] = useState("invalid");
  const [customer, setCustomer] = useState("");
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("none");
  return (
    <main className="min-h-screen space-y-5 bg-background p-5 text-foreground">
      <h1 className="text-xl font-semibold">Accessible financial entry</h1>
      <label htmlFor="transfer-amount">Transfer amount</label>
      <MoneyField id="transfer-amount" value={amount} onChange={setAmount} currency="GBP" />
      <p id="destination-label">Destination amount</p>
      <MoneyField
        label="Destination amount"
        value={secondAmount}
        onChange={setSecondAmount}
        currency="GBP"
      />
      <label id="customer-label" htmlFor="customer-record">
        Customer record
      </label>
      <p id="customer-help">Choose the customer for this transaction.</p>
      <RecordLookupSelect required value={customer} onValueChange={setCustomer}>
        <SelectTrigger
          id="customer-record"
          aria-labelledby="customer-label"
          aria-describedby={customer ? "customer-help" : "customer-help customer-error"}
          aria-invalid={!customer}
        >
          <SelectValue placeholder="Choose customer" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="river" id="option-must-not-be-control-id">
            River &amp; Co
          </SelectItem>
          <SelectItem value="inactive" disabled>
            Inactive customer
          </SelectItem>
        </SelectContent>
      </RecordLookupSelect>
      {!customer ? (
        <p id="customer-error" role="alert" className="text-sm text-destructive-ink">
          A customer is required.
        </p>
      ) : null}
      <Button type="button" onClick={() => setOpen(true)}>
        Search settings
      </Button>
      <p>Settings destination: {section}</p>
      <SettingsCommandPalette open={open} onOpenChange={setOpen} onSelectSection={setSection} />
    </main>
  );
}
function CheckoutFixture() {
  const [revision, setRevision] = useState(0);
  const [razorpay, setRazorpay] = useState(true);
  const [handoffs, setHandoffs] = useState(0);
  return (
    <main className="min-h-screen bg-background p-4 text-foreground">
      <h1>Review subscription</h1>
      <Button type="button" onClick={() => setRevision(revision + 1)}>
        Rerender checkout
      </Button>
      <Button type="button" onClick={() => setRazorpay(false)}>
        Disable Razorpay fixture
      </Button>
      <p role="status">
        Checkout handoffs: {handoffs}; render: {revision}
      </p>
      <CheckoutForm
        planName="Business"
        interval="monthly"
        monthly={{ GBP: 20, USD: 20, AUD: 20, NZD: 20, INR: 2000 }}
        annualFreeMonths={0}
        companyName="Acme Studio"
        defaultCountry="IN"
        busy={false}
        serverError={null}
        providers={{ stripe: true, razorpay }}
        // Fixture intentionally offers both providers so draft/handoff coverage can switch
        // methods. Production checkout always passes server-routed providers only.
        routedProviders={["stripe", "razorpay"]}
        quote={{
          currency: "INR",
          interval: "monthly",
          listMinor: 200000,
          discountMinor: 0,
          dueMinor: 200000,
          recurringMinor: 200000,
          promoDurationMonths: null,
          freeMonths: 0,
          trialDays: 0,
          offerCode: null,
        }}
        quoteLoading={false}
        quoteError={null}
        onBack={() => {}}
        onPay={() => setHandoffs(handoffs + 1)}
      />
    </main>
  );
}
function CaptchaFixture() {
  const captcha = useCaptcha();
  return (
    <main className="p-4">
      <h1>Verification state</h1>
      {captcha.widget}
      <p role="status">Verification {captcha.ready ? "ready" : "required"}</p>
      <Button type="button" disabled={!captcha.ready} onClick={captcha.reset}>
        Finish fixture request
      </Button>
    </main>
  );
}

function LookupMigrationFixture() {
  const [record, setRecord] = useState("");
  const [mode, setMode] = useState("active");
  const [applied, setApplied] = useState(0);
  const records = [
    { id: "member-a", name: "Alex · North", disabled: false },
    { id: "member-b", name: "Alex · South", disabled: false },
    { id: "member-disabled", name: "Archived member", disabled: true },
  ];
  return (
    <main className="max-w-xl space-y-4 p-4">
      <RecordLookupSelect
        id="migrated-member"
        aria-label="Organisation member"
        value={record}
        onValueChange={setRecord}
      >
        <option value="">All members</option>
        <optgroup label="Team">
          {records.map((row) => (
            <option key={row.id} value={row.id} disabled={row.disabled}>
              {row.name}
            </option>
          ))}
        </optgroup>
      </RecordLookupSelect>
      <output aria-label="Selected member ID">{record || "all"}</output>
      <RecordLookupSelect value={mode} onValueChange={setMode}>
        <SelectTrigger aria-label="Member status" className="w-48" aria-describedby="mode-help">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {["active", "archived"].map((status) => (
            <SelectItem key={status} value={status}>
              {status}
            </SelectItem>
          ))}
        </SelectContent>
      </RecordLookupSelect>
      <p id="mode-help">Status changes the view without altering records.</p>
      <output aria-label="Selected status">{mode}</output>
      <RecordLookupSelect
        aria-label="Apply template"
        value=""
        onValueChange={(value) => {
          if (value) setApplied((count) => count + 1);
        }}
      >
        <option value="">Choose a template</option>
        {["standard"].map((value) => (
          <option key={value} value={value}>
            Standard template
          </option>
        ))}
      </RecordLookupSelect>
      <output aria-label="Template applications">{applied}</output>
      <RecordLookupSelect
        disabled
        aria-label="Denied selector"
        value={record}
        onValueChange={setRecord}
      >
        {records.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </RecordLookupSelect>
    </main>
  );
}

function Scenario() {
  if (window.location.pathname.startsWith("/accounting")) return <Outlet />;
  const params = new URLSearchParams(window.location.search);
  if (params.get("flow") === "lookup-migration") return <LookupMigrationFixture />;
  if (params.get("flow") === "captcha") return <CaptchaFixture />;
  if (params.get("flow") === "accessibility") return <AccessibilityFixture />;
  if (params.get("flow") === "checkout") return <CheckoutFixture />;
  const Batch = BatchRoute.options.component!;
  const ContactImport = ContactImportRoute.options.component!;
  if (params.get("flow") === "contact-import")
    return (
      <main className="p-4">
        <ContactImport />
      </main>
    );
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
  if (params.get("flow") === "density") return <DensityFixture />;
  return <Fixture />;
}
const root = createRootRoute({ component: Scenario });
const child = createRoute({ getParentRoute: () => root, path: "$" });
const app = createRoute({
  getParentRoute: () => root,
  id: "_authenticated",
  component: () => (
    <main className="p-4">
      <Outlet />
    </main>
  ),
});
const accounting = createRoute({
  getParentRoute: () => app,
  path: "/accounting",
  validateSearch: AccountingRoute.options.validateSearch,
  component: AccountingRoute.options.component,
});
const router = createRouter({
  routeTree: root.addChildren([child, app.addChildren([accounting])]),
});
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);

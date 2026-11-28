import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { LookupSelect } from "@/components/lookup/LookupSelect";
import { AccountLookup, ContactLookup } from "@/components/lookup/variants";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCan } from "@/hooks/use-can";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { fromMinorUnits, toMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listContacts } from "@/lib/contacts/contacts.functions";
import { parseUnitCsv } from "@/lib/real-estate/csv";
import { buildInstalmentSchedule } from "@/lib/real-estate/instalments";
import {
  advanceRealEstateSale,
  approveRealEstateBudget,
  approveRealEstateCommission,
  cancelRealEstateSale,
  collectRealEstate,
  confirmRealEstateBooking,
  createRealEstateBroker,
  createRealEstateProject,
  createRealEstateUnit,
  expireRealEstateHolds,
  getRealEstateLedgerTie,
  importRealEstateUnits,
  placeRealEstateHold,
  postRealEstateCommission,
  recogniseRealEstate,
  recordRealEstateCost,
  refundRealEstate,
  releaseRealEstateHold,
  reverseRealEstateRecognition,
  saveRealEstateBudget,
  saveRealEstateCommissionRule,
  saveRealEstatePlan,
  saveRealEstateSettings,
  suggestRealEstateCommission,
  transitionRealEstateUnit,
} from "@/lib/real-estate/real-estate.functions";
import { assessRecognition } from "@/lib/real-estate/recognition";
import { suggestedLateFeeMinor } from "@/lib/real-estate/instalments";
import { genericTransitions, isUnitStatus } from "@/lib/real-estate/status";
import type { ReSectionKey, RealEstateSearch } from "@/lib/real-estate/sections";
import { cell, minor, type JsonRow, type RealEstateWorkspace } from "@/lib/real-estate/types";
import { toast } from "sonner";

const ACCOUNT_ROLES = [
  ["bank", "Bank or cash"],
  ["contract_liability", "Customer deposits / contract liability"],
  ["contract_asset", "Contract asset"],
  ["revenue", "Property sales revenue"],
  ["inventory", "Development inventory or WIP"],
  ["cost_of_sales", "Cost of properties sold"],
  ["commission_expense", "Commission expense"],
  ["commission_payable", "Commission payable"],
  ["withholding_payable", "Commission withholding"],
  ["operating_expense", "Operating project expense"],
  ["operating_payable", "Operating cost payable"],
] as const;

export function RealEstateSection({
  sectionKey,
  companyId,
  currency,
  data,
  search,
}: {
  sectionKey: ReSectionKey;
  companyId: string;
  currency: string;
  data: RealEstateWorkspace;
  search: RealEstateSearch;
}) {
  if (sectionKey === "overview")
    return <Overview data={data} currency={currency} search={search} />;
  if (sectionKey === "projects")
    return <Projects companyId={companyId} data={data} search={search} />;
  if (sectionKey === "inventory") {
    return <Inventory companyId={companyId} currency={currency} data={data} search={search} />;
  }
  if (sectionKey === "reservations") return <Reservations companyId={companyId} data={data} />;
  if (sectionKey === "sales")
    return <Sales companyId={companyId} currency={currency} data={data} />;
  if (sectionKey === "payment-plans")
    return <Plans companyId={companyId} currency={currency} data={data} />;
  if (sectionKey === "instalments") return <Instalments currency={currency} data={data} />;
  if (sectionKey === "collections")
    return <Collections companyId={companyId} currency={currency} data={data} />;
  if (sectionKey === "commissions")
    return <Commissions companyId={companyId} currency={currency} data={data} />;
  if (sectionKey === "development-costs")
    return <Costs companyId={companyId} currency={currency} data={data} />;
  if (sectionKey === "budgets")
    return <Budgets companyId={companyId} currency={currency} data={data} />;
  if (sectionKey === "reports") return <LedgerTie companyId={companyId} currency={currency} />;
  return <Settings companyId={companyId} data={data} />;
}

function Overview({
  data,
  currency,
  search,
}: {
  data: RealEstateWorkspace;
  currency: string;
  search: RealEstateSearch;
}) {
  const metrics = data.metrics;
  const unrecognised = Math.max(0, metrics.contractedMinor - metrics.recognisedMinor);
  const max = Math.max(...Object.values(data.byStatus), 1);
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Inventory value is the sum of list prices. Collected cash is a contract liability until an
        approved recognition policy is posted. Unrecognised contract value is not a ledger balance.
      </p>
      <div className="grid gap-3 md:grid-cols-4">
        <Kpi
          to="/real-estate/$section"
          section="projects"
          search={search}
          label="Projects"
          value={String(metrics.projectCount)}
        />
        <Kpi
          to="/real-estate/$section"
          section="inventory"
          search={search}
          label="Available"
          value={String(metrics.availableCount)}
        />
        <Kpi
          to="/real-estate/$section"
          section="reservations"
          search={search}
          label="Reserved"
          value={String(metrics.reservedCount)}
        />
        <Kpi
          to="/real-estate/$section"
          section="sales"
          search={search}
          label="Booked"
          value={String(metrics.bookedCount)}
        />
        <Kpi
          to="/real-estate/$section"
          section="inventory"
          search={search}
          label="Sold units"
          value={String(metrics.soldCount)}
        />
        <Kpi
          to="/real-estate/$section"
          section="inventory"
          search={search}
          label="List-price inventory"
          value={money(metrics.inventoryListMinor, currency)}
        />
        <Kpi
          to="/real-estate/$section"
          section="sales"
          search={search}
          label="Contracted"
          value={money(metrics.contractedMinor, currency)}
        />
        <Kpi
          to="/real-estate/$section"
          section="collections"
          search={search}
          label="Collected, not revenue"
          value={money(metrics.collectedMinor, currency)}
        />
        <Kpi
          to="/real-estate/$section"
          section="collections"
          search={search}
          label="Recognised revenue"
          value={money(metrics.recognisedMinor, currency)}
        />
        <Kpi
          to="/real-estate/$section"
          section="sales"
          search={search}
          label="Contract not recognised"
          value={money(unrecognised, currency)}
        />
        <Kpi
          to="/real-estate/$section"
          section="instalments"
          search={search}
          label="Outstanding instalments"
          value={money(metrics.outstandingInstalmentMinor, currency)}
        />
        <Kpi
          to="/real-estate/$section"
          section="instalments"
          search={search}
          label="Overdue instalments"
          value={String(metrics.overdueCount)}
        />
        <Kpi
          to="/real-estate/$section"
          section="development-costs"
          search={search}
          label="Recorded costs"
          value={money(metrics.costRecordedMinor, currency)}
        />
        <Kpi
          to="/real-estate/$section"
          section="development-costs"
          search={search}
          label="Posted operating costs"
          value={money(metrics.costPostedMinor, currency)}
        />
        <Kpi
          to="/real-estate/$section"
          section="budgets"
          search={search}
          label="Approved budget"
          value={money(metrics.budgetApprovedMinor, currency)}
        />
        <Kpi
          to="/real-estate/$section"
          section="commissions"
          search={search}
          label="Open commissions"
          value={money(metrics.commissionOpenMinor, currency)}
        />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Inventory by status</CardTitle>
          <CardDescription>
            Counts from the property register. This chart does not post anything.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          {Object.keys(data.byStatus).length === 0 ? (
            <p className="text-sm">No properties yet.</p>
          ) : null}
          {Object.entries(data.byStatus).map(([status, count]) => (
            <div key={status} className="grid grid-cols-[9rem_1fr_3rem] items-center gap-2 text-sm">
              <span>{status.replaceAll("_", " ")}</span>
              <span className="h-2 rounded bg-muted">
                <span
                  className="block h-2 rounded bg-primary"
                  style={{ width: `${(count / max) * 100}%` }}
                />
              </span>
              <span className="text-right">{count}</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <AlertList alerts={data.alerts} search={search} />
    </div>
  );
}

function Projects({
  companyId,
  data,
  search,
}: {
  companyId: string;
  data: RealEstateWorkspace;
  search: RealEstateSearch;
}) {
  const { can } = useCan();
  const save = useServerFn(createRealEstateProject);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const refresh = useRefresh(companyId);
  const mutation = useMutation({
    mutationFn: () =>
      save({ data: { companyId, payload: { code, name, location, status: "active" } } }),
    onSuccess: async () => {
      toast.success("Project created");
      setCode("");
      setName("");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      {can("realestate.manage") ? (
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event) => submit(event, () => mutation.mutate())}
        >
          <Field label="Code">
            <Input value={code} onChange={(event) => setCode(event.target.value)} required />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Location">
            <Input value={location} onChange={(event) => setLocation(event.target.value)} />
          </Field>
          <Button type="submit" disabled={mutation.isPending}>
            Create project
          </Button>
        </form>
      ) : null}
      <RowTable
        rows={data.projects}
        columns={[
          {
            key: "code",
            label: "Code",
            render: (row) => (
              <Link
                to="/real-estate/$section"
                params={{ section: "inventory" }}
                search={{ ...search, project: cell(row, "id") }}
                className="underline"
              >
                {cell(row, "code")}
              </Link>
            ),
          },
          { key: "name", label: "Name", render: (row) => cell(row, "name") },
          { key: "status", label: "Status", render: (row) => cell(row, "status") },
          { key: "location", label: "Location", render: (row) => cell(row, "location") },
        ]}
      />
    </div>
  );
}

function Inventory({
  companyId,
  currency,
  data,
  search,
}: {
  companyId: string;
  currency: string;
  data: RealEstateWorkspace;
  search: RealEstateSearch;
}) {
  const { can } = useCan();
  const create = useServerFn(createRealEstateUnit);
  const importUnits = useServerFn(importRealEstateUnits);
  const transition = useServerFn(transitionRealEstateUnit);
  const refresh = useRefresh(companyId);
  const [projectId, setProjectId] = useState(search.project);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState("apartment");
  const [price, setPrice] = useState("");
  const [area, setArea] = useState("");
  const [csv, setCsv] = useState("");
  const [unitId, setUnitId] = useState(search.unit);
  const [nextStatus, setNextStatus] = useState("");
  const units = data.units.filter((unit) => !projectId || cell(unit, "project_id") === projectId);
  const selected = units.find((unit) => cell(unit, "id") === unitId) ?? units[0];
  const selectedStatus = selected ? cell(selected, "status") : "";
  const edges = isUnitStatus(selectedStatus) ? genericTransitions(selectedStatus) : [];
  const mutation = useMutation({
    mutationFn: async (action: "create" | "import" | "transition") => {
      if (action === "create") {
        return create({
          data: {
            companyId,
            payload: {
              project_id: projectId,
              unit_code: code,
              kind,
              status: "available",
              saleable_area: Number(area || 0),
              list_price_minor: Number(toMinorUnits(price || "0", currency)),
            },
          },
        });
      }
      if (action === "import") {
        const rows = parseUnitCsv(csv).map((row) => ({
          unit_code: row.unitCode,
          kind: row.kind,
          status: row.status,
          saleable_area: row.saleableArea,
          carpet_area: row.carpetArea,
          built_up_area: row.builtUpArea,
          land_area: row.landArea,
          list_price_minor: row.listPriceMinor,
        }));
        return importUnits({ data: { companyId, payload: { project_id: projectId, rows } } });
      }
      return transition({
        data: {
          companyId,
          payload: {
            unit_id: selected ? cell(selected, "id") : "",
            to_status: nextStatus,
            reason: "Inventory update",
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Inventory updated");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      {can("realestate.inventory.manage") ? (
        <form
          className="grid gap-3 md:grid-cols-4"
          onSubmit={(event) => submit(event, () => mutation.mutate("create"))}
        >
          <Field label="Project">
            <ProjectSelect projects={data.projects} value={projectId} onChange={setProjectId} />
          </Field>
          <Field label="Unit code">
            <Input value={code} onChange={(event) => setCode(event.target.value)} required />
          </Field>
          <Field label="Kind">
            <NativeSelect
              value={kind}
              onChange={setKind}
              options={[
                "apartment",
                "villa",
                "house",
                "office",
                "retail",
                "warehouse",
                "plot",
                "industrial",
                "parking",
                "other",
              ]}
            />
          </Field>
          <Field label={`List price (${currency})`}>
            <Input
              value={price}
              onChange={(event) => setPrice(event.target.value)}
              inputMode="decimal"
              required
            />
          </Field>
          <Field label="Saleable area">
            <Input
              value={area}
              onChange={(event) => setArea(event.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Button type="submit" disabled={mutation.isPending || !projectId}>
            Add property
          </Button>
        </form>
      ) : null}
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
        {units.map((unit) => (
          <button
            key={cell(unit, "id")}
            type="button"
            onClick={() => setUnitId(cell(unit, "id"))}
            className="rounded-md border p-2 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="block font-medium">{cell(unit, "unit_code")}</span>
            <span className="text-muted-foreground">
              {cell(unit, "status").replaceAll("_", " ")}
            </span>
          </button>
        ))}
      </div>
      {units.length === 0 ? (
        <EmptyState
          title="No properties"
          description="Add a unit or import a CSV. Sold status cannot be imported."
        />
      ) : null}
      {selected && can("realestate.inventory.manage") && edges.length > 0 ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => submit(event, () => mutation.mutate("transition"))}
        >
          <Field label={`Change ${cell(selected, "unit_code")}`}>
            <NativeSelect value={nextStatus} onChange={setNextStatus} options={edges} />
          </Field>
          <Button type="submit" disabled={mutation.isPending || !nextStatus}>
            Update status
          </Button>
        </form>
      ) : null}
      {can("realestate.inventory.manage") ? (
        <form
          className="grid gap-2"
          onSubmit={(event) => submit(event, () => mutation.mutate("import"))}
        >
          <Field label="CSV import">
            <textarea
              className="min-h-24 w-full rounded-md border border-input bg-background p-2 text-sm"
              value={csv}
              onChange={(event) => setCsv(event.target.value)}
              placeholder="unit_code,kind,saleable_area,list_price_minor"
            />
          </Field>
          <p className="text-sm text-muted-foreground">
            Save an Excel workbook as CSV. Up to 200 rows, and the whole import fails if any row is
            invalid.
          </p>
          <Button
            type="submit"
            variant="outline"
            disabled={mutation.isPending || !projectId || !csv.trim()}
          >
            Import CSV
          </Button>
        </form>
      ) : null}
      <RowTable
        rows={units}
        columns={[
          { key: "code", label: "Unit", render: (row) => cell(row, "unit_code") },
          { key: "kind", label: "Kind", render: (row) => cell(row, "kind") },
          { key: "status", label: "Status", render: (row) => cell(row, "status") },
          { key: "area", label: "Saleable", render: (row) => cell(row, "saleable_area") },
          {
            key: "price",
            label: "List price",
            render: (row) => money(minor(row, "list_price_minor"), currency),
          },
          {
            key: "rate",
            label: "Price / area",
            render: (row) =>
              row["price_per_area_minor"] == null
                ? ""
                : money(minor(row, "price_per_area_minor"), currency),
          },
        ]}
      />
    </div>
  );
}

function Reservations({ companyId, data }: { companyId: string; data: RealEstateWorkspace }) {
  const { can } = useCan();
  const place = useServerFn(placeRealEstateHold);
  const release = useServerFn(releaseRealEstateHold);
  const expire = useServerFn(expireRealEstateHolds);
  const refresh = useRefresh(companyId);
  const [unitId, setUnitId] = useState("");
  const [holder, setHolder] = useState("");
  const available = data.units.filter((unit) =>
    ["available", "on_hold", "resale"].includes(cell(unit, "status")),
  );
  const mutation = useMutation({
    mutationFn: async (
      action: { type: "place" } | { type: "release"; id: string } | { type: "expire" },
    ) => {
      if (action.type === "place") {
        return place({ data: { companyId, payload: { unit_id: unitId, holder_name: holder } } });
      }
      if (action.type === "release") {
        return release({
          data: { companyId, payload: { hold_id: action.id, reason: "Released" } },
        });
      }
      return expire({ data: { companyId } });
    },
    onSuccess: async () => {
      toast.success("Reservations updated");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        A reservation locks the property. It does not collect cash or recognise revenue.
      </p>
      {can("realestate.sales.manage") ? (
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event) => submit(event, () => mutation.mutate({ type: "place" }))}
        >
          <Field label="Property">
            <NativeSelect
              value={unitId}
              onChange={setUnitId}
              options={available.map((unit) => cell(unit, "id"))}
              labels={available.map((unit) => cell(unit, "unit_code"))}
            />
          </Field>
          <Field label="Holder">
            <Input value={holder} onChange={(event) => setHolder(event.target.value)} required />
          </Field>
          <Button type="submit" disabled={mutation.isPending || !unitId}>
            Reserve
          </Button>
        </form>
      ) : null}
      {can("realestate.sales.manage") ? (
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ type: "expire" })}
        >
          Release expired reservations
        </Button>
      ) : null}
      <RowTable
        rows={data.holds}
        columns={[
          { key: "holder", label: "Holder", render: (row) => cell(row, "holder_name") },
          { key: "unit", label: "Property", render: (row) => unitCode(data, cell(row, "unit_id")) },
          { key: "expires", label: "Expires", render: (row) => cell(row, "expires_at") },
          {
            key: "release",
            label: "Release",
            render: (row) =>
              can("realestate.sales.manage") ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ type: "release", id: cell(row, "id") })}
                >
                  Release
                </Button>
              ) : null,
          },
        ]}
      />
    </div>
  );
}

function Sales({
  companyId,
  currency,
  data,
}: {
  companyId: string;
  currency: string;
  data: RealEstateWorkspace;
}) {
  const { can } = useCan();
  const confirm = useServerFn(confirmRealEstateBooking);
  const advance = useServerFn(advanceRealEstateSale);
  const cancel = useServerFn(cancelRealEstateSale);
  const refresh = useRefresh(companyId);
  const [holdId, setHoldId] = useState("");
  const [contactId, setContactId] = useState("");
  const [contract, setContract] = useState("");
  const fetchContacts = useServerFn(listContacts);
  const contacts = useQuery({
    queryKey: ["real-estate-purchasers", companyId],
    queryFn: () => fetchContacts({ data: { companyId, kind: "customers", limit: 200 } }),
    enabled: can("realestate.sales.manage"),
    retry: false,
  });
  const purchasers = useMemo(() => {
    const rows = Array.isArray(contacts.data) ? contacts.data : [];
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const record = row as {
        id?: unknown;
        name?: unknown;
        is_active?: unknown;
        company_id?: unknown;
      };
      if (typeof record.id !== "string" || typeof record.name !== "string") return [];
      return [
        {
          id: record.id,
          name: record.name,
          is_active: record.is_active !== false,
          company_id: typeof record.company_id === "string" ? record.company_id : companyId,
        },
      ];
    });
  }, [companyId, contacts.data]);
  const mutation = useMutation({
    mutationFn: async (
      action:
        | { type: "confirm" }
        | { type: "advance"; id: string; status: string }
        | { type: "cancel"; id: string },
    ) => {
      if (action.type === "confirm") {
        return confirm({
          data: {
            companyId,
            payload: {
              hold_id: holdId,
              contact_id: contactId,
              contract_minor: contract ? Number(toMinorUnits(contract, currency)) : undefined,
            },
          },
        });
      }
      if (action.type === "advance") {
        return advance({
          data: { companyId, payload: { sale_id: action.id, status: action.status } },
        });
      }
      return cancel({
        data: {
          companyId,
          payload: {
            sale_id: action.id,
            disposition: "available",
            reason: "Cancelled from the sales register",
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Sale updated");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Confirming a booking creates a contract. It does not post revenue.
      </p>
      {can("realestate.sales.manage") ? (
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event) => submit(event, () => mutation.mutate({ type: "confirm" }))}
        >
          <Field label="Reservation">
            <NativeSelect
              value={holdId}
              onChange={setHoldId}
              options={data.holds.map((hold) => cell(hold, "id"))}
              labels={data.holds.map(
                (hold) => `${cell(hold, "holder_name")} · ${unitCode(data, cell(hold, "unit_id"))}`,
              )}
            />
          </Field>
          <Field label="Purchaser">
            {contacts.isError ? (
              <QueryErrorState queries={[contacts]} title="Could not load contacts" />
            ) : (
              <ContactLookup
                ariaLabel="Purchaser"
                companyId={companyId}
                contacts={purchasers}
                disabled={contacts.isPending}
                placeholder="Select a contact"
                value={contactId}
                onChange={setContactId}
              />
            )}
          </Field>
          <Field label={`Contract (${currency}, blank uses list price)`}>
            <Input
              value={contract}
              onChange={(event) => setContract(event.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Button type="submit" disabled={mutation.isPending || !holdId || !contactId}>
            Confirm booking
          </Button>
        </form>
      ) : null}
      <RowTable
        rows={data.sales}
        columns={[
          { key: "number", label: "Sale", render: (row) => cell(row, "sale_number") },
          { key: "unit", label: "Property", render: (row) => unitCode(data, cell(row, "unit_id")) },
          { key: "status", label: "Status", render: (row) => cell(row, "status") },
          {
            key: "contract",
            label: "Contract",
            render: (row) => money(minor(row, "contract_minor"), currency),
          },
          {
            key: "collected",
            label: "Collected",
            render: (row) => money(minor(row, "collected_minor"), currency),
          },
          {
            key: "recognised",
            label: "Recognised",
            render: (row) => money(minor(row, "recognised_minor"), currency),
          },
          {
            key: "next",
            label: "Next",
            render: (row) =>
              can("realestate.sales.manage") ? (
                <span className="flex gap-2">
                  {cell(row, "status") === "booked" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({
                          type: "advance",
                          id: cell(row, "id"),
                          status: "under_agreement",
                        })
                      }
                    >
                      Agreement
                    </Button>
                  ) : null}
                  {cell(row, "status") === "under_agreement" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() =>
                        mutation.mutate({ type: "advance", id: cell(row, "id"), status: "sold" })
                      }
                    >
                      Mark sold
                    </Button>
                  ) : null}
                  {cell(row, "status") !== "cancelled" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={mutation.isPending}
                      onClick={() => mutation.mutate({ type: "cancel", id: cell(row, "id") })}
                    >
                      Cancel
                    </Button>
                  ) : null}
                </span>
              ) : null,
          },
        ]}
      />
    </div>
  );
}

function Plans({
  companyId,
  currency,
  data,
}: {
  companyId: string;
  currency: string;
  data: RealEstateWorkspace;
}) {
  const { can } = useCan();
  const save = useServerFn(saveRealEstatePlan);
  const refresh = useRefresh(companyId);
  const [saleId, setSaleId] = useState("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [deposit, setDeposit] = useState("0");
  const [count, setCount] = useState("12");
  const [frequency, setFrequency] = useState<"monthly" | "quarterly" | "annual">("monthly");
  const sale = data.sales.find((row) => cell(row, "id") === saleId);
  const preview = useMemo(() => {
    if (!sale) return [];
    try {
      return buildInstalmentSchedule({
        contractMinor: minor(sale, "contract_minor"),
        startOn: start,
        depositMinor: Number(toMinorUnits(deposit || "0", currency)),
        instalmentCount: Number(count),
        frequency,
      });
    } catch {
      return [];
    }
  }, [sale, start, deposit, count, frequency, currency]);
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          payload: {
            sale_id: saleId,
            lines: preview.map((line) => ({
              kind: line.kind,
              label: line.label,
              due_on: line.dueOn,
              amount_minor: line.amountMinor,
            })),
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Payment plan saved. Nothing was posted to the ledger.");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        These dates and amounts are a collection schedule. They are not invoices and not recognised
        revenue.
      </p>
      {can("realestate.sales.manage") ? (
        <form
          className="grid gap-3 md:grid-cols-4"
          onSubmit={(event) => submit(event, () => mutation.mutate())}
        >
          <Field label="Sale">
            <SaleSelect sales={data.sales} value={saleId} onChange={setSaleId} />
          </Field>
          <Field label="Start">
            <Input
              type="date"
              value={start}
              onChange={(event) => setStart(event.target.value)}
              required
            />
          </Field>
          <Field label="Deposit">
            <Input
              value={deposit}
              onChange={(event) => setDeposit(event.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Field label="Regular count">
            <Input
              value={count}
              onChange={(event) => setCount(event.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field label="Frequency">
            <NativeSelect
              value={frequency}
              onChange={(value) => setFrequency(value as typeof frequency)}
              options={["monthly", "quarterly", "annual"]}
            />
          </Field>
          <Button type="submit" disabled={mutation.isPending || preview.length === 0}>
            Save schedule
          </Button>
        </form>
      ) : null}
      <RowTable
        rows={preview.map((line) => ({ ...line }))}
        columns={[
          { key: "label", label: "Line", render: (row) => cell(row, "label") },
          { key: "due", label: "Due", render: (row) => cell(row, "dueOn") },
          {
            key: "amount",
            label: "Amount",
            render: (row) => money(minor(row, "amountMinor"), currency),
          },
        ]}
      />
    </div>
  );
}

function Instalments({ currency, data }: { currency: string; data: RealEstateWorkspace }) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        A suggested late fee uses the settings percentage after the grace period. It is not invoiced
        or posted.
      </p>
      <RowTable
        rows={data.instalments}
        columns={[
          { key: "sale", label: "Sale", render: (row) => saleNumber(data, cell(row, "sale_id")) },
          { key: "label", label: "Line", render: (row) => cell(row, "label") },
          { key: "due", label: "Due", render: (row) => cell(row, "due_on") },
          {
            key: "amount",
            label: "Amount",
            render: (row) => money(minor(row, "amount_minor"), currency),
          },
          {
            key: "open",
            label: "Outstanding",
            render: (row) =>
              money(minor(row, "amount_minor") - minor(row, "allocated_minor"), currency),
          },
          {
            key: "fee",
            label: "Suggested late fee",
            render: (row) => {
              const outstanding = minor(row, "amount_minor") - minor(row, "allocated_minor");
              const due = cell(row, "due_on");
              const days =
                due && due < today
                  ? Math.floor((Date.parse(today) - Date.parse(due)) / 86400000)
                  : 0;
              return money(
                suggestedLateFeeMinor(
                  outstanding,
                  days,
                  data.settings.graceDays,
                  data.settings.lateFeeBps,
                ),
                currency,
              );
            },
          },
        ]}
      />
    </div>
  );
}

function Collections({
  companyId,
  currency,
  data,
}: {
  companyId: string;
  currency: string;
  data: RealEstateWorkspace;
}) {
  const { can } = useCan();
  const collect = useServerFn(collectRealEstate);
  const refund = useServerFn(refundRealEstate);
  const recognise = useServerFn(recogniseRealEstate);
  const reverse = useServerFn(reverseRealEstateRecognition);
  const refresh = useRefresh(companyId);
  const [saleId, setSaleId] = useState("");
  const [amount, setAmount] = useState("");
  const [receivedOn, setReceivedOn] = useState(new Date().toISOString().slice(0, 10));
  const [requested, setRequested] = useState("");
  const [progress, setProgress] = useState("100");
  const [estimated, setEstimated] = useState("0");
  const [reference, setReference] = useState("");
  const [evidence, setEvidence] = useState("");
  const [control, setControl] = useState(false);
  const [criteria, setCriteria] = useState(false);
  const policy = data.settings.recognitionPolicy;
  const decision = assessRecognition({
    policy: policy as "unset" | "point_in_time" | "over_time",
    trigger: "manual",
    controlTransferred: control,
    overTimeCriteriaMet: criteria,
    approved: true,
    calculationRef: reference,
    evidenceNote: evidence,
  });
  const canPost = can("realestate.collections.manage") && can("realestate.post");
  const canRecognise = can("realestate.post") && can("realestate.approve");
  const mutation = useMutation({
    mutationFn: async (action: "collect" | "refund" | "recognise" | "reverse") => {
      const idempotency_key = crypto.randomUUID();
      if (action === "reverse") {
        return reverse({
          data: {
            companyId,
            payload: {
              sale_id: saleId,
              journal_date: receivedOn,
              fx_rate_to_base: 1,
              idempotency_key,
            },
          },
        });
      }
      if (action === "collect" || action === "refund") {
        const payload = {
          sale_id: saleId,
          amount_minor: Number(toMinorUnits(amount, currency)),
          received_on: receivedOn,
          refunded_on: receivedOn,
          fx_rate_to_base: 1,
          idempotency_key,
        };
        return action === "collect"
          ? collect({ data: { companyId, payload } })
          : refund({ data: { companyId, payload } });
      }
      return recognise({
        data: {
          companyId,
          payload: {
            sale_id: saleId,
            policy,
            trigger: "manual",
            approved: true,
            control_transferred: control,
            over_time_criteria_met: criteria,
            requested_minor: requested ? Number(toMinorUnits(requested, currency)) : undefined,
            progress_bps: Number(progress) * 100,
            estimated_cost_minor: Number(toMinorUnits(estimated || "0", currency)),
            calculation_ref: reference,
            evidence_note: evidence,
            journal_date: receivedOn,
            fx_rate_to_base: 1,
            idempotency_key,
          },
        },
      });
    },
    onSuccess: async (result) => {
      toast.success(result.replayed ? "This posting was already recorded" : "Ledger updated");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const recognised = minor(
    data.sales.find((row) => cell(row, "id") === saleId) ?? {},
    "recognised_minor",
  );
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        A collection debits bank and credits contract liability. Revenue is posted only from the
        recognition form, and only when the policy and evidence allow it.
      </p>
      {canPost ? (
        <form
          className="grid gap-3 md:grid-cols-4"
          onSubmit={(event) => submit(event, () => mutation.mutate("collect"))}
        >
          <Field label="Sale">
            <SaleSelect sales={data.sales} value={saleId} onChange={setSaleId} />
          </Field>
          <Field label={`Amount (${currency})`}>
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              required
            />
          </Field>
          <Field label="Date">
            <Input
              type="date"
              value={receivedOn}
              onChange={(event) => setReceivedOn(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={mutation.isPending || !saleId}>
            Collect as liability
          </Button>
          {can("realestate.reverse") ? (
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending || !saleId || !amount}
              onClick={() => mutation.mutate("refund")}
            >
              Refund liability
            </Button>
          ) : null}
          {can("realestate.reverse") && can("realestate.post") ? (
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending || !saleId || recognised <= 0}
              onClick={() => mutation.mutate("reverse")}
            >
              Reverse recognition
            </Button>
          ) : null}
        </form>
      ) : (
        <p className="text-sm">
          Collection posting needs realestate.collections.manage and realestate.post.
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Revenue recognition</CardTitle>
          <CardDescription>{decision.reason}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {policy === "unset" ? (
            <Button asChild>
              <Link
                to="/real-estate/$section"
                params={{ section: "settings" }}
                search={{ project: "", unit: "", sale: "" }}
              >
                Set a recognition policy
              </Link>
            </Button>
          ) : canRecognise ? (
            <form
              className="grid gap-3 md:grid-cols-2"
              onSubmit={(event) => submit(event, () => mutation.mutate("recognise"))}
            >
              <Field label="Calculation reference">
                <Input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  required
                />
              </Field>
              <Field label="Evidence">
                <Input
                  value={evidence}
                  onChange={(event) => setEvidence(event.target.value)}
                  required
                />
              </Field>
              {policy === "point_in_time" ? (
                <Field label="Amount to recognise">
                  <Input
                    value={requested}
                    onChange={(event) => setRequested(event.target.value)}
                    inputMode="decimal"
                  />
                </Field>
              ) : (
                <>
                  <Field label="Progress percent">
                    <Input
                      value={progress}
                      onChange={(event) => setProgress(event.target.value)}
                      inputMode="decimal"
                    />
                  </Field>
                  <Field label="Estimated total cost">
                    <Input
                      value={estimated}
                      onChange={(event) => setEstimated(event.target.value)}
                      inputMode="decimal"
                    />
                  </Field>
                </>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={control}
                  onChange={(event) => setControl(event.target.checked)}
                />
                Control has transferred
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={criteria}
                  onChange={(event) => setCriteria(event.target.checked)}
                />
                Over-time criteria are met
              </label>
              <Button
                type="submit"
                disabled={
                  mutation.isPending ||
                  !decision.allowed ||
                  !saleId ||
                  (policy === "point_in_time" && !requested)
                }
              >
                Post recognition
              </Button>
            </form>
          ) : (
            <p className="text-sm">Recognition needs realestate.post and realestate.approve.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Commissions({
  companyId,
  currency,
  data,
}: {
  companyId: string;
  currency: string;
  data: RealEstateWorkspace;
}) {
  const { can } = useCan();
  const create = useServerFn(createRealEstateBroker);
  const saveRule = useServerFn(saveRealEstateCommissionRule);
  const suggest = useServerFn(suggestRealEstateCommission);
  const approve = useServerFn(approveRealEstateCommission);
  const post = useServerFn(postRealEstateCommission);
  const refresh = useRefresh(companyId);
  const [name, setName] = useState("");
  const [brokerId, setBrokerId] = useState("");
  const [saleId, setSaleId] = useState("");
  const [rate, setRate] = useState("2");
  const mutation = useMutation({
    mutationFn: async (
      action:
        | { type: "broker" }
        | { type: "rule" }
        | { type: "suggest" }
        | { type: "approve"; id: string }
        | { type: "post"; id: string },
    ) => {
      if (action.type === "broker")
        return create({ data: { companyId, payload: { name, kind: "broker" } } });
      if (action.type === "rule") {
        return saveRule({
          data: {
            companyId,
            payload: {
              broker_id: brokerId,
              name: `${name || "Rule"} rate`,
              basis: "contract",
              rate_bps: Math.round(Number(rate) * 100),
            },
          },
        });
      }
      if (action.type === "suggest")
        return suggest({ data: { companyId, payload: { broker_id: brokerId, sale_id: saleId } } });
      if (action.type === "approve")
        return approve({ data: { companyId, payload: { accrual_id: action.id } } });
      return post({
        data: {
          companyId,
          payload: {
            accrual_id: action.id,
            idempotency_key: crypto.randomUUID(),
            fx_rate_to_base: 1,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Commission records updated");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        A suggestion is not an expense. Posting debits commission expense and credits the payable
        after approval.
      </p>
      {can("realestate.commissions.manage") ? (
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="Broker name">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Button
            type="button"
            disabled={mutation.isPending || !name.trim()}
            onClick={() => mutation.mutate({ type: "broker" })}
          >
            Add broker
          </Button>
          <Field label="Broker">
            <NativeSelect
              value={brokerId}
              onChange={setBrokerId}
              options={data.brokers.map((row) => cell(row, "id"))}
              labels={data.brokers.map((row) => cell(row, "name"))}
            />
          </Field>
          <Field label="Rate percent">
            <Input
              value={rate}
              onChange={(event) => setRate(event.target.value)}
              inputMode="decimal"
            />
          </Field>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending || !brokerId}
            onClick={() => mutation.mutate({ type: "rule" })}
          >
            Save percentage rule
          </Button>
          <Field label="Sale">
            <SaleSelect sales={data.sales} value={saleId} onChange={setSaleId} />
          </Field>
          <Button
            type="button"
            disabled={mutation.isPending || !brokerId || !saleId}
            onClick={() => mutation.mutate({ type: "suggest" })}
          >
            Suggest commission
          </Button>
        </div>
      ) : null}
      <RowTable
        rows={data.accruals}
        columns={[
          { key: "sale", label: "Sale", render: (row) => saleNumber(data, cell(row, "sale_id")) },
          { key: "status", label: "Status", render: (row) => cell(row, "status") },
          {
            key: "net",
            label: "Net payable",
            render: (row) => money(minor(row, "net_minor"), currency),
          },
          {
            key: "tax",
            label: "Withholding",
            render: (row) => money(minor(row, "withholding_minor"), currency),
          },
          {
            key: "action",
            label: "Action",
            render: (row) => (
              <span className="flex gap-2">
                {cell(row, "status") === "suggested" && can("realestate.approve") ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ type: "approve", id: cell(row, "id") })}
                  >
                    Approve
                  </Button>
                ) : null}
                {cell(row, "status") === "approved" && can("realestate.post") ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={mutation.isPending}
                    onClick={() => mutation.mutate({ type: "post", id: cell(row, "id") })}
                  >
                    Post
                  </Button>
                ) : null}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}

function Costs({
  companyId,
  currency,
  data,
}: {
  companyId: string;
  currency: string;
  data: RealEstateWorkspace;
}) {
  const { can } = useCan();
  const save = useServerFn(recordRealEstateCost);
  const refresh = useRefresh(companyId);
  const [projectId, setProjectId] = useState("");
  const [category, setCategory] = useState("Construction");
  const [classification, setClassification] = useState("wip");
  const [amount, setAmount] = useState("");
  const [incurredOn, setIncurredOn] = useState(new Date().toISOString().slice(0, 10));
  const mutation = useMutation({
    mutationFn: (post: boolean) =>
      save({
        data: {
          companyId,
          payload: {
            project_id: projectId,
            category,
            classification,
            amount_minor: Number(toMinorUnits(amount, currency)),
            incurred_on: incurredOn,
            post,
            idempotency_key: crypto.randomUUID(),
            fx_rate_to_base: 1,
          },
        },
      }),
    onSuccess: async (result) => {
      toast.success(
        result.status === "posted" ? "Operating cost posted" : "Cost recorded without a journal",
      );
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">
        Only an operating expense can be posted here. Capitalisable, WIP and inventory costs stay
        unposted.
      </p>
      {can("realestate.costs.manage") ? (
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event) => submit(event, () => mutation.mutate(false))}
        >
          <Field label="Project">
            <ProjectSelect projects={data.projects} value={projectId} onChange={setProjectId} />
          </Field>
          <Field label="Category">
            <Input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              required
            />
          </Field>
          <Field label="Classification">
            <NativeSelect
              value={classification}
              onChange={setClassification}
              options={[
                "capitalisable",
                "wip",
                "inventory",
                "fixed_asset",
                "investment_property",
                "operating_expense",
                "prepayment",
                "accrual",
              ]}
            />
          </Field>
          <Field label="Amount">
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              required
            />
          </Field>
          <Field label="Date">
            <Input
              type="date"
              value={incurredOn}
              onChange={(event) => setIncurredOn(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={mutation.isPending || !projectId}>
            Record without posting
          </Button>
          {classification === "operating_expense" && can("realestate.post") ? (
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending || !projectId}
              onClick={() => mutation.mutate(true)}
            >
              Post operating expense
            </Button>
          ) : null}
        </form>
      ) : null}
      <RowTable
        rows={data.costs}
        columns={[
          { key: "category", label: "Category", render: (row) => cell(row, "category") },
          { key: "class", label: "Classification", render: (row) => cell(row, "classification") },
          {
            key: "amount",
            label: "Amount",
            render: (row) => money(minor(row, "amount_minor"), currency),
          },
          {
            key: "posted",
            label: "Ledger",
            render: (row) => (row["posted"] === true ? "Posted" : "Not posted"),
          },
        ]}
      />
    </div>
  );
}

function Budgets({
  companyId,
  currency,
  data,
}: {
  companyId: string;
  currency: string;
  data: RealEstateWorkspace;
}) {
  const { can } = useCan();
  const save = useServerFn(saveRealEstateBudget);
  const approve = useServerFn(approveRealEstateBudget);
  const refresh = useRefresh(companyId);
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState("Original budget");
  const [amount, setAmount] = useState("");
  const mutation = useMutation({
    mutationFn: async (input: { action: "save" } | { action: "approve"; id: string }) => {
      if (input.action === "save") {
        return save({
          data: {
            companyId,
            payload: {
              project_id: projectId,
              name,
              lines: [
                { category: "Development", amount_minor: Number(toMinorUnits(amount, currency)) },
              ],
            },
          },
        });
      }
      return approve({ data: { companyId, payload: { budget_id: input.id } } });
    },
    onSuccess: async () => {
      toast.success("Budget updated");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      {can("realestate.budgets.manage") ? (
        <form
          className="grid gap-3 md:grid-cols-3"
          onSubmit={(event) => submit(event, () => mutation.mutate({ action: "save" }))}
        >
          <Field label="Project">
            <ProjectSelect projects={data.projects} value={projectId} onChange={setProjectId} />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label="Development amount">
            <Input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
              required
            />
          </Field>
          <Button type="submit" disabled={mutation.isPending || !projectId}>
            Save draft budget
          </Button>
        </form>
      ) : null}
      <RowTable
        rows={data.budgets}
        columns={[
          { key: "name", label: "Budget", render: (row) => cell(row, "name") },
          { key: "status", label: "Status", render: (row) => cell(row, "status") },
          {
            key: "amount",
            label: "Amount",
            render: (row) => money(minor(row, "amount_minor"), currency),
          },
          {
            key: "approve",
            label: "Approval",
            render: (row) =>
              cell(row, "status") === "draft" && can("realestate.approve") ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ action: "approve", id: cell(row, "id") })}
                >
                  Approve
                </Button>
              ) : null,
          },
        ]}
      />
    </div>
  );
}

function LedgerTie({ companyId, currency }: { companyId: string; currency: string }) {
  const fetchTie = useServerFn(getRealEstateLedgerTie);
  const tie = useQuery({
    queryKey: ["real-estate-ledger-tie", companyId],
    queryFn: () => fetchTie({ data: { companyId } }),
    retry: false,
  });
  if (tie.isError) return <QueryErrorState queries={[tie]} title="Could not tie the ledger" />;
  if (tie.isPending || !tie.data) return <LoadingState />;
  const labels: { [source: string]: string } = {
    customer_collections: "Customer collections",
    customer_refunds: "Customer refunds",
    revenue_and_cost_of_sales: "Revenue and cost of sales",
    commissions: "Posted commissions",
    operating_costs: "Posted operating costs",
    journal_balance: "Real estate journals (debits versus credits)",
  };
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        {tie.data.tied
          ? "These registers match the posted journals. Unposted schedules, suggested commissions and unposted development costs are excluded."
          : "A difference means the register and the posted journals do not match. Do not treat the register as the ledger until the difference is zero."}
      </p>
      <RowTable
        rows={tie.data.lines.map((line) => ({
          id: line.source,
          source: labels[line.source] ?? line.source,
          ledger: line.ledgerMinor,
          operational: line.operationalMinor,
          difference: line.differenceMinor,
        }))}
        columns={[
          { key: "source", label: "Source", render: (row) => cell(row, "source") },
          {
            key: "ledger",
            label: "Ledger",
            render: (row) => money(minor(row, "ledger"), currency),
          },
          {
            key: "operational",
            label: "Register",
            render: (row) => money(minor(row, "operational"), currency),
          },
          {
            key: "difference",
            label: "Difference",
            render: (row) => money(minor(row, "difference"), currency),
          },
        ]}
      />
    </div>
  );
}

function Settings({ companyId, data }: { companyId: string; data: RealEstateWorkspace }) {
  const { can } = useCan();
  const fetchAccounts = useServerFn(listAccounts);
  const save = useServerFn(saveRealEstateSettings);
  const refresh = useRefresh(companyId);
  const accounts = useQuery({
    queryKey: ["real-estate-accounts", companyId],
    queryFn: () => fetchAccounts({ data: { companyId } }),
    retry: false,
  });
  const [enabled, setEnabled] = useState(data.settings.enabled);
  const [policy, setPolicy] = useState(data.settings.recognitionPolicy);
  const [areaUnit, setAreaUnit] = useState(data.settings.areaUnit);
  const [segregation, setSegregation] = useState(data.settings.enforceSegregation);
  const [holdDays, setHoldDays] = useState(String(data.settings.reservationHoldDays));
  const [graceDays, setGraceDays] = useState(String(data.settings.graceDays));
  const [lateFee, setLateFee] = useState(String(data.settings.lateFeeBps / 100));
  const [map, setMap] = useState<Record<string, string>>(data.settings.accountMap);
  const postable = useMemo(
    () => (accounts.data ?? []).filter((account) => account.is_active && account.is_postable),
    [accounts.data],
  );
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          payload: {
            enabled,
            recognition_policy: policy,
            area_unit: areaUnit,
            enforce_segregation: segregation,
            reservation_hold_days: Number(holdDays),
            grace_days: Number(graceDays),
            late_fee_bps: Math.round(Number(lateFee || 0) * 100),
            country_code: data.settings.countryCode || "US",
            account_map: map,
          },
        },
      }),
    onSuccess: async () => {
      toast.success(
        enabled ? "Real Estate Management activated" : "Real Estate Management left inactive",
      );
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  if (!can("realestate.admin")) {
    return (
      <EmptyState
        title="Settings are restricted"
        description="realestate.admin is required to activate the module or map ledger accounts."
      />
    );
  }
  if (accounts.isPending) return <LoadingState />;
  if (accounts.isError) return <QueryErrorState queries={[accounts]} />;
  return (
    <form className="grid gap-4" onSubmit={(event) => submit(event, () => mutation.mutate())}>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Activate Real Estate Management
      </label>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Recognition policy">
          <NativeSelect
            value={policy}
            onChange={setPolicy}
            options={["unset", "point_in_time", "over_time"]}
          />
        </Field>
        <Field label="Area unit">
          <NativeSelect
            value={areaUnit}
            onChange={setAreaUnit}
            options={["sqm", "sqft", "acre", "hectare"]}
          />
        </Field>
        <Field label="Reservation days">
          <Input
            value={holdDays}
            onChange={(event) => setHoldDays(event.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Grace days">
          <Input
            value={graceDays}
            onChange={(event) => setGraceDays(event.target.value)}
            inputMode="numeric"
          />
        </Field>
        <Field label="Suggested late fee percent">
          <Input
            value={lateFee}
            onChange={(event) => setLateFee(event.target.value)}
            inputMode="decimal"
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={segregation}
          onChange={(event) => setSegregation(event.target.checked)}
        />
        The preparer cannot approve their own commission, budget or revenue recognition
      </label>
      <p className="text-sm text-muted-foreground">
        Unset means no revenue can be posted. Mapping an account does not post a journal by itself.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {ACCOUNT_ROLES.map(([role, label]) => (
          <Field key={role} label={label}>
            <AccountLookup
              accounts={postable}
              value={map[role] ?? ""}
              onChange={(accountId) =>
                setMap((current) => ({ ...current, [role]: accountId ?? "" }))
              }
              companyId={companyId}
              purpose="posting"
              placeholder="Not mapped"
              allowClear
              ariaLabel={label}
            />
          </Field>
        ))}
      </div>
      <Button type="submit" disabled={mutation.isPending}>
        Save settings
      </Button>
    </form>
  );
}

function OverviewLink({
  section,
  search,
  label,
  value,
}: {
  section: string;
  search: RealEstateSearch;
  label: string;
  value: string;
}) {
  return (
    <Link
      to="/real-estate/$section"
      params={{ section }}
      search={search}
      className="rounded-md border p-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="text-lg font-semibold">{value}</span>
    </Link>
  );
}

function Kpi(props: {
  to: string;
  section: string;
  search: RealEstateSearch;
  label: string;
  value: string;
}) {
  return (
    <OverviewLink
      section={props.section}
      search={props.search}
      label={props.label}
      value={props.value}
    />
  );
}

function AlertList({ alerts, search }: { alerts: JsonRow[]; search: RealEstateSearch }) {
  if (alerts.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Exceptions</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {alerts.map((alert) => (
          <Link
            key={cell(alert, "id") + cell(alert, "title")}
            to="/real-estate/$section"
            params={{ section: cell(alert, "href").split("/").pop() || "overview" }}
            search={search}
            className="text-sm underline"
          >
            {cell(alert, "title")}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function ProjectSelect({
  projects,
  value,
  onChange,
}: {
  projects: JsonRow[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <NativeSelect
      value={value}
      onChange={onChange}
      options={projects.map((project) => cell(project, "id"))}
      labels={projects.map((project) => `${cell(project, "code")} · ${cell(project, "name")}`)}
    />
  );
}

function SaleSelect({
  sales,
  value,
  onChange,
}: {
  sales: JsonRow[];
  value: string;
  onChange: (value: string) => void;
}) {
  const open = sales.filter((sale) => cell(sale, "status") !== "cancelled");
  return (
    <NativeSelect
      value={value}
      onChange={onChange}
      options={open.map((sale) => cell(sale, "id"))}
      labels={open.map((sale) => cell(sale, "sale_number"))}
    />
  );
}

function NativeSelect({
  value,
  onChange,
  options,
  labels,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly string[];
  labels?: string[];
}) {
  return (
    <LookupSelect
      ariaLabel="Choose"
      options={options.map((option, index) => ({
        id: option,
        label: labels?.[index] ?? option.replaceAll("_", " "),
      }))}
      placeholder="Select"
      value={value}
      onChange={onChange}
    />
  );
}

function RowTable({
  rows,
  columns,
}: {
  rows: readonly JsonRow[];
  columns: { key: string; label: string; render: (row: JsonRow) => ReactNode }[];
}) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="Nothing here yet"
        description="Records you create in this section will appear in this list."
      />
    );
  }
  return (
    <div className="max-h-[32rem] overflow-auto rounded-md border">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 bg-background">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="px-2 py-2 font-medium">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={cell(row, "id") || String(index)} className="border-t">
              {columns.map((column) => (
                <td key={column.key} className="px-2 py-2 align-top">
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function money(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "";
  return `${fromMinorUnits(Math.trunc(amount), currency)} ${currency}`;
}

function unitCode(data: RealEstateWorkspace, id: string): string {
  return (
    cell(data.units.find((unit) => cell(unit, "id") === id) ?? {}, "unit_code") || id.slice(0, 8)
  );
}

function saleNumber(data: RealEstateWorkspace, id: string): string {
  return (
    cell(data.sales.find((sale) => cell(sale, "id") === id) ?? {}, "sale_number") || id.slice(0, 8)
  );
}

function useRefresh(companyId: string) {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: ["real-estate-workspace", companyId] });
}

function submit(event: FormEvent, action: () => void) {
  event.preventDefault();
  action();
}

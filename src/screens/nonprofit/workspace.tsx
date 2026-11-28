import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { NonprofitSubnav } from "@/components/nonprofit/NonprofitSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { AccountLookup } from "@/components/lookup/variants";
import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { fromMinorUnits, toMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  allocateNonprofitExpense,
  createNonprofitDonor,
  createNonprofitFund,
  createNonprofitGrant,
  createNonprofitPledge,
  createNonprofitRecord,
  decideNonprofitDisbursement,
  deliverNonprofitDonorStatement,
  getNonprofitDonorStatement,
  getNonprofitPortal,
  getNonprofitStatement,
  getNonprofitWorkspace,
  getMyNonprofitDonorStatement,
  grantNonprofitPortal,
  impairNonprofitPledge,
  postNonprofitExpense,
  postNonprofitMovement,
  receiveNonprofitGrant,
  recogniseNonprofitGrant,
  recordNonprofitDonorStatement,
  recordNonprofitDonorStatements,
  releaseNonprofitRestriction,
  requestNonprofitDisbursement,
  satisfyNonprofitGrant,
  saveNonprofitSettings,
  submitNonprofitDonation,
  transferNonprofitFunds,
} from "@/lib/nonprofit/nonprofit.functions";
import {
  CollectionBatchForm,
  CongregationPanel,
  OrganisationKindForm,
  RecurringGiftForm,
} from "@/screens/nonprofit/congregation";
import { isNpSectionKey, npSection, type NpSectionKey } from "@/lib/nonprofit/sections";
import { donationAllocations } from "@/lib/nonprofit/donation-entry";
import {
  donorStatementCsv,
  donorStatementExcel,
  donorStatementPdf,
  statementPeriod,
  type StatementPreset,
} from "@/lib/nonprofit/donor-statement";
import { explainFundUtilisation } from "@/lib/nonprofit/insights";
import { organisationTerms } from "@/lib/nonprofit/terminology";
import type {
  DonorStatement,
  NonprofitRecord,
  NonprofitSettings,
  NonprofitWorkspace,
} from "@/lib/nonprofit/types";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

type Row = NonprofitRecord;

function rows(value: Row[] | null | undefined): Row[] {
  return value ?? [];
}

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function minor(value: string, currency: string): number {
  return Number(toMinorUnits(value, currency));
}

export function NonprofitPage({ sectionKey }: { sectionKey: NpSectionKey }) {
  const section = npSection(sectionKey);
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const allowed = section.anyOf.some((permission) => can(permission as Permission));
  const fetchWorkspace = useServerFn(getNonprofitWorkspace);
  const workspace = useQuery({
    queryKey: ["nonprofit-workspace", company?.id],
    queryFn: () => fetchWorkspace({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && allowed,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return (
      <CompanyEmptyState title="No organisation" description="Select an organisation first." />
    );
  }
  if (!allowed) {
    return (
      <ListWorkspace title={section.label} description="Nonprofit fund accounting.">
        <EmptyState
          title="No Nonprofit access"
          description="Ask an administrator for nonprofit.view or the permission named on this section."
        />
      </ListWorkspace>
    );
  }

  const failed = <QueryErrorState queries={[workspace]} />;
  if (workspace.isError) {
    return (
      <ListWorkspace
        title={section.label}
        description="Nonprofit fund accounting."
        breadcrumbs={[{ label: "Nonprofit", to: "/nonprofit" }, { label: section.label }]}
        subnav={<NonprofitSubnav current={sectionKey} />}
      >
        {failed}
      </ListWorkspace>
    );
  }
  if (workspace.isPending) return <LoadingState />;

  const data = workspace.data;
  if (!data) return <LoadingState />;
  const enabled = data.settings.enabled;
  const terms = organisationTerms(data.settings.organisation_kind);
  const sectionLabel = terms.sections[sectionKey];

  return (
    <ListWorkspace
      title={sectionLabel}
      description="Posts through the StreakBooks ledger. Conditional amounts stay unrecognised until their conditions are met."
      breadcrumbs={
        sectionKey === "overview"
          ? [{ label: "Nonprofit" }]
          : [{ label: "Nonprofit", to: "/nonprofit" }, { label: sectionLabel }]
      }
      subnav={<NonprofitSubnav current={sectionKey} kind={data.settings.organisation_kind} />}
    >
      {!enabled && sectionKey !== "settings" ? (
        <EmptyState
          title="Nonprofit Management is not activated"
          description="An administrator maps the ledger accounts and activates the module in Settings. Ordinary accounting is unchanged until then."
          action={
            <Button asChild>
              <Link to="/nonprofit/$section" params={{ section: "settings" }}>
                Open settings
              </Link>
            </Button>
          }
        />
      ) : (
        <SectionBody
          sectionKey={sectionKey}
          companyId={company.id}
          companyName={company.name}
          currency={company.base_currency || "USD"}
          data={data}
        />
      )}
    </ListWorkspace>
  );
}

function SectionBody({
  sectionKey,
  companyId,
  companyName,
  currency,
  data,
}: {
  sectionKey: NpSectionKey;
  companyId: string;
  companyName: string;
  currency: string;
  data: NonprofitWorkspace;
}) {
  const funds = rows(data.funds);
  const donors = rows(data.donors);
  const donations = rows(data.donations);
  const pledges = rows(data.pledges);
  const grants = rows(data.grants);
  const expenses = rows(data.expenses);
  const actions = rows(data.actions);
  if (sectionKey === "overview") {
    const insight = explainFundUtilisation(
      funds.map((fund) => ({
        fundId: text(fund.id),
        fundCode: text(fund.code),
        incomeMinor: 0,
        expenseMinor: 0,
        availableMinor: Number(fund.spendable_minor ?? 0),
        currency,
      })),
    );
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <Kpi label="Funds" value={funds.length} />
        <Kpi label="Donations" value={donations.length} />
        <Kpi label="Open actions" value={actions.length} />
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Fund position</CardTitle>
            <CardDescription>
              Calculated from posted fund tags. Nothing here posts a journal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p>{insight.text}</p>
            <ActionList actions={actions} />
          </CardContent>
        </Card>
      </div>
    );
  }
  if (sectionKey === "funds") return <FundForm companyId={companyId} funds={funds} />;
  if (sectionKey === "donors") {
    return (
      <div className="grid gap-4">
        <DonorForm companyId={companyId} donors={donors} />
        <DonorStatementPanel companyId={companyId} currency={currency} donors={donors} />
      </div>
    );
  }
  if (sectionKey === "donations") {
    return (
      <div className="grid gap-4">
        <DonationForm
          companyId={companyId}
          currency={currency}
          donors={donors}
          funds={funds}
          donations={donations}
          receipts={rows(data.receipts)}
        />
        <CollectionBatchForm
          companyId={companyId}
          currency={currency}
          donors={donors}
          funds={funds}
          collections={rows(data.collections)}
        />
        <RecurringGiftForm
          companyId={companyId}
          currency={currency}
          donors={donors}
          funds={funds}
        />
      </div>
    );
  }
  if (sectionKey === "pledges")
    return (
      <PledgeForm
        companyId={companyId}
        currency={currency}
        donors={donors}
        funds={funds}
        pledges={pledges}
      />
    );
  if (sectionKey === "grants")
    return <GrantForm companyId={companyId} currency={currency} funds={funds} grants={grants} />;
  if (sectionKey === "expenses")
    return (
      <ExpenseForm
        companyId={companyId}
        currency={currency}
        funds={funds}
        grants={grants}
        expenses={expenses}
      />
    );
  if (sectionKey === "transfers")
    return <TransferForm companyId={companyId} currency={currency} funds={funds} />;
  if (sectionKey === "reports") return <ReportTable companyId={companyId} currency={currency} />;
  if (sectionKey === "settings")
    return (
      <div className="grid gap-6">
        <OrganisationKindForm companyId={companyId} kind={data.settings.organisation_kind} />
        <SettingsForm companyId={companyId} settings={data.settings} />
      </div>
    );
  if (sectionKey === "campaigns")
    return (
      <RecordForm
        companyId={companyId}
        kind="campaign"
        title="Campaign"
        rows={rows(data.campaigns)}
        fields={["name", "target_minor"]}
      />
    );
  if (sectionKey === "programmes")
    return (
      <RecordForm
        companyId={companyId}
        kind="programme"
        title={organisationTerms(data.settings.organisation_kind).ministry}
        rows={rows(data.programmes)}
        fields={["name", "objective"]}
      />
    );
  if (sectionKey === "people") {
    return (
      <div className="grid gap-4">
        <RecordForm
          companyId={companyId}
          kind="volunteer"
          title="Volunteer"
          rows={rows(data.volunteers)}
          fields={["display_name", "email"]}
        />
        <RecordForm
          companyId={companyId}
          kind="membership"
          title="Member"
          rows={rows(data.memberships)}
          fields={["display_name", "category"]}
        />
        <RecordForm
          companyId={companyId}
          kind="beneficiary"
          title="Beneficiary"
          rows={data.beneficiaries == null ? null : rows(data.beneficiaries)}
          fields={["display_name", "eligibility_status"]}
          confidential
        />
        {data.beneficiaries == null ? null : (
          <DisbursementForm
            companyId={companyId}
            currency={currency}
            funds={funds}
            beneficiaries={rows(data.beneficiaries)}
            disbursements={rows(data.disbursements)}
          />
        )}
        <RecordForm
          companyId={companyId}
          kind="board_member"
          title="Board member"
          rows={rows(data.board)}
          fields={["display_name", "office"]}
        />
        <RecordForm
          companyId={companyId}
          kind="compliance"
          title="Compliance reminder"
          rows={rows(data.compliance)}
          fields={["pack_id", "title", "due_on"]}
        />
        <CongregationPanel
          companyId={companyId}
          currency={currency}
          organisationName={companyName}
          kind={data.settings.organisation_kind}
          donors={donors}
          volunteers={rows(data.volunteers)}
          events={rows(data.events)}
          congregations={rows(data.congregations)}
          households={rows(data.households)}
          schedules={rows(data.schedules)}
        />
      </div>
    );
  }
  if (sectionKey === "portals") {
    return <PortalPanel companyId={companyId} donors={donors} />;
  }
  return null;
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function ActionList({ actions }: { actions: Row[] }) {
  if (actions.length === 0)
    return <p className="text-sm text-muted-foreground">No open nonprofit actions.</p>;
  return (
    <ul className="mt-3 space-y-2">
      {actions.map((action) => {
        const section = text(action.href).split("/").pop() ?? "";
        return (
          <li key={text(action.id)}>
            {isNpSectionKey(section) && section !== "overview" ? (
              <Link to="/nonprofit/$section" params={{ section }} className="underline">
                {text(action.title)}
              </Link>
            ) : (
              text(action.title)
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Table({ rows: data, columns }: { rows: Row[]; columns: (keyof Row)[] }) {
  if (data.length === 0) return <p className="text-sm text-muted-foreground">No records yet.</p>;
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-background">
          <tr>
            {columns.map((column) => (
              <th key={column} className="px-2 py-1 text-left font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={text(row.id)} className="border-t">
              {columns.map((column) => (
                <td key={column} className="px-2 py-1">
                  {text(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useRefresh(companyId: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["nonprofit-workspace", companyId] });
}

function FundForm({ companyId, funds }: { companyId: string; funds: Row[] }) {
  const save = useServerFn(createNonprofitFund);
  const refresh = useRefresh(companyId);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [restriction, setRestriction] = useState("unrestricted");
  const [category, setCategory] = useState("general");
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          payload: {
            code,
            name,
            classification: restriction === "unrestricted" ? "unrestricted" : "donor_restricted",
            restriction,
            category,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Fund saved");
      setCode("");
      setName("");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 md:grid-cols-3"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="Code">
          <Input value={code} onChange={(event) => setCode(event.target.value)} required />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Field label="Restriction">
          <select
            className="h-10 rounded-md border bg-background px-2"
            value={restriction}
            onChange={(event) => setRestriction(event.target.value)}
          >
            <option value="unrestricted">Unrestricted</option>
            <option value="donor_restricted">Donor restricted</option>
            <option value="board_designated">Board designated</option>
          </select>
        </Field>
        <Field label="Category">
          {/* lookup-fixed-enum: fund categories including building, mission and welfare */}
          <select
            className="h-10 rounded-md border bg-background px-2"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          >
            <option value="general">General</option>
            <option value="programme">Programme</option>
            <option value="project">Project</option>
            <option value="emergency">Emergency</option>
            <option value="capital">Capital</option>
            <option value="building">Building</option>
            <option value="mission">Mission</option>
            <option value="welfare">Welfare</option>
            <option value="endowment">Endowment</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
        <Button type="submit" disabled={mutation.isPending}>
          Save fund
        </Button>
      </form>
      <Table rows={funds} columns={["code", "name", "restriction", "status", "spendable_minor"]} />
    </div>
  );
}

function safeStatementPeriod(
  preset: StatementPreset,
  anchor: string,
  customFrom: string,
  customAsOf: string,
): { from: string; asOf: string } | null {
  try {
    return statementPeriod(
      preset,
      preset === "custom" ? customFrom : anchor,
      preset === "custom" ? { from: customFrom, asOf: customAsOf } : undefined,
    );
  } catch {
    return null;
  }
}

function DonorStatementPanel({
  companyId,
  currency,
  donors,
}: {
  companyId: string;
  currency: string;
  donors: Row[];
}) {
  const { can } = useCan();
  const preview = useServerFn(getNonprofitDonorStatement);
  const recordOne = useServerFn(recordNonprofitDonorStatement);
  const recordMany = useServerFn(recordNonprofitDonorStatements);
  const deliver = useServerFn(deliverNonprofitDonorStatement);
  const [preset, setPreset] = useState<StatementPreset>("month");
  const [anchor, setAnchor] = useState(isoDate(new Date()));
  const [customFrom, setCustomFrom] = useState(isoDate(new Date()));
  const [customAsOf, setCustomAsOf] = useState(isoDate(new Date()));
  const [donorId, setDonorId] = useState("");
  const period = safeStatementPeriod(preset, anchor, customFrom, customAsOf);
  const periodReady = period !== null && period.from <= period.asOf;
  const from = period?.from ?? "";
  const asOf = period?.asOf ?? "";
  const statement = useQuery({
    queryKey: ["nonprofit-donor-statement", companyId, from, asOf, donorId],
    queryFn: () => preview({ data: { companyId, from, asOf, donorId: donorId || null } }),
    enabled: periodReady,
    retry: false,
  });
  const record = useMutation({
    mutationFn: () => recordOne({ data: { companyId, from, asOf, donorId: donorId || null } }),
    onSuccess: async () => {
      toast.success("Donor statement stored");
      await statement.refetch();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const bulk = useMutation({
    mutationFn: () => recordMany({ data: { companyId, from, asOf } }),
    onSuccess: (result) => {
      toast.success(`Stored ${result.generated} donor statements. Email was not sent.`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const email = useMutation({
    mutationFn: () =>
      deliver({
        data: { companyId, from, asOf, donorId },
      }),
    onSuccess: (result) => {
      if (result.delivery_status === "sent") toast.success("Donor statement emailed");
      else if (result.delivery_status === "withheld") {
        toast.error("Email needs a granted consent and a donor address");
      } else toast.error("Email delivery is not configured, so nothing was sent");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const data = statement.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Donor statements</CardTitle>
        <CardDescription>
          Recognised gifts are tied to contribution revenue. This is not a tax certificate, and
          email is sent only when delivery is configured and the donor has granted consent.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {(["week", "month", "quarter", "year", "custom"] as const).map((item) => (
            <Button
              key={item}
              type="button"
              size="sm"
              variant={preset === item ? "default" : "outline"}
              onClick={() => setPreset(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
          <Field label={preset === "custom" ? "From" : "Anchor date"}>
            <Input
              type="date"
              value={preset === "custom" ? customFrom : anchor}
              onChange={(event) =>
                preset === "custom"
                  ? setCustomFrom(event.target.value)
                  : setAnchor(event.target.value)
              }
              required
            />
          </Field>
          {preset === "custom" ? (
            <Field label="As of">
              <Input
                type="date"
                value={customAsOf}
                onChange={(event) => setCustomAsOf(event.target.value)}
                required
              />
            </Field>
          ) : (
            <Field label="Donor">
              <SelectRows
                rows={donors}
                value={donorId}
                onChange={setDonorId}
                labelKey="display_name"
                allowEmpty
              />
            </Field>
          )}
          {preset === "custom" ? (
            <Field label="Donor">
              <SelectRows
                rows={donors}
                value={donorId}
                onChange={setDonorId}
                labelKey="display_name"
                allowEmpty
              />
            </Field>
          ) : null}
        </form>
        <p className="text-sm text-muted-foreground">
          {from && asOf ? `${from} to ${asOf}. ` : "Enter a valid date. "}
          Amounts use {currency} where the gift currency matches.
        </p>
        <QueryErrorState queries={[statement]} title="Could not load the donor statement" />
        {statement.isPending && periodReady ? <LoadingState /> : null}
        {data ? <DonorStatementBody statement={data} currency={currency} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!data}
            onClick={() => data && downloadStatement(data, "csv")}
          >
            Download CSV
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!data}
            onClick={() => data && downloadStatement(data, "excel")}
          >
            Download Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!data}
            onClick={() => data && downloadStatement(data, "pdf")}
          >
            Download PDF
          </Button>
          {can("nonprofit.export") ? (
            <>
              <Button type="button" onClick={() => record.mutate()} disabled={record.isPending}>
                Store statement
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => bulk.mutate()}
                disabled={bulk.isPending}
              >
                Store one for each donor
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!donorId || email.isPending}
                onClick={() => email.mutate()}
              >
                Email this donor
              </Button>
            </>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function DonorStatementBody({
  statement,
  currency,
}: {
  statement: DonorStatement;
  currency: string;
}) {
  return (
    <div className="grid gap-2 text-sm">
      {statement.organisation.logo_url ? (
        <img src={statement.organisation.logo_url} alt="" className="h-10 w-auto" />
      ) : null}
      <p className="font-medium">{statement.organisation.name}</p>
      <p>{statement.donor?.display_name ?? "All donors"}</p>
      <p>{statement.wording}</p>
      {statement.currencies.length === 0 ? (
        <p className="text-muted-foreground">No recognised gifts in this period.</p>
      ) : (
        statement.currencies.map((row) => (
          <p key={row.currency_code}>
            {row.currency_code} net {fromMinorUnits(row.net_minor, row.currency_code || currency)}{" "}
            {row.reconciled ? "reconciled to the journal" : "does not reconcile"}
          </p>
        ))
      )}
      {statement.receipts.length > 0 ? (
        <p>
          {statement.receipts.length} receipt{statement.receipts.length === 1 ? "" : "s"} in this
          period.
        </p>
      ) : null}
      {statement.pledges.some((pledge) => pledge.outstanding_minor > 0) ? (
        <p>
          Outstanding pledges{" "}
          {statement.pledges
            .filter((pledge) => pledge.outstanding_minor > 0)
            .map(
              (pledge) =>
                `${pledge.pledge_number} ${fromMinorUnits(pledge.outstanding_minor, pledge.currency_code || currency)}`,
            )
            .join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function downloadStatement(statement: DonorStatement, kind: "csv" | "excel" | "pdf") {
  const exportable = {
    organisationName: statement.organisation.name,
    donorName: statement.donor?.display_name ?? "All donors",
    periodFrom: statement.period_from,
    asOf: statement.as_of,
    wording: statement.wording,
    lines: statement.currencies.flatMap((row) => [
      { label: "Net recognised gifts", currency: row.currency_code, amountMinor: row.net_minor },
      { label: "Refunded gifts", currency: row.currency_code, amountMinor: row.refunded_minor },
      {
        label: "Journal contribution revenue",
        currency: row.currency_code,
        amountMinor: row.journal_support_minor,
      },
    ]),
  };
  const file =
    kind === "csv"
      ? donorStatementCsv(exportable)
      : kind === "excel"
        ? donorStatementExcel(exportable)
        : donorStatementPdf(exportable);
  const blob = new Blob([file], {
    type:
      kind === "pdf" ? "application/pdf" : kind === "csv" ? "text/csv" : "application/vnd.ms-excel",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `donor-statement-${statement.period_from}.${kind === "excel" ? "xls" : kind}`;
  link.click();
  URL.revokeObjectURL(url);
}

function DonorForm({ companyId, donors }: { companyId: string; donors: Row[] }) {
  const save = useServerFn(createNonprofitDonor);
  const refresh = useRefresh(companyId);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          payload: {
            donor_kind: "individual",
            display_name: displayName,
            email,
            consent_status: "unknown",
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Donor saved");
      setDisplayName("");
      setEmail("");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="Name">
          <Input
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </Field>
        <Field label="Email">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Button type="submit" disabled={mutation.isPending}>
          Save donor
        </Button>
      </form>
      <Table rows={donors} columns={["display_name", "donor_kind", "email"]} />
    </div>
  );
}

function DonationForm({
  companyId,
  currency,
  donors,
  funds,
  donations,
  receipts,
}: {
  companyId: string;
  currency: string;
  donors: Row[];
  funds: Row[];
  donations: Row[];
  receipts: Row[];
}) {
  const save = useServerFn(submitNonprofitDonation);
  const refresh = useRefresh(companyId);
  const [donorId, setDonorId] = useState("");
  const [fundId, setFundId] = useState("");
  const [secondFundId, setSecondFundId] = useState("");
  const [secondAmount, setSecondAmount] = useState("");
  const [amount, setAmount] = useState("");
  const [conditional, setConditional] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          payload: {
            donor_id: donorId,
            donated_on: new Date().toISOString().slice(0, 10),
            currency_code: currency,
            fx_rate_to_base: 1,
            amount_minor: minor(amount, currency),
            conditional,
            idempotency_key: idempotencyKey,
            allocations: donationAllocations({
              amountMinor: minor(amount, currency),
              primaryFundId: fundId,
              secondaryFundId: secondFundId,
              secondaryMinor: secondAmount ? minor(secondAmount, currency) : 0,
            }),
          },
        },
      }),
    onSuccess: async (result) => {
      toast.success(
        result.status === "not_recognised" ? "Recorded without revenue" : "Donation posted",
      );
      setAmount("");
      setIdempotencyKey(crypto.randomUUID());
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="Donor">
          <SelectRows rows={donors} value={donorId} onChange={setDonorId} labelKey="display_name" />
        </Field>
        <Field label="Fund">
          <SelectRows
            rows={funds.filter((fund) => fund.status === "active")}
            value={fundId}
            onChange={setFundId}
            labelKey="code"
          />
        </Field>
        <Field label="Second fund">
          <SelectRows
            rows={funds.filter((fund) => fund.status === "active")}
            value={secondFundId}
            onChange={setSecondFundId}
            labelKey="code"
            allowEmpty
          />
        </Field>
        <Field label={`Second fund amount (${currency})`}>
          <Input value={secondAmount} onChange={(event) => setSecondAmount(event.target.value)} />
        </Field>
        <Field label={`Amount (${currency})`}>
          <Input value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={conditional}
            onChange={(event) => setConditional(event.target.checked)}
          />{" "}
          Conditional, do not recognise revenue
        </label>
        <Button type="submit" disabled={mutation.isPending}>
          Post donation
        </Button>
      </form>
      <Table
        rows={donations}
        columns={["donation_number", "amount_minor", "status", "donated_on"]}
      />
      <Table
        rows={receipts}
        columns={["receipt_number", "amount_minor", "donation_id", "wording"]}
      />
    </div>
  );
}

function PledgeForm({
  companyId,
  currency,
  donors,
  funds,
  pledges,
}: {
  companyId: string;
  currency: string;
  donors: Row[];
  funds: Row[];
  pledges: Row[];
}) {
  const save = useServerFn(createNonprofitPledge);
  const impair = useServerFn(impairNonprofitPledge);
  const refresh = useRefresh(companyId);
  const [donorId, setDonorId] = useState("");
  const [fundId, setFundId] = useState("");
  const [amount, setAmount] = useState("");
  const [unconditional, setUnconditional] = useState(false);
  const [pledgeId, setPledgeId] = useState("");
  const [impairAmount, setImpairAmount] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          payload: {
            donor_id: donorId,
            fund_id: fundId,
            pledged_on: new Date().toISOString().slice(0, 10),
            amount_minor: minor(amount, currency),
            currency_code: currency,
            unconditional,
          },
        },
      }),
    onSuccess: async () => {
      toast.success(
        unconditional ? "Pledge recognised" : "Conditional pledge recorded without revenue",
      );
      setAmount("");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const impairMutation = useMutation({
    mutationFn: () =>
      impair({
        data: {
          companyId,
          pledgeId,
          amountMinor: minor(impairAmount, currency),
          on: new Date().toISOString().slice(0, 10),
        },
      }),
    onSuccess: async () => {
      toast.success("Pledge impaired. The remainder stays recognised.");
      setImpairAmount("");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="Donor">
          <SelectRows rows={donors} value={donorId} onChange={setDonorId} labelKey="display_name" />
        </Field>
        <Field label="Fund">
          <SelectRows rows={funds} value={fundId} onChange={setFundId} labelKey="code" />
        </Field>
        <Field label={`Amount (${currency})`}>
          <Input value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unconditional}
            onChange={(event) => setUnconditional(event.target.checked)}
          />{" "}
          Unconditional and recognisable
        </label>
        <Button type="submit" disabled={mutation.isPending}>
          Save pledge
        </Button>
      </form>
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          impairMutation.mutate();
        }}
      >
        <Field label="Recognised pledge">
          <SelectRows
            rows={pledges}
            value={pledgeId}
            onChange={setPledgeId}
            labelKey="pledge_number"
          />
        </Field>
        <Field label={`Impairment (${currency})`}>
          <Input
            value={impairAmount}
            onChange={(event) => setImpairAmount(event.target.value)}
            required
          />
        </Field>
        <Button type="submit" variant="outline" disabled={impairMutation.isPending}>
          Impair outstanding balance
        </Button>
      </form>
      <Table
        rows={pledges}
        columns={["pledge_number", "amount_minor", "status", "collected_minor", "impaired_minor"]}
      />
    </div>
  );
}

function GrantForm({
  companyId,
  currency,
  funds,
  grants,
}: {
  companyId: string;
  currency: string;
  funds: Row[];
  grants: Row[];
}) {
  const create = useServerFn(createNonprofitGrant);
  const receive = useServerFn(receiveNonprofitGrant);
  const satisfy = useServerFn(satisfyNonprofitGrant);
  const recognise = useServerFn(recogniseNonprofitGrant);
  const refresh = useRefresh(companyId);
  const [fundId, setFundId] = useState("");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [award, setAward] = useState("");
  const [grantId, setGrantId] = useState("");
  const [amount, setAmount] = useState("");
  const onError = (error: unknown) => toast.error(friendlyAuthError(error));
  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          companyId,
          payload: {
            fund_id: fundId,
            grantor_name: title,
            code,
            title,
            grant_kind: "foundation",
            conditional: true,
            award_minor: minor(award, currency),
            currency_code: currency,
            eligible_categories: ["programme"],
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Conditional grant recorded. Cash is not revenue yet.");
      await refresh();
    },
    onError,
  });
  const receiveMutation = useMutation({
    mutationFn: () =>
      receive({
        data: {
          companyId,
          grantId,
          amountMinor: minor(amount, currency),
          on: new Date().toISOString().slice(0, 10),
        },
      }),
    onSuccess: async () => {
      toast.success("Funding received as a refundable advance");
      await refresh();
    },
    onError,
  });
  const satisfyMutation = useMutation({
    mutationFn: () => satisfy({ data: { companyId, grantId } }),
    onSuccess: async () => {
      toast.success("Conditions marked satisfied");
      await refresh();
    },
    onError,
  });
  const recogniseMutation = useMutation({
    mutationFn: () =>
      recognise({
        data: {
          companyId,
          grantId,
          amountMinor: minor(amount, currency),
          on: new Date().toISOString().slice(0, 10),
        },
      }),
    onSuccess: async () => {
      toast.success("Grant revenue recognised");
      await refresh();
    },
    onError,
  });
  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate();
        }}
      >
        <Field label="Code">
          <Input value={code} onChange={(event) => setCode(event.target.value)} required />
        </Field>
        <Field label="Title">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </Field>
        <Field label="Fund">
          <SelectRows rows={funds} value={fundId} onChange={setFundId} labelKey="code" />
        </Field>
        <Field label={`Award (${currency})`}>
          <Input value={award} onChange={(event) => setAward(event.target.value)} required />
        </Field>
        <Button type="submit" disabled={createMutation.isPending}>
          Save conditional grant
        </Button>
      </form>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        <Field label="Existing grant">
          <SelectRows rows={grants} value={grantId} onChange={setGrantId} labelKey="code" />
        </Field>
        <Field label={`Movement (${currency})`}>
          <Input value={amount} onChange={(event) => setAmount(event.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => receiveMutation.mutate()}
            disabled={receiveMutation.isPending}
          >
            Receive funding
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => satisfyMutation.mutate()}
            disabled={satisfyMutation.isPending}
          >
            Mark conditions satisfied
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => recogniseMutation.mutate()}
            disabled={recogniseMutation.isPending}
          >
            Recognise revenue
          </Button>
        </div>
      </form>
      <Table
        rows={grants}
        columns={[
          "code",
          "award_minor",
          "received_minor",
          "recognised_minor",
          "conditions_met",
          "status",
        ]}
      />
    </div>
  );
}

function ExpenseForm({
  companyId,
  currency,
  funds,
  grants,
  expenses,
}: {
  companyId: string;
  currency: string;
  funds: Row[];
  grants: Row[];
  expenses: Row[];
}) {
  const save = useServerFn(postNonprofitExpense);
  const refresh = useRefresh(companyId);
  const [fundId, setFundId] = useState("");
  const [grantId, setGrantId] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("programme");
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          payload: {
            fund_id: fundId,
            grant_id: grantId || null,
            spent_on: new Date().toISOString().slice(0, 10),
            amount_minor: minor(amount, currency),
            currency_code: currency,
            functional_class: "programme",
            category,
          },
        },
      }),
    onSuccess: async (result) => {
      toast.success(
        result.status === "rejected" ? (result.reason ?? "Expense rejected") : "Expense posted",
      );
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-4">
      <form
        className="grid gap-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          mutation.mutate();
        }}
      >
        <Field label="Fund">
          <SelectRows rows={funds} value={fundId} onChange={setFundId} labelKey="code" />
        </Field>
        <Field label="Grant, if restricted">
          <SelectRows
            rows={grants}
            value={grantId}
            onChange={setGrantId}
            labelKey="code"
            allowEmpty
          />
        </Field>
        <Field label={`Amount (${currency})`}>
          <Input value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </Field>
        <Field label="Category">
          <Input value={category} onChange={(event) => setCategory(event.target.value)} required />
        </Field>
        <Button type="submit" disabled={mutation.isPending}>
          Post expense
        </Button>
      </form>
      <Table
        rows={expenses}
        columns={[
          "category",
          "amount_minor",
          "functional_class",
          "allocated_minor",
          "status",
          "rejection_reason",
        ]}
      />
      <MovementForm companyId={companyId} currency={currency} funds={funds} />
      <AllocationForm companyId={companyId} currency={currency} expenses={expenses} />
    </div>
  );
}

function MovementForm({
  companyId,
  currency,
  funds,
}: {
  companyId: string;
  currency: string;
  funds: Row[];
}) {
  const save = useServerFn(postNonprofitMovement);
  const refresh = useRefresh(companyId);
  const key = useRef(crypto.randomUUID());
  const [fundId, setFundId] = useState("");
  const [kind, setKind] = useState("depreciation");
  const [amount, setAmount] = useState("");
  const mutation = useMutation({
    mutationFn: () => {
      const magnitude = Math.abs(minor(amount, currency));
      return save({
        data: {
          companyId,
          kind: kind === "fx_gain" || kind === "fx_loss" ? "fx_settlement" : kind,
          fundId,
          amountMinor: kind === "fx_loss" ? -magnitude : magnitude,
          currencyCode: currency,
          on: new Date().toISOString().slice(0, 10),
          idempotencyKey: key.current,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Fund movement posted");
      key.current = crypto.randomUUID();
      setAmount("");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <Field label="Fund">
        <SelectRows rows={funds} value={fundId} onChange={setFundId} labelKey="code" />
      </Field>
      <Field label="Movement">
        {/* lookup-fixed-enum: depreciation, payroll, investment, inventory and FX kinds */}
        <select
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
          aria-label="Movement"
        >
          <option value="depreciation">Depreciation</option>
          <option value="payroll_accrual">Payroll accrual</option>
          <option value="payroll_payment">Payroll payment</option>
          <option value="investment_income">Investment income</option>
          <option value="inventory_distribution">Inventory distribution</option>
          <option value="fx_gain">Exchange gain</option>
          <option value="fx_loss">Exchange loss</option>
        </select>
      </Field>
      <Field label={`Amount (${currency})`}>
        <Input value={amount} onChange={(event) => setAmount(event.target.value)} required />
      </Field>
      <Button type="submit" variant="outline" disabled={mutation.isPending}>
        Post movement
      </Button>
    </form>
  );
}

function AllocationForm({
  companyId,
  currency,
  expenses,
}: {
  companyId: string;
  currency: string;
  expenses: Row[];
}) {
  const save = useServerFn(allocateNonprofitExpense);
  const refresh = useRefresh(companyId);
  const key = useRef(crypto.randomUUID());
  const [expenseId, setExpenseId] = useState("");
  const [functionalClass, setFunctionalClass] = useState("administration");
  const [amount, setAmount] = useState("");
  const posted = expenses.filter((row) => row.status === "posted");
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          companyId,
          expenseId,
          functionalClass,
          amountMinor: minor(amount, currency),
          on: new Date().toISOString().slice(0, 10),
          idempotencyKey: key.current,
        },
      }),
    onSuccess: async () => {
      toast.success("Expense allocated to another functional class");
      key.current = crypto.randomUUID();
      setAmount("");
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <form
      className="grid gap-3 md:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <Field label="Posted expense">
        <SelectRows rows={posted} value={expenseId} onChange={setExpenseId} labelKey="category" />
      </Field>
      <Field label="Move to">
        {/* lookup-fixed-enum: functional expense classes */}
        <select
          className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          value={functionalClass}
          onChange={(event) => setFunctionalClass(event.target.value)}
          aria-label="Functional class"
        >
          <option value="programme">Programme</option>
          <option value="administration">Administration</option>
          <option value="fundraising">Fundraising</option>
        </select>
      </Field>
      <Field label={`Amount (${currency})`}>
        <Input value={amount} onChange={(event) => setAmount(event.target.value)} required />
      </Field>
      <Button type="submit" variant="outline" disabled={mutation.isPending}>
        Allocate
      </Button>
    </form>
  );
}

function TransferForm({
  companyId,
  currency,
  funds,
}: {
  companyId: string;
  currency: string;
  funds: Row[];
}) {
  const transfer = useServerFn(transferNonprofitFunds);
  const release = useServerFn(releaseNonprofitRestriction);
  const refresh = useRefresh(companyId);
  const [fromFundId, setFromFundId] = useState("");
  const [toFundId, setToFundId] = useState("");
  const [amount, setAmount] = useState("");
  const onError = (error: unknown) => toast.error(friendlyAuthError(error));
  const payload = () => ({
    companyId,
    fromFundId,
    toFundId,
    amountMinor: minor(amount, currency),
    on: new Date().toISOString().slice(0, 10),
  });
  const transferMutation = useMutation({
    mutationFn: () => transfer({ data: payload() }),
    onSuccess: async () => {
      toast.success("Interfund transfer posted");
      await refresh();
    },
    onError,
  });
  const releaseMutation = useMutation({
    mutationFn: () => release({ data: payload() }),
    onSuccess: async () => {
      toast.success("Restriction released");
      await refresh();
    },
    onError,
  });
  return (
    <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
      <Field label="From fund">
        <SelectRows rows={funds} value={fromFundId} onChange={setFromFundId} labelKey="code" />
      </Field>
      <Field label="To fund">
        <SelectRows rows={funds} value={toFundId} onChange={setToFundId} labelKey="code" />
      </Field>
      <Field label={`Amount (${currency})`}>
        <Input value={amount} onChange={(event) => setAmount(event.target.value)} required />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => transferMutation.mutate()}
          disabled={transferMutation.isPending}
        >
          Transfer
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => releaseMutation.mutate()}
          disabled={releaseMutation.isPending}
        >
          Release restriction
        </Button>
      </div>
    </form>
  );
}

function ReportTable({ companyId, currency }: { companyId: string; currency: string }) {
  const fetchStatement = useServerFn(getNonprofitStatement);
  const today = isoDate(new Date());
  const [from, setFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [asOf, setAsOf] = useState(today);
  const periodReady =
    /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(asOf) && from <= asOf;
  const statement = useQuery({
    queryKey: ["nonprofit-statement", companyId, from, asOf],
    queryFn: () => fetchStatement({ data: { companyId, from, asOf } }),
    enabled: periodReady,
    retry: false,
  });
  const data = statement.data;
  const insight = explainFundUtilisation(
    (data?.funds ?? []).map((fund) => ({
      fundId: fund.fund_id,
      fundCode: fund.code,
      incomeMinor: fund.support_minor,
      expenseMinor: fund.expenses_minor,
      availableMinor: fund.spendable_minor,
      currency,
    })),
  );
  const columns = [
    ["code", "Fund"],
    ["opening_net_assets_minor", "Opening"],
    ["support_minor", "Support"],
    ["expenses_minor", "Expenses"],
    ["transfers_minor", "Transfers"],
    ["releases_minor", "Releases"],
    ["other_equity_minor", "Other"],
    ["closing_net_assets_minor", "Closing"],
    ["spendable_minor", "Spendable"],
  ] as const;
  return (
    <div className="grid gap-3">
      <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        <Field label="From">
          <Input
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            required
          />
        </Field>
        <Field label="As of">
          <Input
            type="date"
            value={asOf}
            onChange={(event) => setAsOf(event.target.value)}
            required
          />
        </Field>
      </form>
      {!periodReady ? (
        <p className="text-sm text-muted-foreground">The statement period starts after it ends.</p>
      ) : null}
      <QueryErrorState queries={[statement]} title="Could not load the fund statement" />
      {statement.isPending && periodReady ? <LoadingState /> : null}
      {data && periodReady ? (
        <>
          <p className="text-sm">{data.wording} Nothing in this report posts a journal.</p>
          <p className="text-sm">{insight.text}</p>
          {data.funds.length === 0 ? (
            <p className="text-sm text-muted-foreground">No funds yet.</p>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr>
                    {columns.map(([, label]) => (
                      <th key={label} className="px-2 py-1 text-left font-medium">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.funds.map((fund) => (
                    <tr key={fund.fund_id} className="border-t">
                      {columns.map(([key]) => (
                        <td key={key} className="px-2 py-1">
                          {key === "code" ? fund.code : fromMinorUnits(fund[key], currency)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t font-medium">
                    {columns.map(([key]) => (
                      <td key={key} className="px-2 py-1">
                        {key === "code" ? "Total" : fromMinorUnits(data.totals[key], currency)}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const ACCOUNT_ROLES = [
  "bank",
  "contribution_revenue",
  "restricted_contribution_revenue",
  "contributions_receivable",
  "refundable_advance",
  "grant_revenue",
  "programme_expense",
  "administration_expense",
  "fundraising_expense",
  "due_to",
  "due_from",
  "transfer_out",
  "transfer_in",
  "restriction_release_debit",
  "restriction_release_credit",
] as const;

function SettingsForm({ companyId, settings }: { companyId: string; settings: NonprofitSettings }) {
  const fetchAccounts = useServerFn(listAccounts);
  const save = useServerFn(saveNonprofitSettings);
  const refresh = useRefresh(companyId);
  const accounts = useQuery({
    queryKey: ["accounts", companyId, "nonprofit-settings"],
    queryFn: () => fetchAccounts({ data: { companyId } }),
    retry: false,
  });
  const initialMap = settings.account_map;
  const [enabled, setEnabled] = useState(settings.enabled);
  const [framework, setFramework] = useState(settings.accounting_framework || "configurable");
  const [country, setCountry] = useState(settings.country_code || "US");
  const [map, setMap] = useState<Record<string, string>>(initialMap);
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
            accounting_framework: framework,
            country_code: country,
            account_map: map,
            allow_unrestricted_deficit: false,
            enforce_segregation: false,
            gateway_configured: false,
          },
        },
      }),
    onSuccess: async () => {
      toast.success(
        enabled ? "Nonprofit Management activated" : "Nonprofit Management left inactive",
      );
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  if (accounts.isPending) return <LoadingState />;
  if (accounts.isError) return <QueryErrorState queries={[accounts]} />;
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Activate Nonprofit Management for this organisation
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Accounting framework">
          <select
            className="h-10 rounded-md border bg-background px-2"
            value={framework}
            onChange={(event) => setFramework(event.target.value)}
          >
            <option value="configurable">Configurable</option>
            <option value="us_fasb">United States</option>
            <option value="uk_sorp">United Kingdom</option>
            <option value="india_ngo">India</option>
            <option value="au_acnc">Australia</option>
            <option value="ca_asnpo">Canada</option>
            <option value="nz_pbe">New Zealand</option>
          </select>
        </Field>
        <Field label="Country code">
          <Input
            value={country}
            onChange={(event) => setCountry(event.target.value.toUpperCase())}
            maxLength={2}
            required
          />
        </Field>
      </div>
      <p className="text-sm text-muted-foreground">
        Gateway card payments stay off. These mappings are the only accounts the nonprofit journals
        use.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {ACCOUNT_ROLES.map((role) => (
          <Field key={role} label={role}>
            <AccountLookup
              accounts={postable}
              value={map[role] ?? ""}
              onChange={(accountId) => setMap((current) => ({ ...current, [role]: accountId }))}
              companyId={companyId}
              purpose="posting"
              placeholder="Not mapped"
              allowClear
              ariaLabel={role}
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

function DisbursementForm({
  companyId,
  currency,
  funds,
  beneficiaries,
  disbursements,
}: {
  companyId: string;
  currency: string;
  funds: Row[];
  beneficiaries: Row[];
  disbursements: Row[];
}) {
  const request = useServerFn(requestNonprofitDisbursement);
  const decide = useServerFn(decideNonprofitDisbursement);
  const refresh = useRefresh(companyId);
  const [beneficiaryId, setBeneficiaryId] = useState("");
  const [fundId, setFundId] = useState("");
  const [amount, setAmount] = useState("");
  const onError = (error: unknown) => toast.error(friendlyAuthError(error));
  const requestMutation = useMutation({
    mutationFn: () =>
      request({
        data: {
          companyId,
          beneficiaryId,
          fundId,
          amountMinor: minor(amount, currency),
        },
      }),
    onSuccess: async (result) => {
      toast.success(
        result.status === "rejected"
          ? (result.reason ?? "Request rejected")
          : "Disbursement requested",
      );
      setAmount("");
      await refresh();
    },
    onError,
  });
  const decideMutation = useMutation({
    mutationFn: (input: { id: string; decision: "posted" | "rejected" }) =>
      decide({
        data: {
          companyId,
          disbursementId: input.id,
          decision: input.decision,
          on: new Date().toISOString().slice(0, 10),
        },
      }),
    onSuccess: async (result) => {
      toast.success(result.status === "posted" ? "Disbursement posted" : "Disbursement rejected");
      await refresh();
    },
    onError,
  });
  const waiting = disbursements.filter((row) => row.status === "draft");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Disbursements</CardTitle>
        <CardDescription>
          A request does not pay anyone. Approval posts programme expense and bank through the
          ledger.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            requestMutation.mutate();
          }}
        >
          <Field label="Beneficiary">
            <SelectRows
              rows={beneficiaries}
              value={beneficiaryId}
              onChange={setBeneficiaryId}
              labelKey="display_name"
            />
          </Field>
          <Field label="Fund">
            <SelectRows rows={funds} value={fundId} onChange={setFundId} labelKey="code" />
          </Field>
          <Field label={`Amount (${currency})`}>
            <Input value={amount} onChange={(event) => setAmount(event.target.value)} required />
          </Field>
          <Button type="submit" disabled={requestMutation.isPending}>
            Request disbursement
          </Button>
        </form>
        {waiting.map((row) => (
          <div key={text(row.id)} className="flex flex-wrap items-center gap-2 text-sm">
            <span>
              {text(row.display_name)} {text(row.amount_minor)}
            </span>
            <Button
              type="button"
              size="sm"
              onClick={() => decideMutation.mutate({ id: text(row.id), decision: "posted" })}
              disabled={decideMutation.isPending}
            >
              Approve and post
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => decideMutation.mutate({ id: text(row.id), decision: "rejected" })}
              disabled={decideMutation.isPending}
            >
              Reject
            </Button>
          </div>
        ))}
        <Table
          rows={disbursements}
          columns={["display_name", "amount_minor", "status", "rejection_reason"]}
        />
      </CardContent>
    </Card>
  );
}

function RecordForm({
  companyId,
  kind,
  title,
  rows: data,
  fields,
  confidential = false,
}: {
  companyId: string;
  kind: string;
  title: string;
  rows: Row[] | null;
  fields: (keyof Row)[];
  confidential?: boolean;
}) {
  const save = useServerFn(createNonprofitRecord);
  const refresh = useRefresh(companyId);
  const [values, setValues] = useState<Record<string, string>>({});
  const mutation = useMutation({
    mutationFn: () => save({ data: { companyId, kind, payload: values } }),
    onSuccess: async () => {
      toast.success(`${title} saved`);
      setValues({});
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {confidential ? (
          <CardDescription>
            Beneficiary details are limited to people with nonprofit.beneficiaries.view.
          </CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-3">
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          {fields.map((field) => (
            <Field key={field} label={field}>
              <Input
                value={values[field] ?? ""}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field]: event.target.value }))
                }
                required={field !== "email" && field !== "objective"}
              />
            </Field>
          ))}
          <Button type="submit" disabled={mutation.isPending}>
            Save {title.toLowerCase()}
          </Button>
        </form>
        {data == null ? (
          <p className="text-sm text-muted-foreground">
            Beneficiary records are hidden for this permission.
          </p>
        ) : (
          <Table
            rows={data}
            columns={["id", ...fields.filter((field) => data.some((row) => row[field] != null))]}
          />
        )}
      </CardContent>
    </Card>
  );
}

function PortalPanel({ companyId, donors }: { companyId: string; donors: Row[] }) {
  const { can } = useCan();
  const fetchPortal = useServerFn(getNonprofitPortal);
  const grant = useServerFn(grantNonprofitPortal);
  const portal = useQuery({
    queryKey: ["nonprofit-portal"],
    queryFn: () => fetchPortal(),
    retry: false,
  });
  const [userId, setUserId] = useState("");
  const [donorId, setDonorId] = useState("");
  const mutation = useMutation({
    mutationFn: () =>
      grant({
        data: {
          companyId,
          payload: { user_id: userId, portal_role: "donor", donor_id: donorId },
        },
      }),
    onSuccess: async () => {
      toast.success("Donor portal access granted");
      setUserId("");
      await portal.refetch();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const mine = portal.data ?? [];
  const fetchOwnStatement = useServerFn(getMyNonprofitDonorStatement);
  const today = isoDate(new Date());
  const [statementFrom, setStatementFrom] = useState(`${today.slice(0, 4)}-01-01`);
  const [statementAsOf, setStatementAsOf] = useState(today);
  const ownStatementReady =
    /^\d{4}-\d{2}-\d{2}$/.test(statementFrom) &&
    /^\d{4}-\d{2}-\d{2}$/.test(statementAsOf) &&
    statementFrom <= statementAsOf;
  const ownStatement = useQuery({
    queryKey: ["my-donor-statement", statementFrom, statementAsOf],
    queryFn: () => fetchOwnStatement({ data: { from: statementFrom, asOf: statementAsOf } }),
    enabled: ownStatementReady,
    retry: false,
  });
  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Your portal records</CardTitle>
          <CardDescription>
            Only donations linked to the signed-in portal user are returned. Card payments stay off
            until a gateway is configured.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {portal.isPending ? <LoadingState /> : null}
          {portal.isError ? <QueryErrorState queries={[portal]} /> : null}
          {portal.isSuccess && mine.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This sign-in has no donor, volunteer, member or grantor portal link.
            </p>
          ) : null}
          {mine.map((entry) => (
            <div key={text(entry.company_id) + text(entry.portal_role)} className="mt-3">
              <p className="text-sm font-medium">{text(entry.portal_role)}</p>
              <Table
                rows={rows(entry.donations)}
                columns={["donation_number", "amount_minor", "status", "donated_on"]}
              />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your donor statement</CardTitle>
          <CardDescription>
            A portal donor sees only their own gifts. Staff without a portal link see nothing here.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
            <Field label="From">
              <Input
                type="date"
                value={statementFrom}
                onChange={(event) => setStatementFrom(event.target.value)}
              />
            </Field>
            <Field label="As of">
              <Input
                type="date"
                value={statementAsOf}
                onChange={(event) => setStatementAsOf(event.target.value)}
              />
            </Field>
          </form>
          <QueryErrorState queries={[ownStatement]} title="Could not load your donor statement" />
          {ownStatement.isPending && ownStatementReady ? <LoadingState /> : null}
          {ownStatement.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No donor portal statement for this sign-in.
            </p>
          ) : null}
          {ownStatement.data?.map((entry) => (
            <div key={entry.donor_id} className="grid gap-2">
              <DonorStatementBody statement={entry.statement} currency="USD" />
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadStatement(entry.statement, "pdf")}
              >
                Download PDF
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
      {can("nonprofit.portal.manage") ? (
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <Field label="Portal user id">
            <Input value={userId} onChange={(event) => setUserId(event.target.value)} required />
          </Field>
          <Field label="Donor">
            <SelectRows
              rows={donors}
              value={donorId}
              onChange={setDonorId}
              labelKey="display_name"
            />
          </Field>
          <Button type="submit" disabled={mutation.isPending}>
            Grant donor portal
          </Button>
        </form>
      ) : null}
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

function SelectRows({
  rows,
  value,
  onChange,
  labelKey,
  allowEmpty = false,
}: {
  rows: Row[];
  value: string;
  onChange: (value: string) => void;
  labelKey: keyof Row;
  allowEmpty?: boolean;
}) {
  return (
    <RecordLookupSelect
      value={value}
      onValueChange={onChange}
      required={!allowEmpty}
      placeholder={allowEmpty ? "None" : "Select"}
      aria-label={labelKey}
    >
      {rows.map((row) => (
        <option key={text(row.id)} value={text(row.id)}>
          {text(row[labelKey])}
        </option>
      ))}
    </RecordLookupSelect>
  );
}

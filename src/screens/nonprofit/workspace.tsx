import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type ReactNode } from "react";
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
import { toMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  createNonprofitDonor,
  createNonprofitFund,
  createNonprofitGrant,
  createNonprofitPledge,
  createNonprofitRecord,
  getNonprofitPortal,
  getNonprofitWorkspace,
  grantNonprofitPortal,
  postNonprofitExpense,
  receiveNonprofitGrant,
  recogniseNonprofitGrant,
  releaseNonprofitRestriction,
  satisfyNonprofitGrant,
  saveNonprofitSettings,
  submitNonprofitDonation,
  transferNonprofitFunds,
} from "@/lib/nonprofit/nonprofit.functions";
import { isNpSectionKey, npSection, type NpSectionKey } from "@/lib/nonprofit/sections";
import { donationAllocations } from "@/lib/nonprofit/donation-entry";
import { explainFundUtilisation } from "@/lib/nonprofit/insights";
import type { NonprofitRecord, NonprofitSettings, NonprofitWorkspace } from "@/lib/nonprofit/types";
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

  return (
    <ListWorkspace
      title={section.label}
      description="Posts through the StreakBooks ledger. Conditional amounts stay unrecognised until their conditions are met."
      breadcrumbs={
        sectionKey === "overview"
          ? [{ label: "Nonprofit" }]
          : [{ label: "Nonprofit", to: "/nonprofit" }, { label: section.label }]
      }
      subnav={<NonprofitSubnav current={sectionKey} />}
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
  currency,
  data,
}: {
  sectionKey: NpSectionKey;
  companyId: string;
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
  if (sectionKey === "donors") return <DonorForm companyId={companyId} donors={donors} />;
  if (sectionKey === "donations") {
    return (
      <DonationForm
        companyId={companyId}
        currency={currency}
        donors={donors}
        funds={funds}
        donations={donations}
        receipts={rows(data.receipts)}
      />
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
  if (sectionKey === "reports") return <ReportTable funds={funds} currency={currency} />;
  if (sectionKey === "settings")
    return <SettingsForm key={companyId} companyId={companyId} settings={data.settings} />;
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
        title="Programme"
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
            category: restriction === "unrestricted" ? "general" : "emergency",
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
        <Button type="submit" disabled={mutation.isPending}>
          Save fund
        </Button>
      </form>
      <Table rows={funds} columns={["code", "name", "restriction", "status", "spendable_minor"]} />
    </div>
  );
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
  const refresh = useRefresh(companyId);
  const [donorId, setDonorId] = useState("");
  const [fundId, setFundId] = useState("");
  const [amount, setAmount] = useState("");
  const [unconditional, setUnconditional] = useState(false);
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
      <Table
        rows={pledges}
        columns={["pledge_number", "amount_minor", "status", "collected_minor"]}
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
        columns={["category", "amount_minor", "functional_class", "status", "rejection_reason"]}
      />
    </div>
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

function ReportTable({ funds, currency }: { funds: Row[]; currency: string }) {
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
    <div className="grid gap-3">
      <p className="text-sm">{insight.text}</p>
      <Table rows={funds} columns={["code", "name", "restriction", "status", "spendable_minor"]} />
    </div>
  );
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
  const { can } = useCan();
  const canEdit = can("nonprofit.admin");
  const [expectedVersion, setExpectedVersion] = useState(settings.version);
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
          expectedVersion,
          enabled,
          framework,
          country,
          accountMap: map,
        },
      }),
    onSuccess: async (version) => {
      setExpectedVersion(version);
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
        if (canEdit && settings.version === expectedVersion) mutation.mutate();
      }}
    >
      {expectedVersion !== settings.version && (
        <p role="alert">Settings have changed. Reload this page before editing.</p>
      )}
      <fieldset
        disabled={!canEdit || mutation.isPending || expectedVersion !== settings.version}
        className="grid gap-3"
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
          Gateway card payments stay off. These mappings are the only accounts the nonprofit
          journals use.
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
      </fieldset>
    </form>
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

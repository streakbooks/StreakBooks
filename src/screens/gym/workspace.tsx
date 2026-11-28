import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent, type ReactNode } from "react";
import { GymSubnav } from "@/components/gym/GymSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { fromMinorUnits, toMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  activateGymMembership,
  approveGymCommission,
  bookGymAppointment,
  bookGymClass,
  cancelGymAppointment,
  cancelGymMembership,
  checkInGymMember,
  consumeGymSession,
  createGymBranch,
  createGymMember,
  freezeGymMembership,
  getGymPortal,
  getGymStatement,
  linkGymPortal,
  getGymWorkspace,
  issueGymVoucher,
  recogniseGymRevenue,
  recordGymReceipt,
  redeemGymVoucher,
  renewGymMembership,
  saveGymBudget,
  saveGymClass,
  saveGymEquipment,
  saveGymLead,
  saveGymPlan,
  saveGymSettings,
  saveGymTrainer,
  sellGymPackage,
} from "@/lib/gym/gym.functions";
import { churnInsight, deferredExceptionInsight } from "@/lib/gym/insights";
import { gymSection, type GymSectionKey } from "@/lib/gym/sections";
import type { GymRecord, GymWorkspace } from "@/lib/gym/types";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

function text(value: unknown): string {
  return value == null ? "" : String(value);
}

function rows(value: GymRecord[] | null | undefined): GymRecord[] {
  return value ?? [];
}

const ACCOUNT_ROLES = [
  "bank",
  "accounts_receivable",
  "deferred_membership_revenue",
  "membership_revenue",
  "joining_fee_revenue",
  "tax_liability",
  "prepaid_session_liability",
  "session_revenue",
  "commission_expense",
  "commission_payable",
  "cancellation_fee_revenue",
  "voucher_liability",
] as const;

export function GymPage({ sectionKey }: { sectionKey: GymSectionKey }) {
  const section = gymSection(sectionKey);
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const allowed = section.anyOf.some((permission) => can(permission as Permission));
  const fetchWorkspace = useServerFn(getGymWorkspace);
  const workspace = useQuery({
    queryKey: ["gym-workspace", company?.id],
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
      <ListWorkspace
        title={section.label}
        description="Gym and fitness operations on the StreakBooks ledger."
      >
        <EmptyState
          title="No Gym access"
          description="Ask an administrator for gym.view or the permission named on this section."
        />
      </ListWorkspace>
    );
  }
  if (workspace.isError) {
    return (
      <ListWorkspace
        title={section.label}
        description="Gym and fitness operations on the StreakBooks ledger."
        breadcrumbs={[{ label: "Gym & Fitness", to: "/gym" }, { label: section.label }]}
        subnav={<GymSubnav current={sectionKey} />}
      >
        <QueryErrorState queries={[workspace]} />
      </ListWorkspace>
    );
  }
  if (workspace.isPending || !workspace.data) return <LoadingState />;

  const data = workspace.data;
  const currency = data.settings.currency_code || company.base_currency || "USD";

  return (
    <ListWorkspace
      title={section.label}
      description="Membership charges, receipts and revenue recognition post through the StreakBooks ledger."
      breadcrumbs={
        sectionKey === "overview"
          ? [{ label: "Gym & Fitness" }]
          : [{ label: "Gym & Fitness", to: "/gym" }, { label: section.label }]
      }
      subnav={<GymSubnav current={sectionKey} />}
    >
      {!data.settings.enabled ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          Gym & Fitness is not activated. Historical journals stay in the ledger. Posting, booking
          and check-in stay blocked until an administrator activates the module.
        </p>
      ) : null}
      <SectionBody sectionKey={sectionKey} data={data} currency={currency} companyId={company.id} />
    </ListWorkspace>
  );
}

function SectionBody({
  sectionKey,
  data,
  currency,
  companyId,
}: {
  sectionKey: GymSectionKey;
  data: GymWorkspace;
  currency: string;
  companyId: string;
}) {
  const money = (minor: number) => fromMinorUnits(minor, currency);
  if (sectionKey === "overview") return <Overview data={data} money={money} />;
  if (sectionKey === "actions") return <Actions data={data} />;
  if (sectionKey === "members") return <MemberForm companyId={companyId} rows={data.members} />;
  if (sectionKey === "plans")
    return <PlanForm companyId={companyId} currency={currency} rows={data.plans} />;
  if (sectionKey === "memberships") {
    return <MembershipForm companyId={companyId} currency={currency} data={data} money={money} />;
  }
  if (sectionKey === "billing" || sectionKey === "payments") {
    return <ReceiptForm companyId={companyId} currency={currency} data={data} money={money} />;
  }
  if (sectionKey === "statements")
    return <StatementForm companyId={companyId} currency={currency} members={data.members} />;
  if (sectionKey === "deferred")
    return <DeferredPanel companyId={companyId} currency={currency} data={data} money={money} />;
  if (sectionKey === "appointments") return <AppointmentForm companyId={companyId} data={data} />;
  if (sectionKey === "classes") return <ClassForm companyId={companyId} data={data} />;
  if (sectionKey === "attendance") return <CheckInForm companyId={companyId} rows={data.members} />;
  if (sectionKey === "trainers") return <TrainerForm companyId={companyId} rows={data.trainers} />;
  if (sectionKey === "packages" || sectionKey === "commissions") {
    return <PackageForm companyId={companyId} currency={currency} data={data} money={money} />;
  }
  if (sectionKey === "equipment")
    return <EquipmentForm companyId={companyId} rows={data.equipment} />;
  if (sectionKey === "leads") return <LeadForm companyId={companyId} rows={data.leads} />;
  if (sectionKey === "branches") return <BranchForm companyId={companyId} rows={data.branches} />;
  if (sectionKey === "budgets")
    return <BudgetForm companyId={companyId} currency={currency} rows={data.budgets} />;
  if (sectionKey === "portal") return <PortalPanel companyId={companyId} currency={currency} />;
  if (sectionKey === "reports") return <ReportsPanel data={data} money={money} />;
  if (sectionKey === "settings") return <SettingsForm companyId={companyId} data={data} />;
  return null;
}

function Overview({ data, money }: { data: GymWorkspace; money: (minor: number) => string }) {
  const k = data.kpis;
  const churn = churnInsight(
    k.memberships_active + k.memberships_cancelled,
    k.memberships_cancelled,
  );
  const deferred = deferredExceptionInsight(
    rows(data.actions).filter((row) => text(row["title"]).includes("deferred")).length,
  );
  const cards = [
    ["Active memberships", String(k.memberships_active)],
    ["Monthly recurring", money(k.mrr_minor)],
    ["Annual run-rate", money(k.arr_minor)],
    ["Invoiced", money(k.invoiced_minor)],
    ["Collected", money(k.collected_minor)],
    ["Recognised", money(k.recognised_minor)],
    ["Deferred", money(k.deferred_minor)],
    ["Outstanding", money(k.outstanding_minor)],
    ["Check-ins today", String(k.checkins_today)],
    ["Upcoming appointments", String(k.upcoming_appointments)],
  ];
  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="p-3 pb-1">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-lg tabular-nums">{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What these figures mean</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground">
          <p>
            Invoiced, collected and recognised are different. A prepaid annual fee is invoiced and
            deferred, then earned on its recognition schedule.
          </p>
          <p>
            Monthly recurring revenue is the run-rate of active week, month, quarter, half-year and
            year memberships.
            {k.residual_minor > 0
              ? ` ${money(k.residual_minor)} does not divide evenly and stays on the final recognition line.`
              : ""}
          </p>
          <p>
            Receivable subledger {money(k.subledger_receivable_minor)}
            {k.ledger_receivable_minor == null
              ? " has no ledger mapping yet."
              : ` and the mapped ledger account is ${money(k.ledger_receivable_minor)}. ${k.reconciliation_balanced ? "They match." : "They do not match. Review the action centre before closing."}`}
          </p>
          <p>{churn.explanation}</p>
          <p>{deferred.explanation}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Actions({ data }: { data: GymWorkspace }) {
  const items = rows(data.actions);
  if (items.length === 0) {
    return (
      <EmptyState
        title="No open actions"
        description="Renewals, failed collections, deferred exceptions and maintenance due dates appear here when the records exist."
      />
    );
  }
  return (
    <ul className="grid gap-2">
      {items.map((item) => (
        <li key={text(item["id"])} className="rounded-md border border-border px-3 py-2 text-sm">
          <a
            href={text(item["href"]) || "/gym"}
            className="font-medium underline-offset-2 hover:underline"
          >
            {text(item["title"])}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Table({ columns, records }: { columns: [string, string][]; records: GymRecord[] }) {
  if (records.length === 0)
    return (
      <EmptyState title="Nothing here yet" description="Records appear after they are saved." />
    );
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="bg-muted/50">
          <tr>
            {columns.map(([key, label]) => (
              <th key={key} className="px-3 py-2 font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((row) => (
            <tr key={text(row["id"])} className="border-t border-border">
              {columns.map(([key]) => (
                <td key={key} className="px-3 py-2 align-top">
                  {text(row[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useGymMutation<T>(fn: (input: { data: T }) => Promise<unknown>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      const replayed =
        result && typeof result === "object" && "replayed" in result && result.replayed === true;
      toast.success(replayed ? "Already saved. Nothing new was posted." : "Saved.");
      void client.invalidateQueries({ queryKey: ["gym-workspace"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Label className="grid gap-1 text-xs">
      {label}
      {children}
    </Label>
  );
}

function MemberForm({ companyId, rows: members }: { companyId: string; rows: GymRecord[] }) {
  const save = useServerFn(createGymMember);
  const mutation = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => save(input),
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Member"
        pending={mutation.isPending}
        onSubmit={(form) =>
          mutation.mutate({
            data: {
              companyId,
              payload: {
                display_name: form.get("display_name"),
                email: form.get("email"),
                phone: form.get("phone"),
                status: form.get("status") || "prospect",
                is_minor: form.get("is_minor") === "on",
                guardian_member_id: form.get("guardian_member_id"),
                payer_contact_id: form.get("payer_contact_id"),
                contact_id: form.get("contact_id"),
              },
            },
          })
        }
      >
        <Field label="Name">
          <Input name="display_name" required />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" />
        </Field>
        <Field label="Phone">
          <Input name="phone" />
        </Field>
        <Field label="Status">
          <Input name="status" defaultValue="prospect" />
        </Field>
        <Field label="Existing contact id">
          <Input name="contact_id" />
        </Field>
        <Field label="Payer contact id">
          <Input name="payer_contact_id" />
        </Field>
        <Field label="Guardian member id">
          <Input name="guardian_member_id" />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input name="is_minor" type="checkbox" /> Child member
        </label>
      </Form>
      <Table
        columns={[
          ["member_number", "Number"],
          ["display_name", "Name"],
          ["email", "Email"],
          ["status", "Status"],
        ]}
        records={members}
      />
    </div>
  );
}

function PlanForm({
  companyId,
  currency,
  rows: plans,
}: {
  companyId: string;
  currency: string;
  rows: GymRecord[];
}) {
  const save = useServerFn(saveGymPlan);
  const mutation = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => save(input),
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Plan version"
        pending={mutation.isPending}
        onSubmit={(form) =>
          mutation.mutate({
            data: {
              companyId,
              payload: {
                code: form.get("code"),
                name: form.get("name"),
                billing_interval: form.get("billing_interval") || "year",
                term_count: Number(form.get("term_count") || 1),
                price_minor: Number(toMinorUnits(String(form.get("price") || "0"), currency)),
                joining_fee_minor: Number(
                  toMinorUnits(String(form.get("joining") || "0"), currency),
                ),
                tax_bps: Number(form.get("tax_bps") || 0),
                recognition: form.get("recognition") || "monthly",
                joining_fee_policy: form.get("joining_fee_policy") || "immediate",
                cancel_policy: form.get("cancel_policy") || "keep_deferred",
                currency_code: currency,
              },
            },
          })
        }
      >
        <Field label="Code">
          <Input name="code" required />
        </Field>
        <Field label="Name">
          <Input name="name" required />
        </Field>
        <Field label="Interval">
          <Input name="billing_interval" defaultValue="year" />
        </Field>
        <Field label="Term count">
          <Input name="term_count" defaultValue="1" inputMode="numeric" />
        </Field>
        <Field label="Price">
          <Input name="price" required inputMode="decimal" />
        </Field>
        <Field label="Joining fee">
          <Input name="joining" defaultValue="0" inputMode="decimal" />
        </Field>
        <Field label="Tax basis points">
          <Input name="tax_bps" defaultValue="0" inputMode="numeric" />
        </Field>
        <Field label="Recognition">
          <Input name="recognition" defaultValue="monthly" />
        </Field>
        <Field label="Joining fee policy">
          <Input name="joining_fee_policy" defaultValue="immediate" />
        </Field>
        <Field label="Cancellation">
          <Input name="cancel_policy" defaultValue="keep_deferred" />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        Saving a plan adds a version. Existing contracts keep the price they were activated with.
        Tax basis points are the organisation's configured rate, not a statutory table.
      </p>
      <Table
        columns={[
          ["code", "Code"],
          ["name", "Name"],
          ["price_minor", "Price minor"],
          ["billing_interval", "Interval"],
          ["recognition", "Recognition"],
          ["version_no", "Version"],
        ]}
        records={plans}
      />
    </div>
  );
}

function MembershipForm({
  companyId,
  currency,
  data,
  money,
}: {
  companyId: string;
  currency: string;
  data: GymWorkspace;
  money: (minor: number) => string;
}) {
  const activate = useServerFn(activateGymMembership);
  const freeze = useServerFn(freezeGymMembership);
  const renew = useServerFn(renewGymMembership);
  const cancel = useServerFn(cancelGymMembership);
  const activateMutation = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => activate(input),
  );
  const other = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => {
      const kind = String(input.data.payload["kind"] || "");
      if (kind === "freeze") return freeze(input);
      if (kind === "renew") return renew(input);
      return cancel(input);
    },
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Activate membership"
        pending={activateMutation.isPending}
        onSubmit={(form) =>
          activateMutation.mutate({
            data: {
              companyId,
              payload: {
                member_id: form.get("member_id"),
                plan_id: form.get("plan_id"),
                starts_on: form.get("starts_on"),
                signature_name: form.get("signature_name"),
                idempotency_key: form.get("idempotency_key"),
              },
            },
          })
        }
      >
        <Field label="Member id">
          <Input name="member_id" required />
        </Field>
        <Field label="Plan id">
          <Input name="plan_id" required />
        </Field>
        <Field label="Starts">
          <Input name="starts_on" type="date" required />
        </Field>
        <Field label="Acceptance name">
          <Input name="signature_name" required />
        </Field>
        <Field label="Idempotency key">
          <Input name="idempotency_key" required />
        </Field>
      </Form>
      <Form
        title="Freeze, renew or cancel"
        pending={other.isPending}
        onSubmit={(form) =>
          other.mutate({
            data: {
              companyId,
              payload: {
                kind: form.get("kind"),
                membership_id: form.get("membership_id"),
                days: Number(form.get("days") || 0),
                idempotency_key: form.get("idempotency_key"),
                destination: form.get("destination") || "accounts_receivable",
              },
            },
          })
        }
      >
        <Field label="Action">
          <Input name="kind" defaultValue="freeze" />
        </Field>
        <Field label="Membership id">
          <Input name="membership_id" required />
        </Field>
        <Field label="Freeze days">
          <Input name="days" defaultValue="14" inputMode="numeric" />
        </Field>
        <Field label="Idempotency key">
          <Input name="idempotency_key" required />
        </Field>
        <Field label="Refund destination">
          <Input name="destination" defaultValue="accounts_receivable" />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        Cancellation follows the contract. keep_deferred leaves the unrecognised balance as a
        liability. Refund and forfeit post only when that policy is on the contract. Amounts below
        are minor units. Example display {money(120000)} for 120000 in {currency}.
      </p>
      <Table
        columns={[
          ["membership_number", "Number"],
          ["status", "Status"],
          ["starts_on", "Starts"],
          ["ends_on", "Ends"],
          ["price_minor", "Price"],
          ["journal_id", "Journal"],
        ]}
        records={data.memberships}
      />
    </div>
  );
}

function ReceiptForm({
  companyId,
  currency,
  data,
  money,
}: {
  companyId: string;
  currency: string;
  data: GymWorkspace;
  money: (minor: number) => string;
}) {
  const save = useServerFn(recordGymReceipt);
  const voucher = useServerFn(issueGymVoucher);
  const redeem = useServerFn(redeemGymVoucher);
  const receipt = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => save(input),
  );
  const issue = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => voucher(input),
  );
  const redemption = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => redeem(input),
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Record a receipt"
        pending={receipt.isPending}
        onSubmit={(form) =>
          receipt.mutate({
            data: {
              companyId,
              payload: {
                member_id: form.get("member_id"),
                amount_minor: Number(toMinorUnits(String(form.get("amount") || "0"), currency)),
                method: form.get("method") || "bank_transfer",
                received_on: form.get("received_on"),
                evidence: form.get("evidence"),
                idempotency_key: form.get("idempotency_key"),
                currency_code: currency,
              },
            },
          })
        }
      >
        <Field label="Member id">
          <Input name="member_id" required />
        </Field>
        <Field label="Amount">
          <Input name="amount" required inputMode="decimal" />
        </Field>
        <Field label="Method">
          <Input name="method" defaultValue="bank_transfer" />
        </Field>
        <Field label="Date">
          <Input name="received_on" type="date" required />
        </Field>
        <Field label="Evidence">
          <Input name="evidence" />
        </Field>
        <Field label="Idempotency key">
          <Input name="idempotency_key" required />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        Cash, bank transfer and a manual card receipt with evidence post immediately. Card gateways,
        UPI and direct debit stay pending until a verified provider confirmation exists. This screen
        does not store card numbers. Outstanding {money(data.kpis.outstanding_minor)}.
      </p>
      <Form
        title="Customer-funded voucher"
        pending={issue.isPending}
        onSubmit={(form) =>
          issue.mutate({
            data: {
              companyId,
              payload: {
                amount_minor: Number(toMinorUnits(String(form.get("amount") || "0"), currency)),
                idempotency_key: form.get("idempotency_key"),
              },
            },
          })
        }
      >
        <Field label="Amount received">
          <Input name="amount" required inputMode="decimal" />
        </Field>
        <Field label="Idempotency key">
          <Input name="idempotency_key" required />
        </Field>
      </Form>
      <Form
        title="Redeem voucher against an open balance"
        pending={redemption.isPending}
        onSubmit={(form) =>
          redemption.mutate({
            data: {
              companyId,
              payload: {
                voucher_id: form.get("voucher_id"),
                member_id: form.get("member_id"),
                amount_minor: Number(toMinorUnits(String(form.get("amount") || "0"), currency)),
                idempotency_key: form.get("idempotency_key"),
              },
            },
          })
        }
      >
        <Field label="Voucher id">
          <Input name="voucher_id" required />
        </Field>
        <Field label="Member id">
          <Input name="member_id" required />
        </Field>
        <Field label="Amount">
          <Input name="amount" required inputMode="decimal" />
        </Field>
        <Field label="Idempotency key">
          <Input name="idempotency_key" required />
        </Field>
      </Form>
      <Table
        columns={[
          ["charge_number", "Charge"],
          ["kind", "Kind"],
          ["amount_minor", "Amount"],
          ["allocated_minor", "Allocated"],
          ["status", "Status"],
        ]}
        records={data.charges}
      />
      <Table
        columns={[
          ["receipt_number", "Receipt"],
          ["method", "Method"],
          ["amount_minor", "Amount"],
          ["status", "Status"],
          ["journal_id", "Journal"],
        ]}
        records={data.receipts}
      />
    </div>
  );
}

function StatementForm({
  companyId,
  currency,
  members,
}: {
  companyId: string;
  currency: string;
  members: GymRecord[];
}) {
  const fetchStatement = useServerFn(getGymStatement);
  const [statement, setStatement] = useState<string>("");
  const mutation = useMutation({
    mutationFn: (input: { memberId: string; from: string; to: string }) =>
      fetchStatement({ data: { companyId, ...input } }),
    onSuccess: (result) => {
      setStatement(
        [
          `Opening ${fromMinorUnits(result.opening_minor, currency)}`,
          `Charges ${fromMinorUnits(result.charges_minor, currency)}`,
          `Receipts ${fromMinorUnits(result.receipts_minor, currency)}`,
          `Closing ${fromMinorUnits(result.closing_minor, currency)}`,
        ].join(" · "),
      );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <div className="grid gap-3">
      <Form
        title="Member statement"
        pending={mutation.isPending}
        onSubmit={(form) =>
          mutation.mutate({
            memberId: String(form.get("member_id") || ""),
            from: String(form.get("from") || ""),
            to: String(form.get("to") || ""),
          })
        }
      >
        <Field label="Member id">
          <Input name="member_id" required />
        </Field>
        <Field label="From">
          <Input name="from" type="date" required />
        </Field>
        <Field label="To">
          <Input name="to" type="date" required />
        </Field>
      </Form>
      {statement ? <p className="text-sm tabular-nums">{statement}</p> : null}
      <p className="text-xs text-muted-foreground">
        The closing balance is the member subledger. It is reconcilable to the mapped accounts
        receivable account from the dashboard.
      </p>
      <Table
        columns={[
          ["member_number", "Number"],
          ["display_name", "Name"],
          ["id", "Id"],
        ]}
        records={members}
      />
    </div>
  );
}

function DeferredPanel({
  companyId,
  currency,
  data,
  money,
}: {
  companyId: string;
  currency: string;
  data: GymWorkspace;
  money: (minor: number) => string;
}) {
  const recognise = useServerFn(recogniseGymRevenue);
  const mutation = useGymMutation((input: { data: { companyId: string; asOf: string } }) =>
    recognise(input),
  );
  return (
    <div className="grid gap-3">
      <p className="text-sm">
        Deferred {money(data.kpis.deferred_minor)}. Recognised {money(data.kpis.recognised_minor)}.
      </p>
      <Form
        title="Recognise due revenue"
        pending={mutation.isPending}
        onSubmit={(form) =>
          mutation.mutate({ data: { companyId, asOf: String(form.get("as_of") || "") } })
        }
      >
        <Field label="Through date">
          <Input name="as_of" type="date" required />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        Each schedule line posts once. A locked accounting period rejects the journal. Currency{" "}
        {currency}.
      </p>
      <Table
        columns={[
          ["recognise_on", "Date"],
          ["amount_minor", "Amount"],
          ["status", "Status"],
          ["journal_id", "Journal"],
        ]}
        records={data.recognition}
      />
    </div>
  );
}

function AppointmentForm({ companyId, data }: { companyId: string; data: GymWorkspace }) {
  const book = useServerFn(bookGymAppointment);
  const cancel = useServerFn(cancelGymAppointment);
  const mutation = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => book(input),
  );
  const cancelMutation = useGymMutation(
    (input: { data: { companyId: string; appointmentId: string } }) => cancel(input),
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Book appointment"
        pending={mutation.isPending}
        onSubmit={(form) =>
          mutation.mutate({
            data: {
              companyId,
              payload: {
                trainer_id: form.get("trainer_id"),
                member_id: form.get("member_id"),
                room_code: form.get("room_code"),
                kind: form.get("kind") || "personal_training",
                starts_at: new Date(String(form.get("starts_at"))).toISOString(),
                ends_at: new Date(String(form.get("ends_at"))).toISOString(),
                idempotency_key: form.get("idempotency_key"),
              },
            },
          })
        }
      >
        <Field label="Trainer id">
          <Input name="trainer_id" />
        </Field>
        <Field label="Member id">
          <Input name="member_id" />
        </Field>
        <Field label="Room">
          <Input name="room_code" />
        </Field>
        <Field label="Starts">
          <Input name="starts_at" type="datetime-local" required />
        </Field>
        <Field label="Ends">
          <Input name="ends_at" type="datetime-local" required />
        </Field>
        <Field label="Idempotency key">
          <Input name="idempotency_key" required />
        </Field>
      </Form>
      <Form
        title="Cancel appointment"
        pending={cancelMutation.isPending}
        onSubmit={(form) =>
          cancelMutation.mutate({
            data: { companyId, appointmentId: String(form.get("appointment_id") || "") },
          })
        }
      >
        <Field label="Appointment id">
          <Input name="appointment_id" required />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        The database rejects a second booking that overlaps the same trainer or room. Times are
        stored in UTC.
      </p>
      <Table
        columns={[
          ["kind", "Kind"],
          ["starts_at", "Starts"],
          ["ends_at", "Ends"],
          ["status", "Status"],
          ["room_code", "Room"],
        ]}
        records={data.appointments}
      />
    </div>
  );
}

function ClassForm({ companyId, data }: { companyId: string; data: GymWorkspace }) {
  const save = useServerFn(saveGymClass);
  const book = useServerFn(bookGymClass);
  const create = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => save(input),
  );
  const booking = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => book(input),
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Schedule a class"
        pending={create.isPending}
        onSubmit={(form) =>
          create.mutate({
            data: {
              companyId,
              payload: {
                name: form.get("name"),
                capacity: Number(form.get("capacity") || 1),
                starts_at: new Date(String(form.get("starts_at"))).toISOString(),
                ends_at: new Date(String(form.get("ends_at"))).toISOString(),
              },
            },
          })
        }
      >
        <Field label="Name">
          <Input name="name" required />
        </Field>
        <Field label="Capacity">
          <Input name="capacity" defaultValue="12" inputMode="numeric" />
        </Field>
        <Field label="Starts">
          <Input name="starts_at" type="datetime-local" required />
        </Field>
        <Field label="Ends">
          <Input name="ends_at" type="datetime-local" required />
        </Field>
      </Form>
      <Form
        title="Register a member"
        pending={booking.isPending}
        onSubmit={(form) =>
          booking.mutate({
            data: {
              companyId,
              payload: { session_id: form.get("session_id"), member_id: form.get("member_id") },
            },
          })
        }
      >
        <Field label="Session id">
          <Input name="session_id" required />
        </Field>
        <Field label="Member id">
          <Input name="member_id" required />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        A full class returns a waiting-list place. Cancelling a registered place promotes the
        earliest waiting member.
      </p>
      <Table
        columns={[
          ["name", "Class"],
          ["starts_at", "Starts"],
          ["capacity", "Capacity"],
          ["registered", "Registered"],
          ["status", "Status"],
        ]}
        records={data.sessions}
      />
    </div>
  );
}

function CheckInForm({ companyId, rows: members }: { companyId: string; rows: GymRecord[] }) {
  const save = useServerFn(checkInGymMember);
  const mutation = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => save(input),
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Check in"
        pending={mutation.isPending}
        onSubmit={(form) =>
          mutation.mutate({
            data: {
              companyId,
              payload: {
                member_number: form.get("member_number"),
                attended_on: form.get("attended_on"),
                source: form.get("source") || "manual",
                idempotency_key: form.get("idempotency_key"),
              },
            },
          })
        }
      >
        <Field label="Membership number">
          <Input name="member_number" required />
        </Field>
        <Field label="Date">
          <Input name="attended_on" type="date" required />
        </Field>
        <Field label="Source">
          <Input name="source" defaultValue="manual" />
        </Field>
        <Field label="Idempotency key">
          <Input name="idempotency_key" required />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        Access is allowed for an active or trial membership that covers the date, including its
        grace days. QR and barcode here mean the membership number was scanned by staff. Door
        hardware is not connected.
      </p>
      <Table
        columns={[
          ["member_number", "Number"],
          ["display_name", "Name"],
          ["status", "Status"],
        ]}
        records={members}
      />
    </div>
  );
}

function TrainerForm({ companyId, rows: trainers }: { companyId: string; rows: GymRecord[] }) {
  const save = useServerFn(saveGymTrainer);
  const mutation = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => save(input),
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Trainer"
        pending={mutation.isPending}
        onSubmit={(form) =>
          mutation.mutate({
            data: {
              companyId,
              payload: {
                display_name: form.get("display_name"),
                email: form.get("email"),
                kind: form.get("kind") || "contractor",
                commission_kind: form.get("commission_kind") || "percent",
                commission_bps: Number(form.get("commission_bps") || 0),
                certification_expires_on: form.get("certification_expires_on"),
              },
            },
          })
        }
      >
        <Field label="Name">
          <Input name="display_name" required />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" />
        </Field>
        <Field label="Kind">
          <Input name="kind" defaultValue="contractor" />
        </Field>
        <Field label="Commission kind">
          <Input name="commission_kind" defaultValue="percent" />
        </Field>
        <Field label="Rate in basis points">
          <Input name="commission_bps" defaultValue="1000" inputMode="numeric" />
        </Field>
        <Field label="Certification expires">
          <Input name="certification_expires_on" type="date" />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        Commission is calculated when a session is delivered and stays pending until it is approved.
        Approval posts an expense and a payable. Payroll runs stay in Payroll.
      </p>
      <Table
        columns={[
          ["display_name", "Name"],
          ["kind", "Kind"],
          ["commission_kind", "Commission"],
          ["certification_expires_on", "Certification"],
          ["status", "Status"],
        ]}
        records={trainers}
      />
    </div>
  );
}

function PackageForm({
  companyId,
  currency,
  data,
  money,
}: {
  companyId: string;
  currency: string;
  data: GymWorkspace;
  money: (minor: number) => string;
}) {
  const sell = useServerFn(sellGymPackage);
  const consume = useServerFn(consumeGymSession);
  const approve = useServerFn(approveGymCommission);
  const sale = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => sell(input),
  );
  const use = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => consume(input),
  );
  const approval = useGymMutation((input: { data: { companyId: string; commissionId: string } }) =>
    approve(input),
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Sell a session package"
        pending={sale.isPending}
        onSubmit={(form) =>
          sale.mutate({
            data: {
              companyId,
              payload: {
                member_id: form.get("member_id"),
                trainer_id: form.get("trainer_id"),
                sessions: Number(form.get("sessions") || 1),
                price_minor: Number(toMinorUnits(String(form.get("price") || "0"), currency)),
                idempotency_key: form.get("idempotency_key"),
                currency_code: currency,
              },
            },
          })
        }
      >
        <Field label="Member id">
          <Input name="member_id" required />
        </Field>
        <Field label="Trainer id">
          <Input name="trainer_id" />
        </Field>
        <Field label="Sessions">
          <Input name="sessions" defaultValue="10" inputMode="numeric" />
        </Field>
        <Field label="Price">
          <Input name="price" required inputMode="decimal" />
        </Field>
        <Field label="Idempotency key">
          <Input name="idempotency_key" required />
        </Field>
      </Form>
      <Form
        title="Deliver sessions"
        pending={use.isPending}
        onSubmit={(form) =>
          use.mutate({
            data: {
              companyId,
              payload: {
                package_id: form.get("package_id"),
                count: Number(form.get("count") || 1),
                idempotency_key: form.get("idempotency_key"),
              },
            },
          })
        }
      >
        <Field label="Package id">
          <Input name="package_id" required />
        </Field>
        <Field label="Count">
          <Input name="count" defaultValue="1" inputMode="numeric" />
        </Field>
        <Field label="Idempotency key">
          <Input name="idempotency_key" required />
        </Field>
      </Form>
      <Form
        title="Approve commission"
        pending={approval.isPending}
        onSubmit={(form) =>
          approval.mutate({
            data: { companyId, commissionId: String(form.get("commission_id") || "") },
          })
        }
      >
        <Field label="Commission id">
          <Input name="commission_id" required />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        Unused sessions stay a liability. The last session takes the rounding remainder. Liability
        shown{" "}
        {money(data.packages.reduce((sum, row) => sum + Number(row["liability_minor"] || 0), 0))}.
      </p>
      <Table
        columns={[
          ["id", "Package"],
          ["sessions_remaining", "Remaining"],
          ["liability_minor", "Liability"],
          ["status", "Status"],
        ]}
        records={data.packages}
      />
      <Table
        columns={[
          ["id", "Commission"],
          ["amount_minor", "Amount"],
          ["status", "Status"],
          ["journal_id", "Journal"],
        ]}
        records={data.commissions}
      />
    </div>
  );
}

function EquipmentForm({ companyId, rows: equipment }: { companyId: string; rows: GymRecord[] }) {
  const save = useServerFn(saveGymEquipment);
  const mutation = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => save(input),
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Equipment"
        pending={mutation.isPending}
        onSubmit={(form) =>
          mutation.mutate({
            data: {
              companyId,
              payload: {
                name: form.get("name"),
                category: form.get("category"),
                maintenance_due_on: form.get("maintenance_due_on"),
                fixed_asset_id: form.get("fixed_asset_id"),
                status: form.get("status") || "available",
              },
            },
          })
        }
      >
        <Field label="Name">
          <Input name="name" required />
        </Field>
        <Field label="Category">
          <Input name="category" defaultValue="cardio" />
        </Field>
        <Field label="Maintenance due">
          <Input name="maintenance_due_on" type="date" />
        </Field>
        <Field label="Fixed asset id">
          <Input name="fixed_asset_id" />
        </Field>
        <Field label="Status">
          <Input name="status" defaultValue="available" />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        Depreciation, disposal and the asset register stay in{" "}
        <Link to="/fixed-assets" className="underline">
          Fixed assets
        </Link>
        . This list is the operational record and can point at an existing asset.
      </p>
      <Table
        columns={[
          ["name", "Name"],
          ["status", "Status"],
          ["maintenance_due_on", "Maintenance"],
          ["fixed_asset_id", "Asset"],
        ]}
        records={equipment}
      />
    </div>
  );
}

function LeadForm({ companyId, rows: leads }: { companyId: string; rows: GymRecord[] }) {
  const save = useServerFn(saveGymLead);
  const mutation = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => save(input),
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Enquiry"
        pending={mutation.isPending}
        onSubmit={(form) =>
          mutation.mutate({
            data: {
              companyId,
              payload: { display_name: form.get("display_name"), email: form.get("email") },
            },
          })
        }
      >
        <Field label="Name">
          <Input name="display_name" required />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        Campaign sending, SMS and WhatsApp are not connected. This stores the enquiry only.
      </p>
      <Table
        columns={[
          ["display_name", "Name"],
          ["email", "Email"],
          ["status", "Status"],
        ]}
        records={leads}
      />
    </div>
  );
}

function BranchForm({ companyId, rows: branches }: { companyId: string; rows: GymRecord[] }) {
  const save = useServerFn(createGymBranch);
  const mutation = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => save(input),
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Branch"
        pending={mutation.isPending}
        onSubmit={(form) =>
          mutation.mutate({
            data: {
              companyId,
              payload: {
                code: form.get("code"),
                name: form.get("name"),
                kind: form.get("kind") || "branch",
                timezone: form.get("timezone") || "UTC",
              },
            },
          })
        }
      >
        <Field label="Code">
          <Input name="code" required />
        </Field>
        <Field label="Name">
          <Input name="name" required />
        </Field>
        <Field label="Kind">
          <Input name="kind" defaultValue="branch" />
        </Field>
        <Field label="Time zone">
          <Input name="timezone" defaultValue="UTC" />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        A franchise flag marks a location of this legal entity. A separate company keeps its own
        ledger. There is no cross-company consolidation on this screen.
      </p>
      <Table
        columns={[
          ["code", "Code"],
          ["name", "Name"],
          ["kind", "Kind"],
          ["status", "Status"],
        ]}
        records={branches}
      />
    </div>
  );
}

function BudgetForm({
  companyId,
  currency,
  rows: budgets,
}: {
  companyId: string;
  currency: string;
  rows: GymRecord[];
}) {
  const save = useServerFn(saveGymBudget);
  const mutation = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => save(input),
  );
  return (
    <div className="grid gap-3">
      <Form
        title="Monthly budget"
        pending={mutation.isPending}
        onSubmit={(form) =>
          mutation.mutate({
            data: {
              companyId,
              payload: {
                budget_year: Number(form.get("budget_year")),
                budget_month: Number(form.get("budget_month")),
                role: form.get("role") || "membership_revenue",
                amount_minor: Number(toMinorUnits(String(form.get("amount") || "0"), currency)),
              },
            },
          })
        }
      >
        <Field label="Year">
          <Input name="budget_year" defaultValue="2026" inputMode="numeric" />
        </Field>
        <Field label="Month">
          <Input name="budget_month" defaultValue="1" inputMode="numeric" />
        </Field>
        <Field label="Role">
          <Input name="role" defaultValue="membership_revenue" />
        </Field>
        <Field label="Amount">
          <Input name="amount" required inputMode="decimal" />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        Budgets are management targets. They are not journals. Compare them with recognised revenue
        on the dashboard.
      </p>
      <Table
        columns={[
          ["budget_year", "Year"],
          ["budget_month", "Month"],
          ["role", "Role"],
          ["amount_minor", "Amount minor"],
        ]}
        records={budgets}
      />
    </div>
  );
}

function PortalPanel({ companyId, currency }: { companyId: string; currency: string }) {
  const { can } = useCan();
  const fetchPortal = useServerFn(getGymPortal);
  const link = useServerFn(linkGymPortal);
  const linkMutation = useGymMutation(
    (input: { data: { companyId: string; memberId: string; userId: string } }) => link(input),
  );
  const portal = useQuery({
    queryKey: ["gym-portal", companyId],
    queryFn: () => fetchPortal({ data: { companyId } }),
    retry: false,
  });
  if (portal.isError) return <QueryErrorState queries={[portal]} />;
  if (portal.isPending || !portal.data) return <LoadingState />;
  const mine = portal.data.linked ? (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{portal.data.display_name}</CardTitle>
        <CardDescription>
          {portal.data.member_number} · {portal.data.status}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <p>Outstanding {fromMinorUnits(portal.data.outstanding_minor, currency)}</p>
        <p>Sessions remaining {portal.data.sessions_remaining}</p>
        <Table
          columns={[
            ["membership_number", "Membership"],
            ["status", "Status"],
            ["starts_on", "Starts"],
            ["ends_on", "Ends"],
          ]}
          records={portal.data.memberships}
        />
      </CardContent>
    </Card>
  ) : (
    <EmptyState
      title="No member profile is linked to this sign-in"
      description="This page shows only the member linked to the signed-in user."
    />
  );
  if (!can("gym.portal.manage")) return mine;
  return (
    <div className="grid gap-3">
      <Form
        title="Link a sign-in"
        pending={linkMutation.isPending}
        onSubmit={(form) =>
          linkMutation.mutate({
            data: {
              companyId,
              memberId: String(form.get("member_id") || ""),
              userId: String(form.get("user_id") || ""),
            },
          })
        }
      >
        <Field label="Member id">
          <Input name="member_id" required />
        </Field>
        <Field label="Sign-in user id">
          <Input name="user_id" required />
        </Field>
      </Form>
      <p className="text-xs text-muted-foreground">
        The sign-in must already belong to this organisation. One sign-in can link to one member.
        The member view below is only the signed-in user.
      </p>
      {mine}
    </div>
  );
}

function ReportsPanel({ data, money }: { data: GymWorkspace; money: (minor: number) => string }) {
  return (
    <div className="grid gap-3 text-sm">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Gym management figures</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          <p>Recognised membership revenue {money(data.kpis.recognised_minor)}</p>
          <p>Deferred membership revenue {money(data.kpis.deferred_minor)}</p>
          <p>Outstanding member balances {money(data.kpis.outstanding_minor)}</p>
          <p>Collected {money(data.kpis.collected_minor)}</p>
        </CardContent>
      </Card>
      <p>
        Profit and loss, balance sheet, trial balance and cash flow stay in{" "}
        <Link to="/reports" className="underline">
          Reports
        </Link>
        . Bank matching stays in{" "}
        <Link to="/banking" className="underline">
          Banking
        </Link>
        . Sales documents are not created again for these journals, because a second invoice would
        post the same revenue twice.
      </p>
    </div>
  );
}

function SettingsForm({ companyId, data }: { companyId: string; data: GymWorkspace }) {
  const save = useServerFn(saveGymSettings);
  const mutation = useGymMutation(
    (input: { data: { companyId: string; payload: Record<string, unknown> } }) => save(input),
  );
  const [enabled, setEnabled] = useState(data.settings.enabled);
  return (
    <Form
      title="Activation and ledger mapping"
      pending={mutation.isPending}
      onSubmit={(form) => {
        const account_map: Record<string, string> = { ...data.settings.account_map };
        for (const role of ACCOUNT_ROLES) {
          const value = String(form.get(role) || "").trim();
          if (value) account_map[role] = value;
        }
        mutation.mutate({
          data: {
            companyId,
            payload: {
              enabled,
              currency_code: form.get("currency_code") || data.settings.currency_code,
              country_code: form.get("country_code") || data.settings.country_code,
              timezone: form.get("timezone") || data.settings.timezone,
              account_map,
            },
          },
        });
      }}
    >
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        Module activated
      </label>
      <Field label="Currency">
        <Input name="currency_code" defaultValue={data.settings.currency_code} />
      </Field>
      <Field label="Country">
        <Input name="country_code" defaultValue={data.settings.country_code} />
      </Field>
      <Field label="Time zone">
        <Input name="timezone" defaultValue={data.settings.timezone} />
      </Field>
      {ACCOUNT_ROLES.map((role) => (
        <Field key={role} label={role}>
          <Input name={role} defaultValue={data.settings.account_map[role] ?? ""} />
        </Field>
      ))}
    </Form>
  );
}

function Form({
  title,
  pending,
  onSubmit,
  children,
}: {
  title: string;
  pending: boolean;
  onSubmit: (form: FormData) => void;
  children: ReactNode;
}) {
  return (
    <form
      className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget));
      }}
    >
      <h2 className="sm:col-span-2 text-sm font-semibold">{title}</h2>
      {children}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving" : "Save"}
        </Button>
      </div>
    </form>
  );
}

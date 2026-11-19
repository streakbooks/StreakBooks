import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LookupSelect } from "@/components/lookup";
import { MultiLookupSelect } from "@/components/lookup/MultiLookupSelect";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMinorAmount, parseAmountToMinor } from "@/lib/billing/domain/money";
import {
  addPartnerUser,
  adjustPartnerCommission,
  decideCommissionRule,
  decidePartnerPayout,
  decideProgramChange,
  getPartnerProgramAdmin,
  requestPartnerPayout,
  requestProgramChange,
  reviewPartner,
  saveCommissionRule,
  type CommissionRule,
  type PartnerProgramAdminData,
} from "@/lib/billing/partner-program.functions";
import { ISO_COUNTRIES } from "@/lib/billing/reference/iso-reference-data";

const queryKey = ["platform-partner-program"] as const;
const COUNTRY_OPTIONS = ISO_COUNTRIES.map((item) => ({
  id: item.code,
  label: item.name,
  code: item.code,
}));
const CURRENCY_OPTIONS = ["INR", "USD", "GBP", "AUD", "NZD"].map((code) => ({
  id: code,
  label: code,
}));
const PLAN_OPTIONS = [
  { id: "standard", label: "Standard" },
  { id: "pro", label: "Pro" },
  { id: "business", label: "Business" },
];

function money(minor: number, currency: string): string {
  return formatMinorAmount(BigInt(minor), currency);
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function useRefresh() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey });
}

function ruleSummary(rule: CommissionRule): string {
  const value =
    rule.kind === "percent"
      ? `${((rule.percentBps ?? 0) / 100).toFixed(2)}% of net revenue`
      : `${money(rule.fixedMinor ?? 0, rule.fixedCurrency ?? "USD")} per invoice`;
  const scope = [
    rule.partnerName ?? "all partners",
    rule.planCodes?.length ? rule.planCodes.join(", ") : "all plans",
    rule.countries?.length ? rule.countries.join(", ") : "all countries",
  ].join(" · ");
  const duration = rule.durationMonths ? `${rule.durationMonths} months` : "no end";
  return `${value} · ${scope} · ${duration} · hold ${rule.holdDays} days · minimum payout ${money(
    rule.minPayoutMinor,
    rule.minPayoutCurrency,
  )} · from ${rule.effectiveFrom}${rule.effectiveTo ? ` to ${rule.effectiveTo}` : ""}`;
}

export function PartnerProgramAdmin({ canEdit, isOwner }: { canEdit: boolean; isOwner: boolean }) {
  const load = useServerFn(getPartnerProgramAdmin);
  const query = useQuery({ queryKey, queryFn: () => load(), retry: false });
  const data = query.data;
  return (
    <section className="space-y-5" aria-labelledby="partner-program-heading">
      <header className="space-y-1">
        <h2 id="partner-program-heading" className="text-xl font-semibold">
          CA partner programme
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Nothing is attributed until owners set an attribution window. Settings, commission rules
          and payouts each need a second platform owner. Payouts are manual records and also need
          PARTNER_PAYOUTS_ENABLED on the server.
        </p>
      </header>
      {query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load partner programme" />
      ) : null}
      {data ? (
        <>
          <ProgramSettings data={data} canEdit={canEdit} isOwner={isOwner} />
          <Partners data={data} canEdit={canEdit} />
          <Rules data={data} canEdit={canEdit} isOwner={isOwner} />
          <Payouts data={data} canEdit={canEdit} isOwner={isOwner} />
        </>
      ) : null}
    </section>
  );
}

function ProgramSettings({
  data,
  canEdit,
  isOwner,
}: {
  data: PartnerProgramAdminData;
  canEdit: boolean;
  isOwner: boolean;
}) {
  const request = useServerFn(requestProgramChange);
  const decide = useServerFn(decideProgramChange);
  const refresh = useRefresh();
  const [form, setForm] = useState({
    model: data.program.attributionModel as "last_touch" | "first_touch",
    window: data.program.attributionWindowDays?.toString() ?? "",
    payouts: data.program.payoutsEnabled,
    reference: data.program.regulatoryReviewReference ?? "",
    reason: "",
  });
  const requestM = useMutation({
    mutationFn: () =>
      request({
        data: {
          change: {
            attributionModel: form.model,
            attributionWindowDays: form.window.trim() ? Number(form.window) : null,
            payoutsEnabled: form.payouts,
            regulatoryReviewReference: form.reference,
          },
          reason: form.reason,
        },
      }),
    onSuccess: () => {
      toast.success("Change requested. Another owner must approve it.");
      refresh();
    },
    onError: (error) => toast.error(errorText(error, "The change could not be requested.")),
  });
  const decideM = useMutation({
    mutationFn: (input: { changeId: string; approve: boolean }) =>
      decide({ data: { ...input, reason: input.approve ? "Second owner approval" : "Rejected" } }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorText(error, "The decision could not be saved.")),
  });
  const pending = data.changes.filter((change) => change.status === "pending");
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">Programme settings</h3>
      <p className="text-sm">
        Attribution: {data.program.attributionModel.replace("_", "-")} ·{" "}
        {data.program.attributionWindowDays
          ? `${data.program.attributionWindowDays}-day window`
          : "no window set (programme closed)"}{" "}
        · payouts {data.program.payoutsEnabled ? "enabled" : "disabled"}
        {data.program.regulatoryReviewReference
          ? ` · review ${data.program.regulatoryReviewReference}`
          : ""}{" "}
        · server switch {data.payoutSwitchOn ? "on" : "off"}
      </p>
      {pending.length ? (
        <ul className="space-y-1 text-sm">
          {pending.map((change) => (
            <li key={change.id} className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">pending</Badge>
              <span className="font-mono text-xs">{JSON.stringify(change.change)}</span>
              <span className="text-muted-foreground">{change.reason}</span>
              {isOwner && change.requestedBy !== data.viewer ? (
                <>
                  <Button
                    size="sm"
                    disabled={decideM.isPending}
                    onClick={() => decideM.mutate({ changeId: change.id, approve: true })}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={decideM.isPending}
                    onClick={() => decideM.mutate({ changeId: change.id, approve: false })}
                  >
                    Reject
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? (
        <form
          className="grid gap-3 sm:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            requestM.mutate();
          }}
        >
          <label className="text-sm">
            Attribution
            <select
              className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
              value={form.model}
              onChange={(e) =>
                setForm({
                  ...form,
                  model: e.target.value === "first_touch" ? "first_touch" : "last_touch",
                })
              }
            >
              <option value="last_touch">Last touch</option>
              <option value="first_touch">First touch</option>
            </select>
          </label>
          <label className="text-sm">
            Window (days, empty closes)
            <Input
              className="mt-1"
              inputMode="numeric"
              value={form.window}
              onChange={(e) => setForm({ ...form, window: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Regulatory review reference
            <Input
              className="mt-1"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 pt-6 text-sm">
            <input
              type="checkbox"
              checked={form.payouts}
              onChange={(e) => setForm({ ...form, payouts: e.target.checked })}
            />
            Payouts enabled
          </label>
          <label className="text-sm sm:col-span-3">
            Reason
            <Input
              className="mt-1"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={requestM.isPending || form.reason.trim().length < 3}>
              Request change
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Partners({ data, canEdit }: { data: PartnerProgramAdminData; canEdit: boolean }) {
  const review = useServerFn(reviewPartner);
  const addUser = useServerFn(addPartnerUser);
  const refresh = useRefresh();
  const [selected, setSelected] = useState("");
  const [evidence, setEvidence] = useState("");
  const [reason, setReason] = useState("");
  const [email, setEmail] = useState("");
  const reviewM = useMutation({
    mutationFn: (decision: "approve" | "reject" | "suspend") =>
      review({ data: { partnerId: selected, decision, evidence, reason } }),
    onSuccess: () => {
      toast.success("Partner updated.");
      refresh();
    },
    onError: (error) => toast.error(errorText(error, "The partner could not be updated.")),
  });
  const userM = useMutation({
    mutationFn: () => addUser({ data: { partnerId: selected, email, role: "member", reason } }),
    onSuccess: () => {
      toast.success("Partner user added.");
      refresh();
    },
    onError: (error) => toast.error(errorText(error, "The user could not be added.")),
  });
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">Partners</h3>
      {data.partners.length === 0 ? (
        <p className="text-sm text-muted-foreground">No partners yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {data.partners.map((partner) => (
            <li key={partner.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={partner.status === "approved" ? "success" : "secondary"}>
                {partner.status}
              </Badge>
              <span className="font-medium">{partner.name}</span>
              <span className="text-muted-foreground">
                {partner.countryCode ?? ""}
                {partner.membershipReference ? ` · ${partner.membershipReference}` : ""}
                {partner.verificationEvidence ? ` · verified: ${partner.verificationEvidence}` : ""}
                {` · ${partner.referrals} referrals · ${partner.codes} codes`}
                {partner.balances
                  .map((b) => ` · ${b.currency} available ${money(b.availableMinor, b.currency)}`)
                  .join("")}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canEdit && data.partners.length ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="text-sm">
            Partner
            <LookupSelect
              options={data.partners.map((partner) => ({
                id: partner.id,
                label: partner.name,
                meta: partner.status,
              }))}
              value={selected}
              onChange={setSelected}
              ariaLabel="Partner"
            />
          </div>
          <label className="text-sm">
            What was verified
            <Input
              className="mt-1"
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>
          <label className="text-sm">
            Reason
            <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              size="sm"
              disabled={!selected || reviewM.isPending}
              onClick={() => reviewM.mutate("approve")}
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!selected || reviewM.isPending}
              onClick={() => reviewM.mutate("reject")}
            >
              Reject
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!selected || reviewM.isPending}
              onClick={() => reviewM.mutate("suspend")}
            >
              Suspend
            </Button>
          </div>
          <label className="text-sm sm:col-span-3">
            Add a partner user by email (member)
            <Input className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <div className="flex items-end">
            <Button
              size="sm"
              variant="outline"
              disabled={!selected || !email || userM.isPending}
              onClick={() => userM.mutate()}
            >
              Add user
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Rules({
  data,
  canEdit,
  isOwner,
}: {
  data: PartnerProgramAdminData;
  canEdit: boolean;
  isOwner: boolean;
}) {
  const decide = useServerFn(decideCommissionRule);
  const refresh = useRefresh();
  const [endDate, setEndDate] = useState("");
  const decideM = useMutation({
    mutationFn: (input: { ruleId: string; action: "approve" | "retire" }) =>
      decide({
        data: {
          ...input,
          effectiveTo: input.action === "retire" ? endDate : "",
          reason: input.action === "approve" ? "Second owner approval" : "Retired",
        },
      }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorText(error, "The rule could not be updated.")),
  });
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">Commission rules</h3>
      {data.rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No commission rule is configured, so no commission accrues.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {data.rules.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={rule.status === "approved" ? "success" : "secondary"}>
                {rule.status}
              </Badge>
              <span className="font-medium">{rule.name}</span>
              <span className="text-muted-foreground">{ruleSummary(rule)}</span>
              {isOwner && rule.status === "draft" && rule.createdBy !== data.viewer ? (
                <Button
                  size="sm"
                  disabled={decideM.isPending}
                  onClick={() => decideM.mutate({ ruleId: rule.id, action: "approve" })}
                >
                  Approve
                </Button>
              ) : null}
              {canEdit && rule.status !== "retired" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={decideM.isPending}
                  onClick={() => decideM.mutate({ ruleId: rule.id, action: "retire" })}
                >
                  {rule.status === "draft" ? "Discard" : "Retire on end date"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <label className="block max-w-xs text-sm">
          End date for retiring
          <Input
            className="mt-1"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </label>
      ) : null}
      {canEdit ? <RuleForm data={data} /> : null}
    </div>
  );
}

function RuleForm({ data }: { data: PartnerProgramAdminData }) {
  const save = useServerFn(saveCommissionRule);
  const refresh = useRefresh();
  const [form, setForm] = useState({
    name: "",
    partnerId: "",
    kind: "percent" as "percent" | "fixed",
    percent: "",
    fixed: "",
    fixedCurrency: "INR",
    months: "",
    holdDays: "",
    minPayout: "",
    minCurrency: "INR",
    from: "",
    to: "",
    reason: "",
  });
  const [plans, setPlans] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const update = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
    setForm((current) => ({ ...current, [field]: value }));
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          id: null,
          name: form.name,
          partnerId: form.partnerId || null,
          kind: form.kind,
          percentBps: form.kind === "percent" ? Math.round(Number(form.percent) * 100) : null,
          fixedMinor:
            form.kind === "fixed" && form.fixed.trim()
              ? Number(parseAmountToMinor(form.fixed.trim(), form.fixedCurrency))
              : null,
          fixedCurrency: form.kind === "fixed" ? form.fixedCurrency : null,
          planCodes: plans,
          countries,
          durationMonths: form.months.trim() ? Number(form.months) : null,
          holdDays: Number(form.holdDays),
          minPayoutMinor: Number(
            parseAmountToMinor(form.minPayout.trim() || "0", form.minCurrency),
          ),
          minPayoutCurrency: form.minCurrency,
          effectiveFrom: form.from,
          effectiveTo: form.to,
          reason: form.reason,
        },
      }),
    onSuccess: () => {
      toast.success("Draft saved. Another owner must approve it.");
      refresh();
    },
    onError: (error) => toast.error(errorText(error, "The rule could not be saved.")),
  });
  return (
    <form
      className="grid gap-3 border-t pt-3 sm:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <h4 className="text-sm font-medium sm:col-span-4">Draft a rule</h4>
      <label className="text-sm">
        Name
        <Input
          className="mt-1"
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </label>
      <div className="text-sm">
        Partner (empty for all)
        <LookupSelect
          options={data.partners
            .filter((partner) => partner.status === "approved")
            .map((partner) => ({ id: partner.id, label: partner.name }))}
          value={form.partnerId}
          onChange={(id) => update("partnerId", id)}
          ariaLabel="Rule partner"
        />
      </div>
      <label className="text-sm">
        Commission
        <select
          className="mt-1 flex h-9 w-full rounded-md border bg-transparent px-2"
          value={form.kind}
          onChange={(e) => update("kind", e.target.value === "fixed" ? "fixed" : "percent")}
        >
          <option value="percent">Percentage of net revenue</option>
          <option value="fixed">Fixed per invoice</option>
        </select>
      </label>
      {form.kind === "percent" ? (
        <label className="text-sm">
          Percent
          <Input
            className="mt-1"
            inputMode="decimal"
            value={form.percent}
            onChange={(e) => update("percent", e.target.value)}
          />
        </label>
      ) : (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <label>
            Amount
            <Input
              className="mt-1"
              inputMode="decimal"
              value={form.fixed}
              onChange={(e) => update("fixed", e.target.value)}
            />
          </label>
          <div>
            Currency
            <LookupSelect
              options={CURRENCY_OPTIONS}
              value={form.fixedCurrency}
              onChange={(id) => update("fixedCurrency", id)}
              ariaLabel="Commission currency"
              allowClear={false}
            />
          </div>
        </div>
      )}
      <div className="text-sm">
        Plans (empty for all)
        <MultiLookupSelect
          options={PLAN_OPTIONS}
          values={plans}
          onValuesChange={setPlans}
          ariaLabel="Rule plans"
        />
      </div>
      <div className="text-sm">
        Countries (empty for all)
        <MultiLookupSelect
          options={COUNTRY_OPTIONS}
          values={countries}
          onValuesChange={setCountries}
          ariaLabel="Rule countries"
        />
      </div>
      <label className="text-sm">
        Months from first payment (empty: no end)
        <Input
          className="mt-1"
          inputMode="numeric"
          value={form.months}
          onChange={(e) => update("months", e.target.value)}
        />
      </label>
      <label className="text-sm">
        Hold days
        <Input
          className="mt-1"
          inputMode="numeric"
          value={form.holdDays}
          onChange={(e) => update("holdDays", e.target.value)}
        />
      </label>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label>
          Minimum payout
          <Input
            className="mt-1"
            inputMode="decimal"
            value={form.minPayout}
            onChange={(e) => update("minPayout", e.target.value)}
          />
        </label>
        <div>
          Currency
          <LookupSelect
            options={CURRENCY_OPTIONS}
            value={form.minCurrency}
            onChange={(id) => update("minCurrency", id)}
            ariaLabel="Minimum payout currency"
            allowClear={false}
          />
        </div>
      </div>
      <label className="text-sm">
        Effective from
        <Input
          className="mt-1"
          type="date"
          value={form.from}
          onChange={(e) => update("from", e.target.value)}
        />
      </label>
      <label className="text-sm">
        Effective to (optional)
        <Input
          className="mt-1"
          type="date"
          value={form.to}
          onChange={(e) => update("to", e.target.value)}
        />
      </label>
      <label className="text-sm sm:col-span-3">
        Reason
        <Input
          className="mt-1"
          value={form.reason}
          onChange={(e) => update("reason", e.target.value)}
        />
      </label>
      <div className="flex items-end">
        <Button
          type="submit"
          disabled={mutation.isPending || !form.name || !form.from || !form.holdDays}
        >
          Save draft
        </Button>
      </div>
    </form>
  );
}

function Payouts({
  data,
  canEdit,
  isOwner,
}: {
  data: PartnerProgramAdminData;
  canEdit: boolean;
  isOwner: boolean;
}) {
  const request = useServerFn(requestPartnerPayout);
  const decide = useServerFn(decidePartnerPayout);
  const adjust = useServerFn(adjustPartnerCommission);
  const refresh = useRefresh();
  const [partnerId, setPartnerId] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [reason, setReason] = useState("");
  const [reference, setReference] = useState("");
  const [adjustment, setAdjustment] = useState("");
  const requestM = useMutation({
    mutationFn: () => request({ data: { partnerId, currency, reason } }),
    onSuccess: (result) => {
      toast.success(`Payout of ${money(result.amountMinor, result.currency)} requested.`);
      refresh();
    },
    onError: (error) => toast.error(errorText(error, "The payout could not be requested.")),
  });
  const decideM = useMutation({
    mutationFn: (input: { payoutId: string; decision: "approve" | "mark_paid" | "cancel" }) =>
      decide({
        data: {
          ...input,
          reference: input.decision === "mark_paid" ? reference : "",
          reason: reason || "Payout decision",
        },
      }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorText(error, "The payout could not be updated.")),
  });
  const adjustM = useMutation({
    mutationFn: () =>
      adjust({
        data: {
          partnerId,
          currency,
          amountMinor: Number(parseAmountToMinor(adjustment.trim(), currency)),
          reason,
        },
      }),
    onSuccess: () => {
      toast.success("Adjustment recorded.");
      refresh();
    },
    onError: (error) => toast.error(errorText(error, "The adjustment could not be recorded.")),
  });
  const enabled = data.program.payoutsEnabled && data.payoutSwitchOn;
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <h3 className="font-medium">Payouts and adjustments</h3>
      <p className="text-sm text-muted-foreground">
        {enabled
          ? "Payouts are recorded here and paid by manual bank transfer. Nothing is sent automatically."
          : "Payouts are disabled. Approved commission stays in the ledger."}
      </p>
      {data.payouts.length ? (
        <ul className="space-y-1 text-sm">
          {data.payouts.map((payout) => (
            <li key={payout.id} className="flex flex-wrap items-center gap-2">
              <Badge variant={payout.status === "paid" ? "success" : "secondary"}>
                {payout.status}
              </Badge>
              <span>
                {payout.partnerName} · {money(payout.amountMinor, payout.currency)}
                {payout.paymentReference ? ` · ref ${payout.paymentReference}` : ""}
              </span>
              {isOwner &&
              enabled &&
              payout.status === "requested" &&
              payout.requestedBy !== data.viewer ? (
                <Button
                  size="sm"
                  disabled={decideM.isPending}
                  onClick={() => decideM.mutate({ payoutId: payout.id, decision: "approve" })}
                >
                  Approve
                </Button>
              ) : null}
              {canEdit && enabled && payout.status === "approved" ? (
                <Button
                  size="sm"
                  disabled={decideM.isPending || reference.trim().length < 3}
                  onClick={() => decideM.mutate({ payoutId: payout.id, decision: "mark_paid" })}
                >
                  Mark paid
                </Button>
              ) : null}
              {canEdit && (payout.status === "requested" || payout.status === "approved") ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={decideM.isPending}
                  onClick={() => decideM.mutate({ payoutId: payout.id, decision: "cancel" })}
                >
                  Cancel
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="text-sm">
            Partner
            <LookupSelect
              options={data.partners
                .filter((partner) => partner.status === "approved")
                .map((partner) => ({ id: partner.id, label: partner.name }))}
              value={partnerId}
              onChange={setPartnerId}
              ariaLabel="Payout partner"
            />
          </div>
          <div className="text-sm">
            Currency
            <LookupSelect
              options={CURRENCY_OPTIONS}
              value={currency}
              onChange={setCurrency}
              ariaLabel="Payout currency"
              allowClear={false}
            />
          </div>
          <label className="text-sm">
            Reason
            <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <label className="text-sm">
            Bank transfer reference
            <Input
              className="mt-1"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
            <Button
              size="sm"
              disabled={!enabled || !partnerId || requestM.isPending}
              onClick={() => requestM.mutate()}
            >
              Request payout of available balance
            </Button>
          </div>
          {isOwner ? (
            <>
              <label className="text-sm">
                Adjustment (negative to deduct)
                <Input
                  className="mt-1"
                  inputMode="decimal"
                  value={adjustment}
                  onChange={(e) => setAdjustment(e.target.value)}
                />
              </label>
              <div className="flex items-end">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!partnerId || !adjustment.trim() || adjustM.isPending}
                  onClick={() => adjustM.mutate()}
                >
                  Record adjustment
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

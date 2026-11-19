import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  recordCashClassificationException,
  getCashInventoryTrace,
  approveCashInventory,
  approveCashOpening,
  approveCashPolicy,
  listCashClassifications,
  listCashClassificationDocuments,
  resolveCashClassificationException,
  type CashPolicyRecord,
  type CashInventoryRecord,
  type CashOpeningRecord,
  type CashExceptionRecord,
  type CashSourceDocument,
} from "@/lib/accounting/cash-classification.functions";
import { cashClassificationExceptions } from "@/lib/reports/cash-classification";
import { CASH_POLICY_KINDS } from "@/lib/accounting/cash-classification-contracts";
import { listAccounts, listJournals, type AccountRow } from "@/lib/accounting/accounting.functions";
import { exportVisibleReport } from "@/lib/reports/visible-export.functions";
import { downloadReportFile } from "@/lib/reports/download";
import { listTaxCodes } from "@/lib/tax/tax.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { fromMinorUnits } from "@/lib/accounting/money";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import { useCan } from "@/hooks/use-can";
import { AccountLookup, LookupSelect } from "@/components/lookup";
import { MultiLookupSelect } from "@/components/lookup/MultiLookupSelect";
import type { LookupOption } from "@/lib/lookup/types";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ReviewKind = "policy" | "opening" | "inventory";
type EvidenceFields = { reference: string; note: string; confirmed: boolean };
const emptyEvidence = (): EvidenceFields => ({ reference: "", note: "", confirmed: false });
const policyLabels: Record<(typeof CASH_POLICY_KINDS)[number], string> = {
  balance_sheet: "Verified balance-sheet treatment",
  conversion: "Opening / conversion balance",
  inventory: "Inventory purchases",
  prepaid: "Prepaid expenses",
  deferred: "Deferred revenue",
  payroll_wages: "Payroll wages",
  payroll_employer_tax: "Employer taxes and contributions",
  payroll_deductions: "Employee deductions",
};
const money = (amount: string, currency: string) =>
  `${fromMinorUnits(BigInt(amount), currency)} ${currency}`;

function EvidenceFieldsForm({
  value,
  onChange,
}: {
  value: EvidenceFields;
  onChange: (v: EvidenceFields) => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="cash-evidence-reference">Supporting record reference</Label>
        <Input
          id="cash-evidence-reference"
          required
          minLength={3}
          maxLength={500}
          value={value.reference}
          onChange={(e) => onChange({ ...value, reference: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="cash-policy-note">Verified classification and accounting policy</Label>
        <Textarea
          id="cash-policy-note"
          required
          minLength={10}
          maxLength={4000}
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
        />
      </div>
      <Label className="flex items-start gap-2 font-normal">
        <input
          type="checkbox"
          required
          checked={value.confirmed}
          onChange={(e) => onChange({ ...value, confirmed: e.target.checked })}
        />
        I have verified the supporting records, account classification and historical recognition
        treatment.
      </Label>
    </>
  );
}

/** Searches the existing posted journal lookup; a policy never establishes a payment by itself. */
function JournalEvidenceLookup({
  companyId,
  values,
  onChange,
  multiple = true,
  label = "Supporting posted journals",
}: {
  companyId: string;
  values: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  label?: string;
}) {
  const fetch = useServerFn(listJournals);
  const [search, setSearch] = useState("");
  const known = useRef(new Map<string, LookupOption>());
  const q = useQuery({
    queryKey: ["cash-evidence-journals", companyId, search],
    queryFn: () => fetch({ data: { companyId, search, limit: 100 } }),
  });
  for (const journal of q.data ?? [])
    if (journal.status === "posted")
      known.current.set(journal.id, {
        id: journal.id,
        label: `Journal ${journal.journal_number}`,
        description: journal.memo,
        meta: `${journal.journal_date} · ${journal.currency_code}`,
        companyId,
      });
  const options = [
    ...new Map([
      ...(q.data ?? [])
        .filter((j) => j.status === "posted")
        .map((j) => [j.id, known.current.get(j.id)!] as const),
      ...values.map((id) => [id, known.current.get(id) ?? { id, label: id }] as const),
    ]).values(),
  ];
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        aria-label={`Search ${label.toLowerCase()}`}
        placeholder="Search journal number or memo"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {q.isError ? (
        <QueryErrorState queries={[q]} title="Could not load supporting journals" />
      ) : null}
      {multiple ? (
        <MultiLookupSelect
          options={options}
          values={values}
          onValuesChange={onChange}
          ariaLabel={label}
          loading={q.isPending}
          disabled={q.isError}
        />
      ) : (
        <LookupSelect
          options={options}
          value={values[0] ?? ""}
          onChange={(id) => onChange(id ? [id] : [])}
          ariaLabel={label}
          loading={q.isPending}
          disabled={q.isError}
        />
      )}
      <div className="flex flex-wrap gap-2">
        {values.map((id) => (
          <Link
            key={id}
            className="text-xs underline"
            to="/accounting"
            search={{ tab: "journals", journal: id }}
          >
            Inspect {known.current.get(id)?.label ?? "journal"}
          </Link>
        ))}
      </div>
    </div>
  );
}

function DocumentLookup({
  companyId,
  sourceKind,
  openingOnly,
  value,
  onChange,
}: {
  companyId: string;
  sourceKind: "sales_invoice" | "purchase_bill";
  openingOnly: boolean;
  value: CashSourceDocument | null;
  onChange: (v: CashSourceDocument | null) => void;
}) {
  const fetch = useServerFn(listCashClassificationDocuments);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["cash-classification-documents", companyId, sourceKind, openingOnly, search, page],
    queryFn: () => fetch({ data: { companyId, sourceKind, openingOnly, search, page } }),
  });
  const rows = [
    ...new Map([...(q.data?.rows ?? []), ...(value ? [value] : [])].map((r) => [r.id, r])).values(),
  ];
  return (
    <div className="space-y-2">
      <Label>
        {sourceKind === "sales_invoice"
          ? "Opening customer invoice"
          : openingOnly
            ? "Opening supplier bill"
            : "Purchase bill"}
      </Label>
      <Input
        aria-label="Search source document number"
        placeholder="Search document number"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
      />
      {q.isError ? (
        <QueryErrorState queries={[q]} title="Could not load source documents" />
      ) : (
        <LookupSelect
          options={rows.map((r) => ({
            id: r.id,
            label: r.label,
            description: r.date,
            meta: money(r.grossMinor, r.currency),
            companyId,
          }))}
          value={value?.id ?? ""}
          onChange={(id) => onChange(rows.find((r) => r.id === id) ?? null)}
          ariaLabel="Source document"
          loading={q.isPending}
        />
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!page}
          onClick={() => setPage(page - 1)}
        >
          Previous
        </Button>
        <span>{q.data?.total ?? 0} matching documents</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={(page + 1) * 50 >= (q.data?.total ?? 0)}
          onClick={() => setPage(page + 1)}
        >
          Next
        </Button>
      </div>
      {value ? (
        <p className="text-sm">
          {value.date} · {money(value.grossMinor, value.currency)} ·{" "}
          <Link
            className="underline"
            to="/accounting"
            search={{ tab: "journals", journal: value.postedJournalId }}
          >
            Inspect journal {value.journal.journal_number}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function PolicyForm({
  companyId,
  accounts,
  previous,
  sourceAccountId,
  onApproved,
}: {
  companyId: string;
  accounts: AccountRow[];
  previous: CashPolicyRecord | null;
  sourceAccountId: string | null;
  onApproved: () => Promise<void>;
}) {
  const approve = useServerFn(approveCashPolicy);
  const [kind, setKind] = useState<(typeof CASH_POLICY_KINDS)[number]>(previous?.kind ?? "prepaid");
  const [source, setSource] = useState(previous?.source_account_id ?? sourceAccountId ?? "");
  const [target, setTarget] = useState(previous?.recognition_account_id ?? "");

  const [from, setFrom] = useState(previous?.effective_from ?? "");
  const [to, setTo] = useState(previous?.effective_to ?? "");
  const [journals, setJournals] = useState(previous?.evidence_journal_ids ?? []);
  const [evidence, setEvidence] = useState(emptyEvidence);
  const mutation = useMutation({
    mutationFn: () =>
      approve({
        data: {
          companyId,
          payload: {
            kind,
            source_account_id: source,
            recognition_account_id: target,
            equity_account_id: null,
            effective_from: from,
            effective_to: to || null,
            evidence_journal_ids: journals,
            supersedes_id: previous?.id ?? null,
            evidence_reference: evidence.reference,
            policy_note: evidence.note,
            user_confirmed: evidence.confirmed as true,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Verified cash policy approved");
      await onApproved();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          A policy classifies verified cash movements. Select the posted source evidence; unpaid
          accruals and later noncash releases do not become cash transactions.
        </p>
        {previous ? (
          <p>
            Revising approved version {previous.version}. The existing approval remains in the audit
            history.
          </p>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cash-policy-kind">Policy type</Label>
            <select
              id="cash-policy-kind"
              className="w-full rounded-md border bg-background p-2"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as typeof kind);
                setTarget("");
              }}
              disabled={Boolean(previous)}
            >
              {/* lookup-fixed-enum: Verified cash classification types. */}
              {CASH_POLICY_KINDS.map((k) => (
                <option key={k} value={k}>
                  {policyLabels[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Source account</Label>
            <AccountLookup
              companyId={companyId}
              accounts={accounts.filter((a) =>
                (kind === "conversion"
                  ? ["asset", "liability", "equity", "income", "expense"]
                  : ["asset", "liability", "equity"]
                ).includes(a.account_type),
              )}
              value={source}
              onChange={setSource}
              ariaLabel="Cash classification source account"
              disabled={Boolean(previous)}
            />
          </div>
          <div className="space-y-2">
            <Label>Recognition account</Label>
            <AccountLookup
              companyId={companyId}
              accounts={accounts.filter((a) =>
                kind === "balance_sheet"
                  ? a.id === source
                  : a.account_type ===
                    (kind === "conversion" ? "equity" : kind === "deferred" ? "income" : "expense"),
              )}
              value={target}
              onChange={setTarget}
              ariaLabel="Cash recognition account"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cash-policy-from">Effective from</Label>
            <Input
              id="cash-policy-from"
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cash-policy-to">Effective through (optional)</Label>
            <Input
              id="cash-policy-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
        <JournalEvidenceLookup companyId={companyId} values={journals} onChange={setJournals} />
        <EvidenceFieldsForm value={evidence} onChange={setEvidence} />
        <Button
          type="submit"
          disabled={!evidence.confirmed || !source || !target || !journals.length}
        >
          Approve verified policy
        </Button>
      </fieldset>
    </form>
  );
}

function OpeningForm({
  companyId,
  accounts,
  previous,
  onApproved,
}: {
  companyId: string;
  accounts: AccountRow[];
  previous: CashOpeningRecord | null;
  onApproved: () => Promise<void>;
}) {
  const approve = useServerFn(approveCashOpening);
  const fetchSource = useServerFn(listCashClassificationDocuments);
  const [kind, setKind] = useState<"sales_invoice" | "purchase_bill">(
    previous?.source_kind ?? "sales_invoice",
  );
  const [source, setSource] = useState<CashSourceDocument | null>(null);
  const [control, setControl] = useState(previous?.control_account_id ?? "");
  const [equity, setEquity] = useState(previous?.equity_account_id ?? "");
  const [mode, setMode] = useState<"recognize_on_settlement" | "already_recognized">(
    previous?.mode ?? "recognize_on_settlement",
  );
  const [from, setFrom] = useState(previous?.effective_from ?? "");
  const [components, setComponents] = useState(
    previous?.components.map((c) => ({
      account: c.account_id,
      amount: fromMinorUnits(BigInt(c.amount_minor), previous.currency_code),
    })) ?? [{ account: "", amount: "" }],
  );
  const fetchTaxCodes = useServerFn(listTaxCodes);
  const codes = useQuery({
    queryKey: ["cash-opening-tax-codes", companyId],
    queryFn: () => fetchTaxCodes({ data: { companyId } }),
  });
  const [taxLines, setTaxLines] = useState(
    previous?.tax_lines.map((line) => ({
      id: line.id,
      net: fromMinorUnits(BigInt(line.net_minor), previous.currency_code),
      tax: fromMinorUnits(BigInt(line.tax_minor), previous.currency_code),
      code: line.tax_code_id,
      rate: line.tax_rate_bps === undefined ? "" : String(line.tax_rate_bps),
    })) ?? [],
  );
  const [evidence, setEvidence] = useState(emptyEvidence);
  const sourceQuery = useQuery({
    queryKey: ["cash-opening-revision-source", companyId, previous?.id],
    enabled: Boolean(previous),
    queryFn: () =>
      fetchSource({
        data: { companyId, sourceKind: kind, openingOnly: true, documentId: previous!.document_id },
      }),
  });
  const selected = source ?? sourceQuery.data?.rows[0] ?? null;
  const mutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Select the verified opening document");
      return approve({
        data: {
          companyId,
          payload: {
            source_kind: kind,
            document_id: selected.id,
            posted_journal_id: selected.postedJournalId,
            control_account_id: control,
            equity_account_id: equity,
            currency_code: selected.currency,
            gross_minor: selected.grossMinor,
            components: components.map((c) => ({
              account_id: c.account,
              amount_minor: parseMinorOrThrow(c.amount, selected.currency).toString(),
            })),
            tax_lines: taxLines.map((line) => ({
              id: line.id,
              net_minor: parseMinorOrThrow(line.net, selected.currency).toString(),
              tax_minor: parseMinorOrThrow(line.tax, selected.currency).toString(),
              tax_code_id: line.code,
              ...(line.rate === "" ? {} : { tax_rate_bps: Number(line.rate) }),
            })),
            mode,
            effective_from: from,
            supersedes_id: previous?.id ?? null,
            evidence_reference: evidence.reference,
            policy_note: evidence.note,
            user_confirmed: evidence.confirmed as true,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Verified opening document split approved");
      await onApproved();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Use the imported source detail to split income, expense and tax. The conversion journal
          remains excluded from current-period income and expense.
        </p>
        {previous ? (
          <p>
            Revising approved version {previous.version}. Verify the source document again before
            approval.
          </p>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="cash-opening-kind">Opening document type</Label>
          <select
            id="cash-opening-kind"
            value={kind}
            disabled={Boolean(previous)}
            className="rounded-md border bg-background p-2"
            onChange={(e) => {
              setKind(e.target.value as typeof kind);
              setSource(null);
              setControl("");
            }}
          >
            {/* lookup-fixed-enum: Two supported opening trade document sources. */}
            <option value="sales_invoice">Customer invoice</option>
            <option value="purchase_bill">Supplier bill</option>
          </select>
        </div>
        {sourceQuery.isError ? (
          <QueryErrorState queries={[sourceQuery]} title="Could not load opening document" />
        ) : null}
        <DocumentLookup
          companyId={companyId}
          sourceKind={kind}
          openingOnly
          value={selected}
          onChange={setSource}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Posted trade control account</Label>
            <AccountLookup
              companyId={companyId}
              accounts={accounts.filter(
                (a) => a.account_type === (kind === "sales_invoice" ? "asset" : "liability"),
              )}
              value={control}
              onChange={setControl}
              ariaLabel="Opening trade control account"
            />
          </div>
          <div className="space-y-2">
            <Label>Posted opening equity account</Label>
            <AccountLookup
              companyId={companyId}
              accounts={accounts.filter((a) => a.account_type === "equity")}
              value={equity}
              onChange={setEquity}
              ariaLabel="Opening evidence equity account"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cash-opening-mode">Historical cash recognition</Label>
            <select
              id="cash-opening-mode"
              value={mode}
              className="w-full rounded-md border bg-background p-2"
              onChange={(e) => setMode(e.target.value as typeof mode)}
            >
              {/* lookup-fixed-enum: Explicit historical recognition policies. */}
              <option value="recognize_on_settlement">Recognize future verified settlements</option>
              <option value="already_recognized">Already recognized before conversion</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cash-opening-from">Effective from</Label>
            <Input
              id="cash-opening-from"
              type="date"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
        </div>
        <div className="space-y-3">
          <Label>Verified document components ({selected?.currency ?? "document currency"})</Label>
          {components.map((c, index) => (
            <div key={index} className="grid gap-2 sm:grid-cols-[1fr_12rem_auto]">
              <AccountLookup
                companyId={companyId}
                accounts={accounts.filter((a) => a.id !== control && a.id !== equity)}
                value={c.account}
                onChange={(account) =>
                  setComponents(components.map((v, i) => (i === index ? { ...v, account } : v)))
                }
                ariaLabel={`Opening component ${index + 1} account`}
              />
              <Input
                required
                inputMode="decimal"
                aria-label={`Opening component ${index + 1} amount`}
                value={c.amount}
                onChange={(e) =>
                  setComponents(
                    components.map((v, i) => (i === index ? { ...v, amount: e.target.value } : v)),
                  )
                }
              />
              <Button
                type="button"
                variant="outline"
                disabled={components.length === 1}
                onClick={() => setComponents(components.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => setComponents([...components, { account: "", amount: "" }])}
          >
            Add component
          </Button>
          <p className="text-xs text-muted-foreground">
            The approved components must equal the full opening document amount, including tax, for
            either historical treatment.
          </p>
        </div>
        <fieldset className="space-y-3">
          <legend>Verified opening tax details (optional)</legend>
          <p className="text-sm text-muted-foreground">
            Enter source tax details to support cash tax reporting. Net plus tax must equal the full
            document gross. Leaving this empty preserves an explicit tax exception.
          </p>
          {taxLines.map((line, index) => (
            <div key={line.id} className="grid gap-2 sm:grid-cols-4">
              <Input
                aria-label="Opening net amount"
                value={line.net}
                onChange={(e) =>
                  setTaxLines(
                    taxLines.map((v, i) => (i === index ? { ...v, net: e.target.value } : v)),
                  )
                }
              />
              <Input
                aria-label="Opening tax amount"
                value={line.tax}
                onChange={(e) =>
                  setTaxLines(
                    taxLines.map((v, i) => (i === index ? { ...v, tax: e.target.value } : v)),
                  )
                }
              />
              <Input
                aria-label="Verified original tax rate in basis points (optional)"
                placeholder="Original rate (bps), if reverse charge"
                type="number"
                min="0"
                max="100000"
                value={line.rate}
                onChange={(e) =>
                  setTaxLines(
                    taxLines.map((v, i) => (i === index ? { ...v, rate: e.target.value } : v)),
                  )
                }
              />
              <LookupSelect
                ariaLabel="Opening tax code"
                value={line.code}
                onChange={(code) =>
                  setTaxLines(taxLines.map((v, i) => (i === index ? { ...v, code } : v)))
                }
                options={(codes.data ?? []).map((raw) => {
                  const c = raw as unknown as { id: string; code: string; name: string };
                  return { id: c.id, label: `${c.code} — ${c.name}` };
                })}
              />

              <Button
                type="button"
                variant="outline"
                onClick={() => setTaxLines(taxLines.filter((_, i) => i !== index))}
              >
                Remove tax line
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              setTaxLines([
                ...taxLines,
                { id: crypto.randomUUID(), net: "", tax: "", code: "", rate: "" },
              ])
            }
          >
            Add verified tax line
          </Button>
        </fieldset>
        <EvidenceFieldsForm value={evidence} onChange={setEvidence} />
        <Button type="submit" disabled={!evidence.confirmed || !selected || !control || !equity}>
          Approve verified opening split
        </Button>
      </fieldset>
    </form>
  );
}

function InventoryForm({
  previous,
  acquisitionsSupported,
  companyId,
  currency,
  accounts,
  saleOptions,
  onApproved,
}: {
  acquisitionsSupported: boolean;
  companyId: string;
  currency: string;
  accounts: AccountRow[];
  previous: CashInventoryRecord | null;
  saleOptions: LookupOption[];
  onApproved: () => Promise<void>;
}) {
  const approve = useServerFn(approveCashInventory);
  const [source, setSource] = useState<CashSourceDocument | null>(null);
  const [sourceKind, setSourceKind] = useState<
    "purchase_bill" | "direct_cash" | "opening_inventory"
  >(previous?.source_kind ?? "purchase_bill");
  const [sourceJournals, setSourceJournals] = useState<string[]>(
    previous && previous.source_kind !== "purchase_bill" ? [previous.purchase_journal_id] : [],
  );
  const [openingPaid, setOpeningPaid] = useState(
    previous?.opening_paid_minor
      ? fromMinorUnits(BigInt(previous.opening_paid_minor), currency)
      : "0",
  );
  const [openingEquity, setOpeningEquity] = useState(previous?.opening_equity_account_id ?? "");
  const [paymentProof, setPaymentProof] = useState(previous?.payment_evidence_journal_ids ?? []);
  const [account, setAccount] = useState(previous?.inventory_account_id ?? "");
  const [movement, setMovement] = useState<string[]>(
    previous ? [previous.movement_journal_id] : [],
  );
  const [kind, setKind] = useState<
    "sale" | "customer_return" | "supplier_return" | "opening_source"
  >(previous?.movement_kind ?? "sale");
  const [cost, setCost] = useState(
    previous ? fromMinorUnits(BigInt(previous.cost_minor), currency) : "",
  );
  const [reverses, setReverses] = useState(previous?.reverses_evidence_id ?? "");
  const [evidence, setEvidence] = useState(emptyEvidence);
  const mutation = useMutation({
    mutationFn: () => {
      const acquisition =
        sourceKind === "purchase_bill"
          ? source
          : sourceJournals[0]
            ? { id: sourceJournals[0], postedJournalId: sourceJournals[0] }
            : null;
      if (!acquisition) throw new Error("Select the verified acquisition source");
      return approve({
        data: {
          companyId,
          payload: {
            supersedes_id: previous?.id ?? null,
            source_kind: sourceKind,
            purchase_document_id: acquisition.id,
            purchase_journal_id: acquisition.postedJournalId,
            ...(kind === "opening_source"
              ? {
                  opening_paid_minor: parseMinorOrThrow(openingPaid, currency).toString(),
                  opening_equity_account_id: openingEquity,
                  payment_evidence_journal_ids: paymentProof,
                }
              : {}),
            inventory_account_id: account,
            movement_journal_id:
              kind === "opening_source" ? acquisition.postedJournalId : (movement[0] ?? ""),
            movement_kind: kind,
            cost_minor: parseMinorOrThrow(cost, currency).toString(),
            reverses_evidence_id: reverses || null,
            evidence_reference: evidence.reference,
            policy_note: evidence.note,
            user_confirmed: evidence.confirmed as true,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Verified inventory cost evidence approved");
      await onApproved();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        mutation.mutate();
      }}
    >
      <fieldset disabled={mutation.isPending} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Link the purchase to a posted sale or return using verified inventory costing records.
          Enter the cost in {currency}. Paid purchases determine cash expense; this link tracks the
          paid cost sold without adding a second expense.
        </p>
        {!acquisitionsSupported ? (
          <p role="status" className="text-sm text-muted-foreground">
            Direct and opening acquisition approvals need the accounting database update. Existing
            bill classifications remain available.
          </p>
        ) : null}
        <Label>Verified acquisition source</Label>
        <select
          aria-label="Inventory acquisition source kind"
          value={sourceKind}
          className="rounded border bg-background p-2"
          onChange={(e) => {
            const value = e.target.value as typeof sourceKind;
            setSourceKind(value);
            setSourceJournals([]);
            setSource(null);
            setKind(value === "opening_inventory" ? "opening_source" : "sale");
          }}
        >
          {/* lookup-fixed-enum: Verified inventory acquisition source types. */}
          <option value="purchase_bill">Posted purchase bill</option>
          <option value="direct_cash" disabled={!acquisitionsSupported}>
            Direct cash / credit-card purchase
          </option>
          <option value="opening_inventory" disabled={!acquisitionsSupported}>
            Verified opening inventory
          </option>
        </select>
        {sourceKind === "purchase_bill" ? (
          <DocumentLookup
            companyId={companyId}
            sourceKind="purchase_bill"
            openingOnly={false}
            value={source}
            onChange={setSource}
          />
        ) : (
          <JournalEvidenceLookup
            companyId={companyId}
            values={sourceJournals}
            onChange={setSourceJournals}
          />
        )}
        {sourceJournals.length > 1 ? (
          <p role="alert">Select exactly one acquisition journal.</p>
        ) : null}
        {kind === "opening_source" ? (
          <div className="space-y-3">
            <Label>Verified historical paid cost carried forward ({currency})</Label>
            <Label>Verified opening equity account</Label>
            <AccountLookup
              companyId={companyId}
              accounts={accounts.filter((a) => a.account_type === "equity")}
              value={openingEquity}
              onChange={setOpeningEquity}
              ariaLabel="Opening stock equity account"
            />
            <Input
              aria-label="Verified opening paid inventory cost"
              value={openingPaid}
              onChange={(e) => setOpeningPaid(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">
              This carries already-paid cost into the stock trace and creates no new cash expense.
              Select the original posted acquisition/payment evidence; external records without
              posted support remain explicit exceptions.
            </p>
            <JournalEvidenceLookup
              companyId={companyId}
              values={paymentProof}
              onChange={setPaymentProof}
            />
          </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Inventory source account</Label>
            <AccountLookup
              companyId={companyId}
              accounts={accounts.filter((a) => a.account_type === "asset")}
              value={account}
              onChange={setAccount}
              ariaLabel="Inventory evidence account"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cash-inventory-kind">Cost movement</Label>
            <select
              id="cash-inventory-kind"
              value={kind}
              className="w-full rounded-md border bg-background p-2"
              onChange={(e) => {
                setKind(e.target.value as typeof kind);
                setReverses("");
              }}
            >
              {/* lookup-fixed-enum: Supported verified inventory movement types. */}
              {sourceKind === "opening_inventory" ? (
                <option value="opening_source">Approve opening paid-cost carry</option>
              ) : null}
              <option value="sale">Inventory sold</option>
              <option value="customer_return">Customer return</option>
              <option value="supplier_return">Supplier return</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cash-inventory-cost">Verified cost ({currency})</Label>
            <Input
              id="cash-inventory-cost"
              required
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
          {kind === "customer_return" ? (
            <div className="space-y-2">
              <Label>Original approved sale cost</Label>
              <LookupSelect
                options={saleOptions}
                value={reverses}
                onChange={setReverses}
                ariaLabel="Original inventory sale evidence"
              />
            </div>
          ) : null}
        </div>
        {kind !== "opening_source" ? (
          <JournalEvidenceLookup
            companyId={companyId}
            values={movement}
            onChange={setMovement}
            multiple={false}
            label="Posted sale or return journal"
          />
        ) : null}
        <EvidenceFieldsForm value={evidence} onChange={setEvidence} />
        <Button
          type="submit"
          disabled={
            !evidence.confirmed ||
            (sourceKind === "purchase_bill" ? !source : sourceJournals.length !== 1) ||
            !account ||
            (kind !== "opening_source" && !movement.length)
          }
        >
          Approve verified inventory cost
        </Button>
      </fieldset>
    </form>
  );
}

export function CashClassificationPanel({
  initialReview,
  companyId,
  currency,
}: {
  initialReview?: string | undefined;
  companyId: string;
  currency: string;
}) {
  const record = useServerFn(recordCashClassificationException);
  const pending = cashClassificationExceptions(initialReview).filter(
    (e) => e.companyId === companyId,
  );
  const recordMutation = useMutation({
    mutationFn: async () => {
      for (const exception of pending) await record({ data: { companyId, exception } });
    },
    onSuccess: async () => {
      toast.success("Exception recorded for review");
      await qc.invalidateQueries({ queryKey: ["cash-classifications", companyId] });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const fetch = useServerFn(listCashClassifications);
  const accountsFn = useServerFn(listAccounts);
  const resolve = useServerFn(resolveCashClassificationException);
  const qc = useQueryClient();
  const { can } = useCan();
  const [form, setForm] = useState<ReviewKind | null>(null);
  const [previousPolicy, setPreviousPolicy] = useState<CashPolicyRecord | null>(null);
  const [previousOpening, setPreviousOpening] = useState<CashOpeningRecord | null>(null);
  const [previousInventory, setPreviousInventory] = useState<CashInventoryRecord | null>(null);
  const [review, setReview] = useState<CashExceptionRecord | null>(null);
  const [resolution, setResolution] = useState("");
  const [reviewNote, setReviewNote] = useState("");
  const q = useQuery({
    queryKey: ["cash-classifications", companyId],
    queryFn: () => fetch({ data: { companyId } }),
  });
  const accounts = useQuery({
    queryKey: ["accounts", companyId],
    queryFn: () => accountsFn({ data: { companyId } }),
  });
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["cash-classifications", companyId] }),
      qc.invalidateQueries({
        predicate: (query) =>
          query.queryKey.some(
            (key) =>
              typeof key === "string" && /report|cash|dashboard|budget|forecast|project/.test(key),
          ),
      }),
    ]);
    setForm(null);
    setPreviousPolicy(null);
    setPreviousOpening(null);
    setPreviousInventory(null);
  };
  const resolveMutation = useMutation({
    mutationFn: () => {
      if (!review) throw new Error("Select an exception to review");
      const [resolutionKind, resolutionId] = resolution.split(":");
      return resolve({
        data: {
          companyId,
          exceptionId: review.id,
          resolutionKind: resolutionKind as ReviewKind,
          resolutionId: resolutionId ?? "",
          reviewNote,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Exception resolved with approved evidence");
      setReview(null);
      setResolution("");
      setReviewNote("");
      await refresh();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  if (q.isPending || accounts.isPending) return <LoadingState />;
  if (q.isError || accounts.isError)
    return (
      <QueryErrorState queries={[q, accounts]} title="Could not load cash classification review" />
    );
  const data = q.data!;
  const activeAccounts = (accounts.data ?? []).filter((a) => a.is_active && a.is_postable);
  const accountName = (id: string | null) =>
    accounts.data?.find((a) => a.id === id)
      ? `${accounts.data.find((a) => a.id === id)!.code} ${accounts.data.find((a) => a.id === id)!.name}`
      : (id ?? "Source document");
  const latest = <T extends { id: string; supersedes_id?: string | null }>(rows: T[]) =>
    rows.filter((r) => !rows.some((n) => n.supersedes_id === r.id));
  const resolutionOptions: LookupOption[] = review
    ? [
        ...latest(data.policies)
          .filter((p) => p.source_account_id === review.source_account_id)
          .map((p) => ({
            id: `policy:${p.id}`,
            label: `${accountName(p.source_account_id)} — ${policyLabels[p.kind]} v${p.version}`,
          })),
        ...latest(data.opening)
          .filter((o) => o.document_id === review.document_id)
          .map((o) => ({
            id: `opening:${o.id}`,
            label: `Opening document ${o.document_id} v${o.version}`,
          })),
        ...data.inventory
          .filter(
            (i) =>
              i.inventory_account_id === review.source_account_id &&
              (!review.document_id || i.purchase_document_id === review.document_id),
          )
          .map((i) => ({
            id: `inventory:${i.id}`,
            label: `Inventory ${i.movement_kind} · ${money(i.cost_minor, currency)}`,
          })),
      ]
    : [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Cash classification review</h2>
          <p className="text-sm text-muted-foreground">
            Review supporting records for opening balances, inventory, prepayments, deferred revenue
            and payroll. Approvals affect cash reports; the accrual ledger remains the source of
            truth.
          </p>
        </div>
        {can("accounting.post") ? (
          <div className="flex flex-wrap gap-2">
            {(["policy", "opening", "inventory"] as const).map((kind) => (
              <Button
                key={kind}
                variant="outline"
                onClick={() => {
                  setPreviousPolicy(null);
                  setPreviousOpening(null);
                  setPreviousInventory(null);
                  setForm(kind);
                }}
              >
                {kind === "policy"
                  ? "Verify account policy"
                  : kind === "opening"
                    ? "Verify opening document"
                    : "Verify inventory cost"}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
      {pending.length ? (
        <section className="space-y-3 rounded border p-4">
          <h3 className="font-semibold">Exception from report</h3>
          {pending.map((e, index) => (
            <p key={index}>
              {e.message} · {money(e.amountMinor, e.currency)} · {e.period.from} to {e.period.to}
              <br />
              {e.missingEvidence.join("; ")}
            </p>
          ))}
          <Button
            disabled={recordMutation.isPending || recordMutation.isSuccess}
            onClick={() => recordMutation.mutate()}
          >
            {recordMutation.isSuccess ? "Recorded for review" : "Record for review"}
          </Button>
        </section>
      ) : null}
      <section className="space-y-3">
        <h3 className="font-semibold">Classification exceptions</h3>
        {data.exceptions.length ? (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Reporting period</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Missing information</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Review</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.exceptions.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div>{accountName(e.source_account_id)}</div>
                      {e.journal_id ? (
                        <Link
                          className="text-xs underline"
                          to="/accounting"
                          search={{ tab: "journals", journal: e.journal_id }}
                        >
                          Inspect source journal
                        </Link>
                      ) : null}
                      {e.document_id ? (
                        <p className="break-all text-xs text-muted-foreground">
                          Document {e.document_id}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {e.period_from} to {e.period_to}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {money(e.amount_minor, e.currency_code)}
                    </TableCell>
                    <TableCell className="max-w-md whitespace-pre-line">
                      {e.missing_information}
                    </TableCell>
                    <TableCell>{e.status}</TableCell>
                    <TableCell>
                      {e.status === "open" && can("accounting.post") ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setReview(e);
                            setResolution("");
                            setReviewNote("");
                          }}
                        >
                          Review
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            title="No recorded exceptions"
            description="When a cash report needs supporting evidence, use Record for review on the report to add the source and reporting period here."
          />
        )}
      </section>
      {review ? (
        <section className="space-y-3 rounded-md border p-4">
          <h3 className="font-semibold">Resolve reviewed exception</h3>
          <p>
            {accountName(review.source_account_id)} ·{" "}
            {money(review.amount_minor, review.currency_code)} · {review.period_from} to{" "}
            {review.period_to}
          </p>
          <p className="text-sm text-muted-foreground">
            Approve the verified policy or source evidence below, then select that approval to
            resolve this exception. A cash report will revalidate the evidence on refresh.
          </p>
          <LookupSelect
            options={resolutionOptions}
            value={resolution}
            onChange={setResolution}
            ariaLabel="Approved classification for this exception"
          />
          <Textarea
            aria-label="Exception review note"
            placeholder="Explain how the approved evidence resolves the missing information"
            minLength={10}
            maxLength={4000}
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              disabled={!resolution || reviewNote.trim().length < 10 || resolveMutation.isPending}
              onClick={() => resolveMutation.mutate()}
            >
              Resolve with approved evidence
            </Button>
            <Button variant="outline" onClick={() => setReview(null)}>
              Close review
            </Button>
          </div>
        </section>
      ) : null}
      {form && can("accounting.post") ? (
        <section className="space-y-4 rounded-md border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {form === "policy"
                ? "Verify account classification"
                : form === "opening"
                  ? "Verify opening source details"
                  : "Verify inventory cost movement"}
            </h3>
            <Button variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
          </div>
          {form === "policy" ? (
            <PolicyForm
              key={previousPolicy?.id ?? `new-${review?.id ?? ""}`}
              companyId={companyId}
              accounts={activeAccounts}
              previous={previousPolicy}
              sourceAccountId={review?.source_account_id ?? null}
              onApproved={refresh}
            />
          ) : form === "opening" ? (
            <OpeningForm
              key={previousOpening?.id ?? "new"}
              companyId={companyId}
              accounts={activeAccounts}
              previous={previousOpening}
              onApproved={refresh}
            />
          ) : (
            <InventoryForm
              key={previousInventory?.id ?? "new"}
              previous={previousInventory}
              acquisitionsSupported={data.acquisitionsSupported}
              companyId={companyId}
              currency={currency}
              accounts={activeAccounts}
              saleOptions={data.inventory
                .filter((i) => i.movement_kind === "sale")
                .map((i) => ({
                  id: i.id,
                  label: `${i.evidence_reference} · ${money(i.cost_minor, currency)}`,
                  description: accountName(i.inventory_account_id),
                }))}
              onApproved={refresh}
            />
          )}
        </section>
      ) : null}
      <section className="space-y-3">
        <h3 className="font-semibold">Approved account policies</h3>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source / recognition</TableHead>
                <TableHead>Policy / effective dates</TableHead>
                <TableHead>Evidence / approval</TableHead>
                <TableHead>Version</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.policies.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {accountName(p.source_account_id)}
                    <p className="text-muted-foreground">
                      → {accountName(p.recognition_account_id)}
                    </p>
                  </TableCell>
                  <TableCell>
                    {policyLabels[p.kind]}
                    <p>
                      {p.effective_from} to {p.effective_to ?? "ongoing"}
                    </p>
                  </TableCell>
                  <TableCell>
                    {p.evidence_reference}
                    <p className="whitespace-pre-line text-xs">{p.policy_note}</p>
                    <p className="text-xs">
                      {p.approved_at} · {p.approved_by}
                    </p>
                    {p.evidence_journal_ids.map((id) => (
                      <Link
                        key={id}
                        className="mr-2 text-xs underline"
                        to="/accounting"
                        search={{ tab: "journals", journal: id }}
                      >
                        Source journal
                      </Link>
                    ))}
                  </TableCell>
                  <TableCell>
                    {p.version}
                    {latest(data.policies).some((n) => n.id === p.id)
                      ? " · current"
                      : " · superseded"}
                  </TableCell>
                  <TableCell>
                    {can("accounting.post") && latest(data.policies).some((n) => n.id === p.id) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPreviousPolicy(p);
                          setForm("policy");
                        }}
                      >
                        Revise
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Approved opening documents</h3>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document / total</TableHead>
                <TableHead>Verified components</TableHead>
                <TableHead>Historical treatment / evidence</TableHead>
                <TableHead>Approval / version</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.opening.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="max-w-xs break-all">
                    {o.source_kind} {o.document_id}
                    <p>{money(o.gross_minor, o.currency_code)}</p>
                    <Link
                      className="text-xs underline"
                      to="/accounting"
                      search={{ tab: "journals", journal: o.posted_journal_id }}
                    >
                      Opening journal
                    </Link>
                  </TableCell>
                  <TableCell>
                    {o.components.map((c) => (
                      <p key={c.account_id}>
                        {accountName(c.account_id)} · {money(c.amount_minor, o.currency_code)}
                      </p>
                    ))}
                  </TableCell>
                  <TableCell>
                    {o.mode === "already_recognized"
                      ? "Already recognized before conversion"
                      : "Recognize future settlements"}
                    <p>Effective {o.effective_from}</p>
                    <p>{o.evidence_reference}</p>
                    <p className="text-xs whitespace-pre-line">{o.policy_note}</p>
                  </TableCell>
                  <TableCell>
                    {o.approved_at}
                    <p className="text-xs">{o.approved_by}</p>Version {o.version}
                  </TableCell>
                  <TableCell>
                    {can("accounting.post") && latest(data.opening).some((n) => n.id === o.id) ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPreviousOpening(o);
                          setForm("opening");
                        }}
                      >
                        Revise
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="font-semibold">Approved inventory cost evidence</h3>
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchase / source account</TableHead>
                <TableHead>Movement / cost</TableHead>
                <TableHead>Supporting evidence</TableHead>
                <TableHead>Approval</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.inventory.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    {accountName(i.inventory_account_id)}
                    <p className="break-all text-xs">
                      {i.source_kind ?? "purchase_bill"} {i.purchase_document_id}
                    </p>
                    <Link
                      className="text-xs underline"
                      to="/accounting"
                      search={{ tab: "journals", journal: i.purchase_journal_id }}
                    >
                      Purchase journal
                    </Link>
                  </TableCell>
                  <TableCell>
                    {i.movement_kind.replaceAll("_", " ")} · {money(i.cost_minor, currency)}
                    <p>
                      <Link
                        className="text-xs underline"
                        to="/accounting"
                        search={{ tab: "journals", journal: i.movement_journal_id }}
                      >
                        Movement journal
                      </Link>
                    </p>
                  </TableCell>
                  <TableCell>
                    {i.evidence_reference}
                    <p className="text-xs whitespace-pre-line">{i.policy_note}</p>
                  </TableCell>
                  <TableCell>
                    {i.approved_at}
                    <p className="text-xs">{i.approved_by}</p>Version {i.version}
                    {can("accounting.post") && latest(data.inventory).some((n) => n.id === i.id) ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setPreviousInventory(i);
                          setForm("inventory");
                        }}
                      >
                        Revise
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
      {can("reports.view") && <InventoryCostTrace companyId={companyId} currency={currency} />}
      <details className="rounded-md border p-4">
        <summary className="cursor-pointer font-semibold">
          Classification audit history ({data.audit.length})
        </summary>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When / who</TableHead>
              <TableHead>Action / record</TableHead>
              <TableHead>Review details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...data.audit]
              .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
              .map((a) => (
                <TableRow key={a.id}>
                  <TableCell>
                    {a.occurred_at}
                    <p className="text-xs">{a.actor_id}</p>
                  </TableCell>
                  <TableCell>
                    {a.entity_kind} · {a.action}
                    <p className="break-all text-xs">{a.entity_id}</p>
                  </TableCell>
                  <TableCell className="max-w-md break-words whitespace-pre-wrap text-xs">
                    {a.details}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </details>
    </div>
  );
}

function InventoryCostTrace({ companyId, currency }: { companyId: string; currency: string }) {
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [from, setFrom] = useState(`${to.slice(0, 4)}-01-01`);
  const fetch = useServerFn(getCashInventoryTrace);
  const [enabled, setEnabled] = useState(false);
  const q = useQuery({
    queryKey: ["cash-inventory-trace", companyId, from, to],
    enabled,
    queryFn: () => fetch({ data: { companyId, from, to } }),
    retry: false,
  });
  const exportFn = useServerFn(exportVisibleReport);
  const { can } = useCan();
  const exportTrace = useMutation({
    mutationFn: () => {
      if (!q.data) throw new Error("Load verified cost tracing before exporting");
      const { trace, companyName } = q.data;
      return exportFn({
        data: {
          companyId,
          companyName,
          reportId: "cash-inventory-cost",
          title: "Cash-paid inventory cost",
          currency: trace.currency,
          from: trace.from,
          to: trace.to,
          basis: "Cash basis · verified purchase cost trace; no additional expense",
          format: "csv",
          headers: [
            "Acquisition source",
            "Source kind",
            "Inventory account",
            "Paid net of refunds",
            "Cash-paid cost sold",
            "Paid cost still held",
            "Return awaiting refund",
            "Refund exchange difference",
          ],
          rows: trace.sources.map((row) => [
            row.purchaseDocumentId,
            row.sourceKind,
            row.inventoryAccountId,
            ...[
              row.paidCostMinor,
              row.cashPaidCostSoldMinor,
              row.paidCostUnconsumedMinor,
              row.returnedPaidCostMinor,
              row.refundFxVarianceMinor,
            ].map((value) => fromMinorUnits(BigInt(value), trace.currency)),
          ]),
        },
      });
    },
    onSuccess: downloadReportFile,
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  return (
    <section className="space-y-3 rounded-md border p-4">
      <h3 className="font-semibold">Cash-paid inventory cost</h3>
      {q.data && can("reports.export") ? (
        <Button
          variant="outline"
          disabled={exportTrace.isPending}
          onClick={() => exportTrace.mutate()}
        >
          Export loaded trace (CSV)
        </Button>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Trace verified purchase payments to inventory sold, stock still held and returns awaiting
        refunds. These amounts explain purchase expenses; they do not add another cost of sales.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="inventory-cash-from">From</Label>
          <Input
            id="inventory-cash-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="inventory-cash-to">To</Label>
          <Input
            id="inventory-cash-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <Button
          variant="outline"
          onClick={() => {
            setEnabled(true);
            void q.refetch();
          }}
        >
          Trace verified costs
        </Button>
      </div>
      {enabled && q.isPending ? (
        <LoadingState />
      ) : q.isError ? (
        <QueryErrorState queries={[q]} title="Inventory cost tracing needs review" />
      ) : q.data ? (
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Purchase</TableHead>
                <TableHead>Paid, net of refunds</TableHead>
                <TableHead>Cash-paid cost sold</TableHead>
                <TableHead>Paid cost still held</TableHead>
                <TableHead>Return awaiting refund</TableHead>
                <TableHead>Refund exchange difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.trace.sources.map((row) => (
                <TableRow
                  key={`${row.purchaseJournalId}:${row.purchaseDocumentId}:${row.inventoryAccountId}`}
                >
                  <TableCell>
                    {row.sourceKind === "purchase_bill" ? (
                      <Link
                        to="/purchases/bills/$billId"
                        params={{ billId: row.purchaseDocumentId }}
                        className="underline"
                      >
                        Purchase bill
                      </Link>
                    ) : (
                      <Link
                        to="/accounting"
                        search={{ tab: "journals", journal: row.purchaseJournalId }}
                        className="underline"
                      >
                        {row.sourceKind === "opening_inventory"
                          ? "Opening inventory"
                          : "Direct purchase"}
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>{money(row.paidCostMinor, currency)}</TableCell>
                  <TableCell>{money(row.cashPaidCostSoldMinor, currency)}</TableCell>
                  <TableCell>{money(row.paidCostUnconsumedMinor, currency)}</TableCell>
                  <TableCell>{money(row.returnedPaidCostMinor, currency)}</TableCell>
                  <TableCell>{money(row.refundFxVarianceMinor, currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </section>
  );
}

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { codeBankTransaction, type listCodingOptions } from "@/lib/banking/coding.functions";
import { computeSplitTotals, type CodingTaxCode } from "@/lib/banking/coding";
import { MoneyField } from "@/components/banking/MoneyField";
import { moneyFieldMinor } from "@/lib/banking/money-field";
import { AccountLookup, ContactLookup, TaxLookup } from "@/components/lookup";
import {
  AccountCreateForm,
  ContactCreateForm,
  TaxCodeCreateForm,
} from "@/components/lookup/create-forms";
import { useCan } from "@/hooks/use-can";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EditableLineItemGrid } from "@/components/common/EditableLineItemGrid";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { TableCell, TableRow } from "@/components/ui/table";

export type CodingOptions = Awaited<ReturnType<typeof listCodingOptions>>;

type SplitDraft = {
  key: number;
  accountId: string;
  description: string;
  taxCodeId: string;
  amount: string;
};

const NO_TAX = "";
const NO_CONTACT = "";

/**
 * Bank coding panel: contact, one or more split lines (account, tax code, description) and a reference.
 * Posts one balanced journal; the server re-validates everything (accounts, tax code, totals).
 */
export function BankCodingPanel({
  companyId,
  txn,
  currency,
  options,
  initialAccountId,
  onDone,
  onCancel,
}: {
  companyId: string;
  txn: { id: string; amountMinor: number; description: string | null };
  currency: string;
  options: CodingOptions;
  initialAccountId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const post = useServerFn(codeBankTransaction);
  const { can } = useCan();
  const direction = txn.amountMinor > 0 ? "in" : "out";
  const statementAbs = BigInt(Math.abs(txn.amountMinor));

  const taxChoices = useMemo(
    () =>
      options.taxCodes.filter(
        (t) =>
          t.rateActive &&
          t.treatment !== "reverse_charge" &&
          (t.appliesTo === "both" || t.appliesTo === (direction === "in" ? "sales" : "purchases")),
      ),
    [options.taxCodes, direction],
  );
  const taxMap = useMemo(() => {
    const m = new Map<string, CodingTaxCode>();
    for (const t of taxChoices) {
      m.set(t.id, {
        id: t.id,
        code: t.code,
        rateBps: t.rateBps,
        treatment: t.treatment,
        taxAccountId: null,
        isRecoverable: t.isRecoverable,
      });
    }
    return m;
  }, [taxChoices]);

  const [treatment, setTreatment] = useState<"inclusive" | "exclusive">("inclusive");
  const [contactId, setContactId] = useState(NO_CONTACT);
  const [reference, setReference] = useState("");
  const [memo, setMemo] = useState("");
  const [nextKey, setNextKey] = useState(2);
  const [splits, setSplits] = useState<SplitDraft[]>([
    {
      key: 1,
      accountId: initialAccountId ?? "",
      description: "",
      taxCodeId: NO_TAX,
      amount: fromMinorUnits(statementAbs, currency),
    },
  ]);

  const parsed = splits.map((s) => moneyFieldMinor(s.amount, currency, { allowNegative: false }));
  const allAmountsValid = parsed.every((p) => p !== null && p > 0n);
  const totals = (() => {
    if (!allAmountsValid) return null;
    try {
      return computeSplitTotals(
        splits.map((s, i) => ({
          amountMinor: parsed[i]!,
          taxCodeId: s.taxCodeId === NO_TAX ? null : s.taxCodeId,
        })),
        treatment,
        taxMap,
      );
    } catch {
      return null;
    }
  })();
  const remaining = totals ? statementAbs - totals.grossMinor : null;
  const accountsOk = splits.every((s) => s.accountId);
  const canPost = Boolean(totals) && remaining === 0n && accountsOk;

  const update = (key: number, patch: Partial<SplitDraft>) =>
    setSplits((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const addLine = () => {
    const amount = remaining !== null && remaining > 0n ? fromMinorUnits(remaining, currency) : "";
    setSplits((rows) => [
      ...rows,
      { key: nextKey, accountId: "", description: "", taxCodeId: NO_TAX, amount },
    ]);
    setNextKey((k) => k + 1);
  };

  const postM = useMutation({
    mutationFn: () =>
      post({
        data: {
          companyId,
          bankTransactionId: txn.id,
          treatment,
          contactId: contactId === NO_CONTACT ? null : contactId,
          reference: reference.trim() || null,
          memo: memo.trim() || null,
          splits: splits.map((s, i) => ({
            accountId: s.accountId,
            amountMinor: Number(parsed[i]!),
            description: s.description.trim() || null,
            taxCodeId: s.taxCodeId === NO_TAX ? null : s.taxCodeId,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Coded. One balanced journal was posted and linked.");
      onDone();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const money = (v: bigint) => fromMinorUnits(v, currency);

  const summaryLines = [
    {
      id: "statement",
      label: direction === "in" ? "Statement received" : "Statement spent",
      value: `${money(statementAbs)} ${currency}`,
    },
    ...(totals
      ? [
          {
            id: "net",
            label: "Net",
            value: `${money(totals.netMinor)} ${currency}`,
            emphasis: "muted" as const,
          },
          {
            id: "tax",
            label: "Tax",
            value: `${money(totals.taxMinor)} ${currency}`,
            emphasis: "muted" as const,
          },
          {
            id: "gross",
            label: "Gross",
            value: `${money(totals.grossMinor)} ${currency}`,
            emphasis: "total" as const,
          },
          {
            id: "remaining",
            label:
              remaining === 0n
                ? "Allocation"
                : remaining! > 0n
                  ? "Still to allocate"
                  : "Over-allocated",
            value:
              remaining === 0n
                ? "Fully allocated"
                : `${money(remaining! < 0n ? -remaining! : remaining!)} ${currency}`,
            emphasis: remaining === 0n ? ("muted" as const) : ("default" as const),
          },
        ]
      : [
          {
            id: "hint",
            label: "Allocation",
            value: "Enter valid amounts for every line",
            emphasis: "muted" as const,
          },
        ]),
  ];

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label>{direction === "in" ? "Received from" : "Paid to"} (contact)</Label>
          <ContactLookup
            ariaLabel={direction === "in" ? "Received from" : "Paid to"}
            contacts={options.contacts}
            value={contactId}
            onChange={setContactId}
            companyId={companyId}
            placeholder="No contact"
            allowClear
            canCreate={can("contacts.manage")}
            createTitle={direction === "in" ? "New customer" : "New supplier"}
            renderCreate={
              can("contacts.manage")
                ? (ctx) => (
                    <ContactCreateForm
                      companyId={companyId}
                      kind={direction === "in" ? "customer" : "supplier"}
                      ctx={ctx}
                    />
                  )
                : undefined
            }
          />
        </div>
        <div className="space-y-1">
          <Label>Reference</Label>
          <Input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Amounts are</Label>
          <Select
            value={treatment}
            onValueChange={(v) => setTreatment(v as "inclusive" | "exclusive")}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inclusive">Tax inclusive</SelectItem>
              <SelectItem value="exclusive">Tax exclusive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <EditableLineItemGrid
        aria-label="Bank coding split lines"
        columns={[
          { id: "account", header: "Account", widthPx: 220, minWidthPx: 160 },
          {
            id: "description",
            header: "Description",
            widthPx: 220,
            minWidthPx: 140,
            fluid: true,
          },
          { id: "tax", header: "Tax code", widthPx: 160, minWidthPx: 120 },
          {
            id: "amount",
            header: "Amount",
            align: "right",
            widthPx: 120,
            minWidthPx: 96,
          },
          {
            id: "actions",
            header: <span className="sr-only">Actions</span>,
            widthPx: 48,
            minWidthPx: 40,
            resizable: false,
          },
        ]}
        onAddRow={splits.length >= 30 ? undefined : addLine}
        addRowLabel="Add split line"
        footer={<TotalsSummary aria-label="Bank coding totals" lines={summaryLines} />}
      >
        {splits.map((s, i) => (
          <TableRow key={s.key}>
            <TableCell className="p-0 align-middle">
              <AccountLookup
                ariaLabel={`Line ${i + 1} account`}
                accounts={options.accounts}
                value={s.accountId}
                onChange={(accountId) => update(s.key, { accountId })}
                companyId={companyId}
                placeholder="Account"
                allowClear={false}
                canCreate={can("accounts.manage")}
                createTitle="New account"
                renderCreate={
                  can("accounts.manage")
                    ? (ctx) => (
                        <AccountCreateForm
                          companyId={companyId}
                          currency={currency}
                          initialKind="expense"
                          ctx={ctx}
                        />
                      )
                    : undefined
                }
              />
            </TableCell>
            <TableCell className="p-0 align-middle">
              <Input
                aria-label={`Line ${i + 1} description`}
                placeholder="Description"
                maxLength={500}
                value={s.description}
                className="h-8 rounded-none border-0 bg-transparent shadow-none"
                onChange={(e) => update(s.key, { description: e.target.value })}
              />
            </TableCell>
            <TableCell className="p-0 align-middle">
              <TaxLookup
                ariaLabel={`Line ${i + 1} tax code`}
                today={new Date().toISOString().slice(0, 10)}
                usage={direction === "in" ? "sales" : "purchases"}
                taxes={taxChoices.map((tax) => ({
                  id: tax.id,
                  code: tax.code,
                  name: tax.name,
                  rateLabel: `${(tax.rateBps / 100).toFixed(2).replace(/\.00$/, "")}%`,
                  appliesTo: tax.appliesTo,
                  effective_from: tax.effectiveFrom ?? "1970-01-01",
                  effective_to: tax.effectiveTo,
                  is_active: tax.rateActive,
                }))}
                value={s.taxCodeId}
                onChange={(taxCodeId) => update(s.key, { taxCodeId })}
                companyId={companyId}
                placeholder="No tax"
                allowClear
                canCreate={can("tax.settings")}
                createTitle="New tax code"
                renderCreate={
                  can("tax.settings")
                    ? (ctx) => (
                        <TaxCodeCreateForm
                          companyId={companyId}
                          appliesTo={direction === "in" ? "sales" : "purchases"}
                          ctx={ctx}
                        />
                      )
                    : undefined
                }
              />
            </TableCell>
            <TableCell className="p-1 align-middle">
              <MoneyField
                label={`Line ${i + 1} amount`}
                value={s.amount}
                currency={currency}
                options={{ allowNegative: false }}
                onChange={(v) => update(s.key, { amount: v })}
              />
            </TableCell>
            <TableCell className="p-0 align-middle">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remove line ${i + 1}`}
                disabled={splits.length === 1}
                onClick={() => setSplits((rows) => rows.filter((r) => r.key !== s.key))}
              >
                <Trash2 className="size-4" />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </EditableLineItemGrid>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Input
          className="w-48"
          placeholder="Memo (optional)"
          maxLength={500}
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
        />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canPost || postM.isPending}
          onClick={() => postM.mutate()}
        >
          {postM.isPending ? "Posting…" : "Post"}
        </Button>
      </div>
    </div>
  );
}

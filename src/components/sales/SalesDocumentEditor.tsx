"use client";

import { VoiceFields, VoiceSelect } from "@/components/ai-voice/voice-fields";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import {
  getInvoice,
  listCustomers,
  listInvoices,
  saveAndAuthoriseInvoice,
  saveInvoiceDraft,
  saveQuoteDraft,
} from "@/lib/sales/sales.functions";
import { authoriseCreditNote, saveCreditNoteDraft } from "@/lib/sales/sales-credits.functions";
import { getSalesDocumentConfig } from "@/lib/sales/sales-config.functions";
import { listProducts } from "@/lib/products/products.functions";
import { getCustomerPriceListDefault } from "@/lib/products/customer-price-list.functions";
import { resolvedDraftPriceList } from "@/lib/products/customer-price-list-rules";
import {
  listProductPriceLists,
  resolveSalesDraftPriceList,
} from "@/lib/products/catalogue-masterdata.functions";
import {
  indexDraftPriceOverrides,
  previewPriceListApplication,
} from "@/lib/sales/price-list-draft";
import { getWorkflowSettings } from "@/lib/settings/workflow-settings.functions";
import { addDaysIso } from "@/lib/sales/line-helpers";
import { toMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useVoiceForm } from "@/components/ai-voice/voice-context";
import { validateVoiceDraft } from "@/lib/ai-voice/form-adapter";
import { recordVoiceDraftOutcome } from "@/lib/ai-voice/voice-audit.functions";
import { PageHeader, LoadingState, EmptyState } from "@/components/common/states";
import { EntityCombobox } from "@/components/common/EntityCombobox";
import { ContactCreateForm } from "@/components/lookup/create-forms";
import { SalesDocumentLines } from "@/components/sales/SalesDocumentLines";
import { emptySalesLine, type SalesLineFormState } from "@/lib/sales/line-form-state";
import {
  currencyOptions,
  lineFormToInput,
  lineRowToForm,
  type SavedLineRow,
} from "@/components/sales/sales-form-utils";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DocumentRecordPanel,
  type DocumentRecordHandle,
} from "@/components/documents/DocumentRecordPanel";
import { Button } from "@/components/ui/button";
import { VoiceInput as Input } from "@/components/ai-voice/voice-fields";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

export type SalesDocKind = "invoice" | "quote" | "credit_note";

export type ExistingSalesDoc = {
  id: string;
  contactId: string;
  date: string;
  /** Invoice due date or quote expiry date. */
  secondDate: string | null;
  number: string | null;
  memo: string | null;
  currencyCode: string;
  fxRateToBase: number;
  /** Credit note: the invoice it credits. */
  sourceInvoiceId: string | null;
  lines: SavedLineRow[];
};

const COPY = {
  invoice: {
    noun: "invoice",
    newTitle: "New invoice",
    editTitle: "Edit draft invoice",
    numberLabel: "Invoice #",
    dateLabel: "Invoice date",
    secondLabel: "Due date",
    authorise: "Save & authorise (post)",
    queryKey: "sales-invoices",
  },
  quote: {
    noun: "quote",
    newTitle: "New quote",
    editTitle: "Edit quote",
    numberLabel: "Quote #",
    dateLabel: "Quote date",
    secondLabel: "Expiry date",
    authorise: "",
    queryKey: "sales-quotes",
  },
  credit_note: {
    noun: "credit note",
    newTitle: "New credit note",
    editTitle: "Edit draft credit note",
    numberLabel: "Credit note #",
    dateLabel: "Credit date",
    secondLabel: "",
    authorise: "Save & authorise (post)",
    queryKey: "sales-credits",
  },
} as const;

type Props = {
  kind: SalesDocKind;
  existing?: ExistingSalesDoc;
  /** Credit note only: start from this invoice ("Credit from invoice"). */
  fromInvoiceId?: string | undefined;
  /** Start with this customer selected. */
  initialContactId?: string | undefined;
};

export function SalesDocumentEditor({ kind, existing, fromInvoiceId, initialContactId }: Props) {
  const copy = COPY[kind];
  const { company } = useActiveCompany();
  const { can } = useCan();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const companyId = company?.id;

  const fetchCustomers = useServerFn(listCustomers);
  const fetchAccounts = useServerFn(listAccounts);
  const fetchProducts = useServerFn(listProducts);
  const fetchCustomerPriceList = useServerFn(getCustomerPriceListDefault);
  const fetchPriceLists = useServerFn(listProductPriceLists);
  const resolvePriceList = useServerFn(resolveSalesDraftPriceList);
  const fetchSettings = useServerFn(getWorkflowSettings);
  const fetchConfig = useServerFn(getSalesDocumentConfig);
  const fetchInvoice = useServerFn(getInvoice);
  const fetchInvoices = useServerFn(listInvoices);
  const saveInvoice = useServerFn(saveInvoiceDraft);
  const saveAndAuthorise = useServerFn(saveAndAuthoriseInvoice);
  const saveQuote = useServerFn(saveQuoteDraft);
  const saveCredit = useServerFn(saveCreditNoteDraft);
  const authoriseCredit = useServerFn(authoriseCreditNote);
  const recordVoiceSave = useServerFn(recordVoiceDraftOutcome);
  const savingRef = useRef(false);
  const voiceSaveWarning = useRef<string | undefined>(undefined);

  const enabled = Boolean(companyId);
  const customersQ = useQuery({
    queryKey: ["customers", companyId],
    enabled,
    queryFn: () => fetchCustomers({ data: { companyId: companyId! } }),
  });
  const accountsQ = useQuery({
    queryKey: ["accounts", companyId],
    enabled,
    queryFn: () => fetchAccounts({ data: { companyId: companyId! } }),
  });
  const productsQ = useQuery({
    queryKey: ["products", companyId],
    enabled,
    queryFn: () => fetchProducts({ data: { companyId: companyId!, limit: 200 } }),
  });
  const isSalesDraft = kind === "invoice" || kind === "quote";
  const priceListsQ = useQuery({
    queryKey: ["product-price-lists", companyId],
    enabled: enabled && isSalesDraft,
    queryFn: () => fetchPriceLists({ data: { companyId: companyId! } }),
  });
  const settingsQ = useQuery({
    queryKey: ["workflow-settings", companyId],
    enabled,
    queryFn: () => fetchSettings({ data: { companyId: companyId! } }),
  });
  const configQ = useQuery({
    queryKey: ["sales-doc-config", companyId],
    enabled,
    queryFn: () => fetchConfig({ data: { companyId: companyId! } }),
  });
  const sourceInvQ = useQuery({
    queryKey: ["sales-invoice", companyId, fromInvoiceId],
    enabled: enabled && kind === "credit_note" && Boolean(fromInvoiceId) && !existing,
    queryFn: () => fetchInvoice({ data: { companyId: companyId!, invoiceId: fromInvoiceId! } }),
  });

  const config = configQ.data;
  const base = config?.baseCurrency ?? company?.base_currency ?? "GBP";
  const today = config?.today ?? new Date().toISOString().slice(0, 10);

  const [savedId, setSavedId] = useState<string | undefined>(existing?.id);
  const recordRef = useRef<DocumentRecordHandle>(null);
  const recordEntityType =
    kind === "invoice" ? "sales_invoice" : kind === "quote" ? "sales_quote" : "sales_credit_note";
  const [contactId, setContactId] = useState(existing?.contactId ?? initialContactId ?? "");
  const [docDate, setDocDate] = useState(existing?.date ?? "");
  const [secondDate, setSecondDate] = useState(existing?.secondDate ?? "");
  const [number, setNumber] = useState(existing?.number ?? "");
  const [memo, setMemo] = useState(existing?.memo ?? "");
  const [currency, setCurrency] = useState(existing?.currencyCode ?? "");
  const [fxRate, setFxRate] = useState(existing ? String(existing.fxRateToBase) : "");
  const [sourceInvoiceId, setSourceInvoiceId] = useState(
    existing?.sourceInvoiceId ?? fromInvoiceId ?? "",
  );
  // null: accept the customer's default; "": explicitly use normal catalogue prices.
  const [manualPriceListId, setManualPriceListId] = useState<string | null>(null);
  const [applyPriceListOpen, setApplyPriceListOpen] = useState(false);
  const [priceListAmountsTouched, setPriceListAmountsTouched] = useState(false);
  const [lines, setLines] = useState<SalesLineFormState[]>(() =>
    existing
      ? existing.lines.map((l) => lineRowToForm(l, existing.currencyCode))
      : [emptySalesLine()],
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [defaultsApplied, setDefaultsApplied] = useState(Boolean(existing));
  const [sourceApplied, setSourceApplied] = useState(Boolean(existing));

  const customerDefaultQ = useQuery({
    queryKey: ["customer-price-list", companyId, contactId, currency],
    enabled: enabled && isSalesDraft && !existing && Boolean(contactId && currency),
    queryFn: () => fetchCustomerPriceList({
      data: {
        companyId: companyId!,
        contactId,
        documentCurrency: currency,
      },
    }),
  });
  const selectedPriceListId = resolvedDraftPriceList(
    manualPriceListId,
    customerDefaultQ.data?.priceListId,
  );
  const customerDefaultPending = Boolean(
    isSalesDraft && !existing && contactId && currency &&
    manualPriceListId === null && customerDefaultQ.isPending,
  );
  const selectedPriceList = priceListsQ.data?.find((list) =>
    list.id === selectedPriceListId && list.is_active && list.currency_code === currency,
  );
  const targetProductIds = useMemo(
    () => [
      ...new Set([
        ...(productsQ.data ?? []).map((product) => product.id),
        ...lines.map((line) => line.productId).filter(Boolean),
      ]),
    ],
    [productsQ.data, lines],
  );
  const priceListTooLarge = targetProductIds.length > 250;
  const draftPricesQ = useQuery({
    queryKey: [
      "sales-draft-price-list", companyId, selectedPriceListId, currency,
      targetProductIds.join(","),
    ],
    enabled:
      enabled && isSalesDraft && Boolean(selectedPriceListId && currency) &&
      !priceListTooLarge && Boolean(selectedPriceList),
    queryFn: () => resolvePriceList({
      data: {
        companyId: companyId!,
        priceListId: selectedPriceListId,
        documentCurrency: currency,
        productIds: targetProductIds,
      },
    }),
  });
  const draftPricesReady = Boolean(selectedPriceList && draftPricesQ.isSuccess);
  const draftPriceOverrides = useMemo(
    () =>
      draftPricesReady
        ? indexDraftPriceOverrides(draftPricesQ.data?.items ?? [])
        : {},
    [draftPricesReady, draftPricesQ.data],
  );
  const pricePreview = useMemo(
    () => draftPricesReady
      ? previewPriceListApplication(lines, draftPriceOverrides, currency)
      : null,
    [draftPricesReady, lines, draftPriceOverrides, currency],
  );

  // Changing organisation clears local manual selection; document line values stay untouched.
  useEffect(() => {
    setManualPriceListId(null);
    setApplyPriceListOpen(false);
  }, [companyId]);

  const onDocumentCurrencyChange = (nextCurrency: string) => {
    if (nextCurrency === currency) return;
    if (
      (selectedPriceListId || priceListAmountsTouched) &&
      !window.confirm(
        "Changing currency clears the selected price list. Unit prices already entered or " +
          "applied are NOT converted. Review each line before saving. Continue?",
      )
    ) {
      return;
    }
    setManualPriceListId("");
    setApplyPriceListOpen(false);
    setCurrency(nextCurrency);
  };

  // Defaults (dates in the company's timezone, base currency, terms, notes) once config loads.
  useEffect(() => {
    if (defaultsApplied || !config || !settingsQ.data) return;
    setDocDate(today);
    setCurrency(base);
    if (kind === "invoice") {
      setSecondDate(addDaysIso(today, settingsQ.data.sales_default_payment_terms_days ?? 30));
    } else if (kind === "quote") {
      setSecondDate(addDaysIso(today, 30));
    }
    if (settingsQ.data.sales_default_notes && kind !== "credit_note") {
      setMemo(settingsQ.data.sales_default_notes);
    }
    setDefaultsApplied(true);
  }, [defaultsApplied, config, settingsQ.data, today, base, kind]);

  // "Credit from invoice": copy customer, currency and lines from the source invoice.
  useEffect(() => {
    if (sourceApplied || !sourceInvQ.data) return;
    const inv = sourceInvQ.data;
    setContactId(inv.contact_id);
    setCurrency(inv.currency_code);
    setFxRate(String((inv as { fx_rate_to_base?: number }).fx_rate_to_base ?? 1));
    setMemo(`Credit for invoice ${inv.invoice_number ?? ""}`.trim());
    setLines(
      inv.sales_invoice_lines.map((l) =>
        lineRowToForm(
          {
            description: l.description,
            account_id: l.account_id,
            quantity: l.quantity,
            unit_price_minor: l.unit_price_minor,
            discount_minor: l.discount_minor,
            tax_rate_bps: l.tax_rate_bps,
            tax_code_id: l.tax_code_id ?? null,
            product_id: l.product_id ?? null,
          },
          inv.currency_code,
        ),
      ),
    );
    setSourceApplied(true);
  }, [sourceApplied, sourceInvQ.data]);

  const customers = useMemo(
    () =>
      (customersQ.data ?? []) as Array<{
        id: string;
        name: string;
        payment_terms_days: number | null;
      }>,
    [customersQ.data],
  );
  const customerOptions = useMemo(
    () => customers.map((c) => ({ value: c.id, label: c.name })),
    [customers],
  );

  // Credit notes can reference one of the customer's posted invoices.
  const customerInvoicesQ = useQuery({
    queryKey: ["sales-invoices-for-credit", companyId, contactId],
    enabled: enabled && kind === "credit_note" && Boolean(contactId),
    queryFn: () =>
      fetchInvoices({
        data: { companyId: companyId!, contactId, pageSize: 200, sort: "invoice_date" },
      }),
  });
  const creditableInvoices = (
    (customerInvoicesQ.data?.rows ?? []) as Array<{
      id: string;
      invoice_number: string | null;
      status: string;
      currency_code: string;
    }>
  ).filter((i) => !["draft", "void"].includes(i.status));

  const incomeAccounts = (
    (accountsQ.data ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      account_type: string;
      is_postable: boolean;
      is_active: boolean;
    }>
  ).filter(
    (a) => a.is_active && a.is_postable && (a.account_type === "income" || a.code.startsWith("4")),
  );

  const treatment = config?.treatment ?? "exclusive";
  const isForeign = currency !== "" && currency !== base;
  const sourceLocked = kind === "credit_note" && Boolean(sourceInvoiceId);

  const onCustomerChange = (id: string) => {
    if (id === contactId) return;
    if (
      priceListAmountsTouched &&
      !window.confirm(
        "Changing customer selects that customer's price-list default, if available. " +
          "Previously entered unit prices will NOT be changed. Review them before saving. Continue?",
      )
    ) return;
    setContactId(id);
    setManualPriceListId(existing ? "" : null);
    setApplyPriceListOpen(false);
    if (kind === "credit_note") setSourceInvoiceId("");
    if (kind === "invoice") {
      const c = customers.find((x) => x.id === id);
      const terms = c?.payment_terms_days ?? settingsQ.data?.sales_default_payment_terms_days ?? 30;
      setSecondDate(addDaysIso(docDate || today, terms));
    }
  };

  const onDocumentDateChange = (date: string) => {
    setDocDate(date);
    if (kind === "invoice") {
      const customer = customers.find((c) => c.id === contactId);
      const terms =
        customer?.payment_terms_days ?? settingsQ.data?.sales_default_payment_terms_days ?? 30;
      setSecondDate(addDaysIso(date, terms));
    }
  };

  const mutation = useMutation({
    mutationFn: async (alsoAuthorise: boolean) => {
      if (savingRef.current) throw new Error("Save already in progress");
      savingRef.current = true;
      voiceSaveWarning.current = undefined;
      try {
        setFormError(null);
        if (!companyId) throw new Error("No organisation");
        if (!contactId) throw new Error("Choose a customer");
        if (!docDate) throw new Error(`${copy.dateLabel} is required`);
        const fx = isForeign ? Number(fxRate) : 1;
        if (isForeign && !(fx > 0)) throw new Error(`Enter the exchange rate to ${base}`);
        const payloadLines = lines.map((l) => lineFormToInput(l, currency));
        const common = {
          companyId,
          contactId,
          memo,
          currencyCode: currency,
          fxRateToBase: fx,
          lines: payloadLines,
        };

        if (kind === "invoice") {
          if (!secondDate) throw new Error("Due date is required");
          const data = {
            ...common,
            ...(savedId ? { invoiceId: savedId } : {}),
            invoiceDate: docDate,
            dueDate: secondDate,
            invoiceNumber: number,
          };
          if (alsoAuthorise) {
            const r = await saveAndAuthorise({ data });
            return { id: r.id, authoriseError: r.authoriseError, authorised: !r.authoriseError };
          }
          const r = await saveInvoice({ data });
          return { id: r.id, authoriseError: null as string | null, authorised: false };
        }
        if (kind === "quote") {
          const r = await saveQuote({
            data: {
              ...common,
              ...(savedId ? { quoteId: savedId } : {}),
              quoteDate: docDate,
              expiryDate: secondDate,
              quoteNumber: number,
            },
          });
          return { id: r.id, authoriseError: null as string | null, authorised: false };
        }
        const r = await saveCredit({
          data: {
            ...common,
            ...(savedId ? { creditNoteId: savedId } : {}),
            creditDate: docDate,
            creditNumber: number,
            ...(sourceInvoiceId ? { invoiceId: sourceInvoiceId } : {}),
          },
        });
        if (alsoAuthorise) {
          try {
            await authoriseCredit({ data: { companyId, creditNoteId: r.id } });
            return { id: r.id, authoriseError: null as string | null, authorised: true };
          } catch (e) {
            return { id: r.id, authoriseError: friendlyAuthError(e), authorised: false };
          }
        }
        return { id: r.id, authoriseError: null as string | null, authorised: false };
      } finally {
        savingRef.current = false;
      }
    },
    onSuccess: async (res) => {
      // Keep the id: a retry after an authorise failure updates THIS draft, never creates another.
      setSavedId(res.id);
      try {
        await recordRef.current?.flush(res.id);
      } catch (e) {
        const msg = friendlyAuthError(e);
        voiceSaveWarning.current = `Draft saved, but notes or files could not be stored: ${msg}`;
        setFormError(`Saved, but notes or files could not be stored: ${msg}`);
        toast.error("Saved, but notes or files could not be stored");
        return;
      }
      await qc.invalidateQueries({ queryKey: [copy.queryKey, companyId] });
      await qc.invalidateQueries({ queryKey: ["sales-invoice", companyId, res.id] });
      if (res.authoriseError) {
        setFormError(`Saved as a draft, but it could not be authorised: ${res.authoriseError}`);
        toast.error("Saved as draft — authorise failed");
        return;
      }
      toast.success(
        res.authorised
          ? `${cap(copy.noun)} authorised and posted`
          : savedId
            ? `${cap(copy.noun)} updated`
            : `Draft ${copy.noun} saved`,
      );
      if (kind === "invoice") {
        navigate({ to: "/sales/invoices/$invoiceId", params: { invoiceId: res.id } });
      } else if (kind === "quote") {
        navigate({ to: "/sales/quotes/$quoteId", params: { quoteId: res.id } });
      } else {
        navigate({ to: "/sales/credit-notes/$creditNoteId", params: { creditNoteId: res.id } });
      }
    },
    onError: (e) => {
      const msg = friendlyAuthError(e);
      setFormError(msg);
      toast.error(msg);
    },
  });

  const voiceDraft = {
    contactId,
    date: docDate,
    dueDate: secondDate,
    currency,
    memo,
    number,
    lines,
  };
  const voiceToken = useVoiceForm(
    companyId
      ? {
          companyId,
          module: kind,
          permission: "sales.draft",
          draft: voiceDraft,
          revision: JSON.stringify([savedId, voiceDraft, sourceInvoiceId, fxRate]),
          ready:
            defaultsApplied &&
            !customersQ.isPending &&
            !accountsQ.isPending &&
            !configQ.isPending &&
            !settingsQ.isPending,
          busy: mutation.isPending,
          today,
          dateFormat: company?.date_format ?? "DD/MM/YYYY",
          contacts: customers,
          accounts: incomeAccounts.map((a) => ({ id: a.id, name: `${a.code} ${a.name}` })),
          taxes: (config?.taxCodes ?? []).map((t) => ({
            id: t.id,
            name: `${t.code} ${t.name}`,
            rateBps: t.rate_bps,
          })),
          currencies: currencyOptions(base, currency ? [currency] : []),
          selectContact: (id) => {
            if (sourceLocked) {
              if (id !== contactId)
                throw new Error(
                  "This credit note is linked to an invoice. Its customer cannot be changed here.",
                );
              return;
            }
            onCustomerChange(id);
          },
          update: (patch) => {
            if (patch.date !== undefined) onDocumentDateChange(patch.date);
            if (patch.dueDate !== undefined) setSecondDate(patch.dueDate);
            if (patch.currency !== undefined) {
              if (sourceLocked && patch.currency !== currency)
                throw new Error("This credit note must keep the source invoice’s currency.");
              onDocumentCurrencyChange(patch.currency);
            }
            if (patch.memo !== undefined) setMemo(patch.memo);
            if (patch.number !== undefined) setNumber(patch.number);
          },
          updateLines: (next) => setLines(next.map((line) => ({ ...emptySalesLine(), ...line }))),
          validate: () => [
            ...validateVoiceDraft(voiceDraft, kind === "invoice"),
            ...(isForeign && !(Number(fxRate) > 0) ? ["Enter the exchange rate in the form."] : []),
          ],
          saveDraft: async () => {
            const result = await mutation.mutateAsync(false);
            try {
              await recordVoiceSave({
                data: {
                  companyId,
                  module: kind,
                  recordId: result.id,
                  actionId: crypto.randomUUID(),
                },
              });
            } catch {
              return {
                id: result.id,
                warning:
                  "Draft saved, but its voice audit marker could not be recorded. Review the document activity.",
              };
            }
            return {
              id: result.id,
              ...(voiceSaveWarning.current ? { warning: voiceSaveWarning.current } : {}),
            };
          },
        }
      : null,
  );

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (
    customersQ.isPending ||
    accountsQ.isPending ||
    configQ.isPending ||
    settingsQ.isPending ||
    (kind === "credit_note" && Boolean(fromInvoiceId) && !existing && sourceInvQ.isPending)
  ) {
    return <LoadingState />;
  }

  const backTo =
    kind === "invoice"
      ? "/sales/invoices"
      : kind === "quote"
        ? "/sales/quotes"
        : "/sales/credit-notes";
  const title = savedId || existing ? copy.editTitle : copy.newTitle;

  return (
    <VoiceFields token={voiceToken}>
      <PageHeader
        title={title}
        description={
          kind === "credit_note"
            ? "Authorising posts DR revenue / DR output tax / CR accounts receivable. Apply it to invoices afterwards."
            : kind === "invoice"
              ? "Defaults come from Sales settings and the customer’s payment terms. Authorising posts AR + revenue/tax once."
              : "Quotes do not post to the ledger. Convert to an invoice when the customer accepts."
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to={backTo}>Back</Link>
          </Button>
        }
      />
      {formError ? (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid max-w-4xl gap-4">
        <div className="space-y-2">
          <Label>Customer</Label>
          <EntityCombobox
            voiceField={{ key: "contactId", label: "Customer", order: 10 }}
            aria-label="Customer"
            options={customerOptions}
            value={contactId}
            onChange={onCustomerChange}
            placeholder="Search customers"
            allowClear={false}
            disabled={sourceLocked}
            companyId={companyId}
            canAddNew={can("contacts.manage") && !sourceLocked}
            createTitle="New customer"
            renderCreate={
              can("contacts.manage") && !sourceLocked
                ? (ctx) => <ContactCreateForm companyId={companyId} kind="customer" ctx={ctx} />
                : undefined
            }
            onCreated={(option) => {
              if (kind !== "invoice") return;
              const terms = Number(option.meta);
              if (Number.isFinite(terms)) setSecondDate(addDaysIso(docDate || today, terms));
            }}
          />
        </div>
        {kind === "credit_note" ? (
          <div className="space-y-2">
            <Label>Credit against invoice (optional)</Label>
            <EntityCombobox
              aria-label="Source invoice"
              options={creditableInvoices.map((i) => ({
                value: i.id,
                label: `${i.invoice_number ?? i.id.slice(0, 8)} (${i.status.replace("_", " ")}, ${i.currency_code})`,
              }))}
              value={sourceInvoiceId}
              onChange={(v) => {
                setSourceInvoiceId(v);
                const inv = creditableInvoices.find((i) => i.id === v);
                if (inv) setCurrency(inv.currency_code);
              }}
              placeholder={contactId ? "None — standalone credit" : "Choose a customer first"}
              disabled={!contactId}
            />
          </div>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>{copy.dateLabel}</Label>
            <Input
              type="date"
              voiceField={{
                key: "date",
                label: "Document date",
                aliases: ["date", "invoice date", "quote date", "credit note date"],
                order: 20,
              }}
              value={docDate}
              onChange={(e) => onDocumentDateChange(e.target.value)}
            />
          </div>
          {copy.secondLabel ? (
            <div className="space-y-2">
              <Label>{copy.secondLabel}</Label>
              <Input
                type="date"
                voiceField={{
                  key: "dueDate",
                  label: "Due date",
                  aliases: ["expiry date"],
                  order: 30,
                }}
                value={secondDate}
                onChange={(e) => setSecondDate(e.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label>{copy.numberLabel}</Label>
            <Input
              voiceField={{
                key: "number",
                label: "Number",
                aliases: ["reference", "invoice number", "supplier reference", "reference number"],
                order: 40,
              }}
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Leave blank to auto-number"
            />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Currency</Label>
            <VoiceSelect
              voiceField={{ key: "currency", label: "Currency", order: 50 }}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={currency}
              disabled={sourceLocked}
              onChange={(e) => onDocumentCurrencyChange(e.target.value)}
            >
              {currencyOptions(base, currency ? [currency] : []).map((c) => (
                <option key={c} value={c}>
                  {c}
                  {c === base ? " (base)" : ""}
                </option>
              ))}
            </VoiceSelect>
          </div>
          {isForeign ? (
            <div className="space-y-2">
              <Label>
                Exchange rate (1 {currency} = ? {base})
              </Label>
              <Input
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                inputMode="decimal"
                placeholder="e.g. 0.79"
              />
            </div>
          ) : null}
        </div>
        {isSalesDraft ? (
          <div className="space-y-3 rounded-md border p-3">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="sales-price-list">Sales price list (optional)</Label>
                <Select
                  value={selectedPriceListId || "none"}
                  onValueChange={(value) => {
                    setManualPriceListId(value === "none" ? "" : value);
                    setApplyPriceListOpen(false);
                  }}
                >
                  <SelectTrigger id="sales-price-list" aria-label="Sales price list">
                    <SelectValue placeholder="Catalogue prices" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Catalogue prices (default)</SelectItem>
                    {(priceListsQ.data ?? [])
                      .filter((list) => list.is_active && list.currency_code === currency)
                      .map((list) => (
                        <SelectItem key={list.id} value={list.id}>{list.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  !draftPricesReady || !pricePreview?.changed || mutation.isPending
                }
                onClick={() => setApplyPriceListOpen(true)}
              >
                Preview existing-line prices
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Price lists are available in their own currency only. New catalogue selections use
              the chosen list where an item price exists. Existing lines keep their prices unless
              you explicitly preview and apply replacements. Saved documents retain their line
              prices; the list selection itself is not stored on the document.
            </p>
            {customerDefaultPending ? (
              <p className="text-xs text-muted-foreground">
                Checking the selected customer's default price list…
              </p>
            ) : null}
            {manualPriceListId === null && customerDefaultQ.data?.reason === "available" ? (
              <p className="text-xs text-muted-foreground">
                Customer default selected for this new draft. You can choose a different list.
              </p>
            ) : null}
            {manualPriceListId === null &&
              customerDefaultQ.data?.reason === "unavailable_or_currency_mismatch" ? (
              <p className="text-xs text-muted-foreground">
                The customer has a default list, but it is archived or uses another currency.
                Catalogue pricing will apply unless you choose an eligible list.
              </p>
            ) : null}
            {manualPriceListId === null && customerDefaultQ.isError ? (
              <div role="alert" className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-destructive">
                  Customer default lookup failed: {friendlyAuthError(customerDefaultQ.error)}
                </p>
                <Button size="sm" variant="outline" onClick={() => customerDefaultQ.refetch()}>
                  Retry
                </Button>
              </div>
            ) : null}
            {priceListsQ.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Could not load price lists: {friendlyAuthError(priceListsQ.error)}
              </p>
            ) : null}
            {priceListTooLarge && selectedPriceListId ? (
              <p role="alert" className="text-sm text-destructive">
                Too many different products to resolve this list (maximum 250).
                Reduce the catalogue selection before using a price list.
              </p>
            ) : null}
            {selectedPriceListId && draftPricesQ.isPending && !priceListTooLarge ? (
              <p className="text-sm text-muted-foreground">Loading price-list amounts…</p>
            ) : null}
            {selectedPriceListId && draftPricesQ.isError ? (
              <div role="alert" className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-destructive">
                  Price-list amounts unavailable: {friendlyAuthError(draftPricesQ.error)}
                </p>
                <Button variant="outline" size="sm" onClick={() => draftPricesQ.refetch()}>
                  Retry
                </Button>
              </div>
            ) : null}
            {selectedPriceListId && !selectedPriceList && !priceListsQ.isPending ? (
              <p role="alert" className="text-sm text-destructive">
                This price list is archived or does not match the document currency.
                Choose another list or the default catalogue prices.
              </p>
            ) : null}
            {pricePreview ? (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {pricePreview.matched} current line(s) have list overrides;
                {pricePreview.changed} price(s) differ. No existing line is automatically changed.
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2">
          <Label>Memo / customer message</Label>
          <Input
            voiceField={{
              key: "memo",
              label: "Memo",
              aliases: ["internal reference", "customer message"],
              order: 60,
            }}
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>
        <SalesDocumentLines
          lines={lines}
          onChange={setLines}
          products={(productsQ.data ?? []) as never}
          priceOverrides={draftPricesReady ? draftPriceOverrides : {}}
          productSelectionDisabled={
            customerDefaultPending ||
            (Boolean(selectedPriceListId) && !draftPricesReady)
          }
          onPriceListProductSelected={() => setPriceListAmountsTouched(true)}
          accounts={incomeAccounts}
          currency={currency || base}
          treatment={treatment}
          taxCodes={config?.taxCodes ?? []}
          toMinor={(d) => toMinorUnits(d, currency || base)}
          companyId={companyId}
          baseCurrency={base}
        />
        <DocumentRecordPanel
          ref={recordRef}
          entityType={recordEntityType}
          entityId={savedId ?? null}
          audience="customer"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(false)}
          >
            {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {savedId ? "Save changes" : "Save draft"}
          </Button>
          {copy.authorise ? (
            <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate(true)}>
              {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {copy.authorise}
            </Button>
          ) : null}
        </div>
      </div>
      <Dialog
        open={applyPriceListOpen}
        onOpenChange={(open) => {
          if (!mutation.isPending) setApplyPriceListOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Apply current price list to existing lines?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {pricePreview?.changed ?? 0} price(s) will change.
            This operation changes only unit prices on matching lines in this draft.
            Quantity, tax, discount, account and unlisted item prices are retained.
          </p>
          <div className="space-y-2">
            {lines.map((line, index) => {
              const newPrice = pricePreview?.lines[index]?.unitPrice;
              if (newPrice === undefined || newPrice === line.unitPrice) return null;
              return (
                <p key={index} className="text-sm">
                  Line {index + 1}: {line.unitPrice} → {newPrice} {currency}
                </p>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyPriceListOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!draftPricesReady || !pricePreview?.changed || mutation.isPending}
              onClick={() => {
                if (!draftPricesReady || !pricePreview?.changed) return;
                const count = pricePreview.changed;
                setLines(pricePreview.lines);
                setPriceListAmountsTouched(true);
                setApplyPriceListOpen(false);
                toast.success(
                  `Updated ${count} draft line price(s). Save the document to retain them.`,
                );
              }}
            >
              Apply these prices
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </VoiceFields>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

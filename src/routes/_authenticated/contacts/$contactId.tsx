import { nativeTabLinkClass, handleNativeTabKeyDown } from "@/lib/navigation/native-tab";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import {
  getContact,
  getContactBalances,
  upsertContact,
  archiveContact,
  upsertContactPerson,
  deleteContactPerson,
  listContactGroups,
  listContactTags,
  setContactGroups,
  setContactTags,
} from "@/lib/contacts/contacts.functions";
import { fromMinorUnits, toMinorUnits, toSafeMinorNumber } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { DocumentRecordPanel } from "@/components/documents/DocumentRecordPanel";
import { ContactPortalPanel } from "@/components/portals/staff-panels";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/contacts/$contactId")({
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: ["overview", "edit", "people", "groups", "activity", "portal"].includes(
      String(search["tab"]),
    )
      ? String(search["tab"])
      : "overview",
  }),
  head: () => ({ meta: [{ title: "Contact — LinkBooks" }] }),
  component: ContactDetail,
});

const HISTORY_PAGE_SIZE = 50;

function ContactDetail() {
  const { contactId } = Route.useParams();
  const { tab } = Route.useSearch();
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";
  const qc = useQueryClient();
  const canManage = useCanDo("contacts.manage");
  const [invoicePage, setInvoicePage] = useState(0);
  const [billPage, setBillPage] = useState(0);

  const fetchContact = useServerFn(getContact);
  const fetchBalances = useServerFn(getContactBalances);
  const saveContact = useServerFn(upsertContact);
  const archiveFn = useServerFn(archiveContact);
  const savePerson = useServerFn(upsertContactPerson);
  const removePerson = useServerFn(deleteContactPerson);
  const fetchGroups = useServerFn(listContactGroups);
  const fetchTags = useServerFn(listContactTags);
  const saveGroups = useServerFn(setContactGroups);
  const saveTags = useServerFn(setContactTags);

  const contactQ = useQuery({
    queryKey: ["contact", companyId, contactId],
    enabled: Boolean(companyId),
    queryFn: () => fetchContact({ data: { companyId: companyId!, contactId } }),
  });
  const balQ = useQuery({
    queryKey: ["contact-balances", companyId, contactId, invoicePage, billPage],
    enabled: Boolean(companyId),
    queryFn: () =>
      fetchBalances({
        data: {
          companyId: companyId!,
          contactId,
          limit: HISTORY_PAGE_SIZE,
          invoiceOffset: invoicePage * HISTORY_PAGE_SIZE,
          billOffset: billPage * HISTORY_PAGE_SIZE,
        },
      }),
  });
  const groupsQ = useQuery({
    queryKey: ["contact-groups", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchGroups({ data: { companyId: companyId! } }),
  });
  const tagsQ = useQuery({
    queryKey: ["contact-tags", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchTags({ data: { companyId: companyId! } }),
  });

  const c = contactQ.data?.contact as
    | {
        name?: unknown;
        kind?: unknown;
        email?: unknown;
        phone?: unknown;
        tax_number?: unknown;
        payment_terms_days?: unknown;
        notes?: unknown;
        account_number?: unknown;
        legal_name?: unknown;
        website?: unknown;
        billing_address_line1?: unknown;
        billing_address_line2?: unknown;
        billing_city?: unknown;
        billing_region?: unknown;
        billing_postal?: unknown;
        billing_country?: unknown;
        delivery_address_line1?: unknown;
        delivery_address_line2?: unknown;
        delivery_city?: unknown;
        delivery_region?: unknown;
        delivery_postal?: unknown;
        delivery_country?: unknown;
        default_currency?: unknown;
        credit_limit_minor?: unknown;
        sales_tax_inclusive?: unknown;
        purchase_tax_inclusive?: unknown;
        archived_at?: unknown;
      }
    | undefined;

  const [name, setName] = useState("");
  const [kind, setKind] = useState("customer");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [terms, setTerms] = useState("30");
  const [notes, setNotes] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [legalName, setLegalName] = useState("");
  const [website, setWebsite] = useState("");
  const [billingLine1, setBillingLine1] = useState("");
  const [billingLine2, setBillingLine2] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingRegion, setBillingRegion] = useState("");
  const [billingPostal, setBillingPostal] = useState("");
  const [billingCountry, setBillingCountry] = useState("");
  const [deliveryLine1, setDeliveryLine1] = useState("");
  const [deliveryLine2, setDeliveryLine2] = useState("");
  const [deliveryCity, setDeliveryCity] = useState("");
  const [deliveryRegion, setDeliveryRegion] = useState("");
  const [deliveryPostal, setDeliveryPostal] = useState("");
  const [deliveryCountry, setDeliveryCountry] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [salesTaxInclusive, setSalesTaxInclusive] = useState("default");
  const [purchaseTaxInclusive, setPurchaseTaxInclusive] = useState("default");
  const [personFirst, setPersonFirst] = useState("");
  const [personLast, setPersonLast] = useState("");
  const [personEmail, setPersonEmail] = useState("");
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionStatus, setTransactionStatus] = useState("all");
  const [transactionSort, setTransactionSort] = useState("newest");

  useEffect(() => {
    setInvoicePage(0);
    setBillPage(0);
  }, [contactId]);

  useEffect(() => {
    if (!c) return;
    setName(String(c.name ?? ""));
    setKind(String(c.kind ?? "customer"));
    setEmail(String(c.email ?? ""));
    setPhone(String(c.phone ?? ""));
    setTaxNumber(String(c.tax_number ?? ""));
    setTerms(String(c.payment_terms_days ?? 30));
    setNotes(String(c.notes ?? ""));
    setAccountNumber(String(c.account_number ?? ""));
    setLegalName(String(c.legal_name ?? ""));
    setWebsite(String(c.website ?? ""));
    setBillingLine1(String(c.billing_address_line1 ?? ""));
    setBillingLine2(String(c.billing_address_line2 ?? ""));
    setBillingCity(String(c.billing_city ?? ""));
    setBillingRegion(String(c.billing_region ?? ""));
    setBillingPostal(String(c.billing_postal ?? ""));
    setBillingCountry(String(c.billing_country ?? ""));
    setDeliveryLine1(String(c.delivery_address_line1 ?? ""));
    setDeliveryLine2(String(c.delivery_address_line2 ?? ""));
    setDeliveryCity(String(c.delivery_city ?? ""));
    setDeliveryRegion(String(c.delivery_region ?? ""));
    setDeliveryPostal(String(c.delivery_postal ?? ""));
    setDeliveryCountry(String(c.delivery_country ?? ""));
    setDefaultCurrency(String(c.default_currency ?? ""));
    const limit = c.credit_limit_minor;
    setCreditLimit(
      limit == null ? "" : fromMinorUnits(Number(limit), String(c.default_currency || currency)),
    );
    setSalesTaxInclusive(
      c.sales_tax_inclusive == null ? "default" : c.sales_tax_inclusive ? "inclusive" : "exclusive",
    );
    setPurchaseTaxInclusive(
      c.purchase_tax_inclusive == null
        ? "default"
        : c.purchase_tax_inclusive
          ? "inclusive"
          : "exclusive",
    );
  }, [c, currency]);

  useEffect(() => {
    const g = (contactQ.data?.groups ?? []) as Array<{
      group_id?: string;
      contact_groups?: { id: string };
    }>;
    setSelectedGroups(g.map((x) => x.group_id ?? x.contact_groups?.id).filter(Boolean) as string[]);
    const t = (contactQ.data?.tags ?? []) as Array<{
      tag_id?: string;
      contact_tags?: { id: string };
    }>;
    setSelectedTags(t.map((x) => x.tag_id ?? x.contact_tags?.id).filter(Boolean) as string[]);
  }, [contactQ.data]);

  const validTerms = /^\d+$/.test(terms) && Number(terms) <= 3650;
  const effectiveCurrency = (defaultCurrency || currency).toUpperCase();
  const validCurrency = !defaultCurrency || /^[A-Z]{3}$/i.test(defaultCurrency);
  const validCreditLimit = (() => {
    if (!creditLimit.trim()) return true;
    try {
      const minor = toMinorUnits(creditLimit, effectiveCurrency);
      return minor >= 0n && minor <= BigInt(Number.MAX_SAFE_INTEGER);
    } catch {
      return false;
    }
  })();

  const saveM = useMutation({
    mutationFn: () =>
      saveContact({
        data: {
          companyId: companyId!,
          id: contactId,
          name,
          kind,
          email,
          phone,
          taxNumber,
          paymentTermsDays: Number(terms),
          notes,
          accountNumber,
          legalName,
          website,
          billingAddressLine1: billingLine1,
          billingAddressLine2: billingLine2,
          billingCity,
          billingRegion,
          billingPostal,
          billingCountry,
          deliveryAddressLine1: deliveryLine1,
          deliveryAddressLine2: deliveryLine2,
          deliveryCity,
          deliveryRegion,
          deliveryPostal,
          deliveryCountry,
          defaultCurrency,
          creditLimitMinor: creditLimit.trim()
            ? toSafeMinorNumber(
                toMinorUnits(creditLimit, effectiveCurrency),
                "Contact credit limit",
              )
            : null,
          salesTaxInclusive:
            salesTaxInclusive === "default" ? null : salesTaxInclusive === "inclusive",
          purchaseTaxInclusive:
            purchaseTaxInclusive === "default" ? null : purchaseTaxInclusive === "inclusive",
        },
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["contact", companyId, contactId] }),
        qc.invalidateQueries({ queryKey: ["contacts", companyId] }),
        qc.invalidateQueries({ queryKey: ["contacts-count", companyId] }),
        qc.invalidateQueries({ queryKey: ["contacts-summary", companyId] }),
      ]);
      toast.success("Contact updated");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const archiveM = useMutation({
    mutationFn: (restore: boolean) =>
      archiveFn({ data: { companyId: companyId!, contactId, restore } }),
    onSuccess: async (_, restore) => {
      await qc.invalidateQueries({ queryKey: ["contact", companyId, contactId] });
      await qc.invalidateQueries({ queryKey: ["contacts", companyId] });
      await qc.invalidateQueries({ queryKey: ["contacts-count", companyId] });
      await qc.invalidateQueries({ queryKey: ["contacts-summary", companyId] });
      toast.success(restore ? "Contact restored" : "Contact archived");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const personM = useMutation({
    mutationFn: () =>
      savePerson({
        data: {
          companyId: companyId!,
          contactId,
          firstName: personFirst,
          lastName: personLast,
          email: personEmail,
          isPrimary: true,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contact", companyId, contactId] });
      setPersonFirst("");
      setPersonLast("");
      setPersonEmail("");
      toast.success("Person added");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const groupsM = useMutation({
    mutationFn: () =>
      saveGroups({ data: { companyId: companyId!, contactId, groupIds: selectedGroups } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contact", companyId, contactId] });
      toast.success("Groups updated");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const tagsM = useMutation({
    mutationFn: () =>
      saveTags({ data: { companyId: companyId!, contactId, tagIds: selectedTags } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contact", companyId, contactId] });
      toast.success("Tags updated");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (contactQ.isPending) return <LoadingState />;
  if (contactQ.isError || !c) {
    return <ErrorState title="Contact not found" description={friendlyAuthError(contactQ.error)} />;
  }

  const people = (contactQ.data?.people ?? []) as Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    is_primary: boolean;
  }>;

  const isCustomer = kind === "customer" || kind === "both";
  const isSupplier = kind === "supplier" || kind === "both";
  const archived = Boolean(c.archived_at);

  return (
    <>
      <PageHeader
        title={String(c.name)}
        description={`${kind} · terms ${terms} days${accountNumber ? ` · #${accountNumber}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {isCustomer ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/sales/invoices/new">New invoice</Link>
              </Button>
            ) : null}
            {isSupplier ? (
              <Button variant="outline" size="sm" asChild>
                <Link to="/purchases/bills/new">New bill</Link>
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={archiveM.isPending || !canManage}
              title={canManage ? undefined : "You do not have permission to archive contacts"}
              onClick={() => archiveM.mutate(archived)}
            >
              {archived ? "Restore" : "Archive"}
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/contacts" search={{ view: undefined }}>
                Directory
              </Link>
            </Button>
          </div>
        }
      />

      {balQ.data ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            label={`Receivables (${balQ.data.baseCurrency})`}
            value={fromMinorUnits(balQ.data.receivableMinor, balQ.data.baseCurrency)}
            hint={otherCurrencies(balQ.data.receivableByCurrency, balQ.data.baseCurrency)}
          />
          <Metric
            label="Overdue receivables"
            value={fromMinorUnits(balQ.data.overdueReceivableMinor, balQ.data.baseCurrency)}
          />
          <Metric
            label={`Payables (${balQ.data.baseCurrency})`}
            value={fromMinorUnits(balQ.data.payableMinor, balQ.data.baseCurrency)}
            hint={otherCurrencies(balQ.data.payableByCurrency, balQ.data.baseCurrency)}
          />
          <Metric
            label="Overdue payables"
            value={fromMinorUnits(balQ.data.overduePayableMinor, balQ.data.baseCurrency)}
          />
        </div>
      ) : null}

      <Tabs value={tab}>
        <TabsList onKeyDown={handleNativeTabKeyDown} className="flex h-auto flex-wrap">
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "overview"}
            data-state={tab === "overview" ? "active" : "inactive"}
            to="/contacts/$contactId"
            params={{ contactId }}
            search={{ tab: "overview" }}
            resetScroll={false}
          >
            Overview
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "edit"}
            data-state={tab === "edit" ? "active" : "inactive"}
            to="/contacts/$contactId"
            params={{ contactId }}
            search={{ tab: "edit" }}
            resetScroll={false}
          >
            Edit
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "people"}
            data-state={tab === "people" ? "active" : "inactive"}
            to="/contacts/$contactId"
            params={{ contactId }}
            search={{ tab: "people" }}
            resetScroll={false}
          >
            People
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "groups"}
            data-state={tab === "groups" ? "active" : "inactive"}
            to="/contacts/$contactId"
            params={{ contactId }}
            search={{ tab: "groups" }}
            resetScroll={false}
          >
            Groups & tags
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "activity"}
            data-state={tab === "activity" ? "active" : "inactive"}
            to="/contacts/$contactId"
            params={{ contactId }}
            search={{ tab: "activity" }}
            resetScroll={false}
          >
            Transactions
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={tab === "portal"}
            data-state={tab === "portal" ? "active" : "inactive"}
            to="/contacts/$contactId"
            params={{ contactId }}
            search={{ tab: "portal" }}
            resetScroll={false}
          >
            Portal
          </Link>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-3 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{kind}</Badge>
            {archived ? <Badge variant="secondary">Archived</Badge> : null}
          </div>
          <p>
            {email || "No email"} · {phone || "No phone"}
          </p>
          <p>
            Tax ID: {taxNumber || "—"} · Legal name: {legalName || "—"}
          </p>
          <p>
            Billing: {[billingLine1, billingCity, billingCountry].filter(Boolean).join(", ") || "—"}
          </p>
          {notes ? (
            <p className="rounded-md border bg-muted/40 p-3 text-muted-foreground">
              Internal notes: {notes}
            </p>
          ) : null}
        </TabsContent>

        <TabsContent value="edit" className="mt-4 max-w-2xl space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Role">
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="customer">Customer</SelectItem>
                  <SelectItem value="supplier">Supplier</SelectItem>
                  <SelectItem value="both">Customer & supplier</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Account number">
              <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
            </Field>
            <Field label="Legal / business name">
              <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} />
            </Field>
            <Field label="Email">
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Tax / VAT ID">
              <Input value={taxNumber} onChange={(e) => setTaxNumber(e.target.value)} />
            </Field>
            <Field label="Payment terms (days)">
              <Input value={terms} onChange={(e) => setTerms(e.target.value)} />
            </Field>
            <Field label="Website">
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} />
            </Field>
          </div>
          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">Financial defaults</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Default currency (ISO code)">
                <Input
                  value={defaultCurrency}
                  maxLength={3}
                  placeholder={currency}
                  onChange={(e) => setDefaultCurrency(e.target.value.toUpperCase())}
                />
              </Field>
              <Field label={`Credit limit (${effectiveCurrency})`}>
                <Input
                  inputMode="decimal"
                  value={creditLimit}
                  placeholder="No limit"
                  onChange={(e) => setCreditLimit(e.target.value)}
                />
              </Field>
              <Field label="Sales tax default">
                <Select value={salesTaxInclusive} onValueChange={setSalesTaxInclusive}>
                  <SelectTrigger aria-label="Sales tax default">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use company default</SelectItem>
                    <SelectItem value="inclusive">Tax inclusive</SelectItem>
                    <SelectItem value="exclusive">Tax exclusive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Purchase tax default">
                <Select value={purchaseTaxInclusive} onValueChange={setPurchaseTaxInclusive}>
                  <SelectTrigger aria-label="Purchase tax default">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use company default</SelectItem>
                    <SelectItem value="inclusive">Tax inclusive</SelectItem>
                    <SelectItem value="exclusive">Tax exclusive</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </section>
          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">Billing address</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Line 1">
                <Input value={billingLine1} onChange={(e) => setBillingLine1(e.target.value)} />
              </Field>
              <Field label="Line 2">
                <Input value={billingLine2} onChange={(e) => setBillingLine2(e.target.value)} />
              </Field>
              <Field label="City">
                <Input value={billingCity} onChange={(e) => setBillingCity(e.target.value)} />
              </Field>
              <Field label="Region / state">
                <Input value={billingRegion} onChange={(e) => setBillingRegion(e.target.value)} />
              </Field>
              <Field label="Postal code">
                <Input value={billingPostal} onChange={(e) => setBillingPostal(e.target.value)} />
              </Field>
              <Field label="Country">
                <Input value={billingCountry} onChange={(e) => setBillingCountry(e.target.value)} />
              </Field>
            </div>
          </section>
          <section className="space-y-3 rounded-lg border p-4">
            <h3 className="font-medium">Delivery address</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Line 1">
                <Input value={deliveryLine1} onChange={(e) => setDeliveryLine1(e.target.value)} />
              </Field>
              <Field label="Line 2">
                <Input value={deliveryLine2} onChange={(e) => setDeliveryLine2(e.target.value)} />
              </Field>
              <Field label="City">
                <Input value={deliveryCity} onChange={(e) => setDeliveryCity(e.target.value)} />
              </Field>
              <Field label="Region / state">
                <Input value={deliveryRegion} onChange={(e) => setDeliveryRegion(e.target.value)} />
              </Field>
              <Field label="Postal code">
                <Input value={deliveryPostal} onChange={(e) => setDeliveryPostal(e.target.value)} />
              </Field>
              <Field label="Country">
                <Input
                  value={deliveryCountry}
                  onChange={(e) => setDeliveryCountry(e.target.value)}
                />
              </Field>
            </div>
          </section>
          <Field label={`Internal notes (${notes.length}/4000)`}>
            <Textarea
              value={notes}
              maxLength={4000}
              rows={4}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            Internal notes never appear on customer-facing documents automatically. Changing
            defaults does not rewrite posted invoices or bills.
          </p>
          {!validTerms ? (
            <p role="alert" className="text-sm text-destructive">
              Payment terms must be a whole number from 0 to 3650 days.
            </p>
          ) : null}
          {!validCurrency ? (
            <p role="alert" className="text-sm text-destructive">
              Currency must be a three-letter ISO code.
            </p>
          ) : null}
          {!validCreditLimit ? (
            <p role="alert" className="text-sm text-destructive">
              Enter a non-negative credit limit within the supported precision and range.
            </p>
          ) : null}
          <Button
            disabled={
              !canManage ||
              saveM.isPending ||
              !name.trim() ||
              !validTerms ||
              !validCurrency ||
              !validCreditLimit
            }
            onClick={() => saveM.mutate()}
          >
            Save changes
          </Button>
        </TabsContent>

        <TabsContent value="people" className="mt-4 space-y-4">
          <div className="grid max-w-xl gap-2 rounded-md border p-3 sm:grid-cols-3">
            <Input
              placeholder="First name"
              value={personFirst}
              onChange={(e) => setPersonFirst(e.target.value)}
            />
            <Input
              placeholder="Last name"
              value={personLast}
              onChange={(e) => setPersonLast(e.target.value)}
            />
            <Input
              placeholder="Email"
              value={personEmail}
              onChange={(e) => setPersonEmail(e.target.value)}
            />
            <Button
              size="sm"
              className="sm:col-span-3"
              disabled={
                !canManage || personM.isPending || (!personFirst.trim() && !personEmail.trim())
              }
              onClick={() => personM.mutate()}
            >
              Add person
            </Button>
          </div>
          {people.length === 0 ? (
            <p className="text-sm text-muted-foreground">No additional people yet.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {people.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span>
                    {p.first_name} {p.last_name}
                    {p.is_primary ? " · primary" : ""}
                    {p.email ? ` · ${p.email}` : ""}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={!canManage}
                    onClick={async () => {
                      try {
                        await removePerson({ data: { companyId: companyId!, personId: p.id } });
                        await qc.invalidateQueries({ queryKey: ["contact", companyId, contactId] });
                      } catch (e) {
                        toast.error(friendlyAuthError(e));
                      }
                    }}
                  >
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="groups" className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium">Groups</h3>
            <div className="space-y-2">
              {((groupsQ.data ?? []) as Array<{ id: string; name: string; is_active: boolean }>)
                .filter((g) => g.is_active)
                .map((g) => (
                  <label key={g.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedGroups.includes(g.id)}
                      onCheckedChange={(checked) => {
                        setSelectedGroups((prev) =>
                          checked ? [...prev, g.id] : prev.filter((id) => id !== g.id),
                        );
                      }}
                    />
                    {g.name}
                  </label>
                ))}
            </div>
            <Button
              size="sm"
              className="mt-3"
              disabled={!canManage || groupsM.isPending}
              onClick={() => groupsM.mutate()}
            >
              Save groups
            </Button>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">Tags</h3>
            <div className="space-y-2">
              {((tagsQ.data ?? []) as Array<{ id: string; name: string; is_active: boolean }>)
                .filter((t) => t.is_active)
                .map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedTags.includes(t.id)}
                      onCheckedChange={(checked) => {
                        setSelectedTags((prev) =>
                          checked ? [...prev, t.id] : prev.filter((id) => id !== t.id),
                        );
                      }}
                    />
                    {t.name}
                  </label>
                ))}
            </div>
            <Button
              size="sm"
              className="mt-3"
              disabled={!canManage || tagsM.isPending}
              onClick={() => tagsM.mutate()}
            >
              Save tags
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Create groups and tags under Contacts → Settings.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="portal" className="mt-4">
          {companyId ? (
            <ContactPortalPanel
              companyId={companyId}
              contactId={contactId}
              isCustomer={isCustomer}
              isSupplier={isSupplier}
            />
          ) : null}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          {balQ.isPending ? (
            <LoadingState />
          ) : balQ.isError ? (
            <ErrorState
              title="Could not load balances"
              description={friendlyAuthError(balQ.error)}
            />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-end gap-3" aria-label="Transaction filters">
                <div className="min-w-48 flex-1 space-y-1">
                  <Label htmlFor="contact-transaction-search">Search current page</Label>
                  <Input
                    id="contact-transaction-search"
                    placeholder="Number, status, date or amount in loaded rows"
                    value={transactionSearch}
                    onChange={(e) => setTransactionSearch(e.target.value)}
                  />
                </div>
                <div className="w-40 space-y-1">
                  <Label>Status (current page)</Label>
                  <Select value={transactionStatus} onValueChange={setTransactionStatus}>
                    <SelectTrigger aria-label="Filter transaction status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="awaiting">Awaiting</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="partly">Partly paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                      <SelectItem value="void">Void</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-40 space-y-1">
                  <Label>Sort current page</Label>
                  <Select value={transactionSort} onValueChange={setTransactionSort}>
                    <SelectTrigger aria-label="Sort transactions">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="newest">Newest first</SelectItem>
                      <SelectItem value="oldest">Oldest first</SelectItem>
                      <SelectItem value="highest">Highest total</SelectItem>
                      <SelectItem value="lowest">Lowest total</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Sales invoices</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {balQ.data!.invoiceCount
                      ? `${invoicePage * HISTORY_PAGE_SIZE + 1}–${Math.min(
                          (invoicePage + 1) * HISTORY_PAGE_SIZE,
                          balQ.data!.invoiceCount,
                        )} of ${balQ.data!.invoiceCount}`
                      : "No invoices"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={invoicePage === 0}
                    onClick={() => setInvoicePage((page) => Math.max(0, page - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(invoicePage + 1) * HISTORY_PAGE_SIZE >= balQ.data!.invoiceCount}
                    onClick={() => setInvoicePage((page) => page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(
                    balQ.data!.invoices as Array<{
                      id: string;
                      invoice_date: string;
                      invoice_number: string | null;
                      status: string;
                      total_minor: number;
                      currency_code?: string | null;
                    }>
                  )
                    .filter((row) => {
                      const query = transactionSearch.trim().toLowerCase();
                      const searchable = [
                        row.invoice_number ?? "",
                        row.invoice_date,
                        row.status,
                        fromMinorUnits(row.total_minor, row.currency_code ?? currency),
                      ]
                        .join(" ")
                        .toLowerCase();
                      const status = row.status.toLowerCase().replace(/[\\s_-]/g, "");
                      return (
                        (!query || searchable.includes(query)) &&
                        (transactionStatus === "all" || status.includes(transactionStatus))
                      );
                    })
                    .sort((a, b) => {
                      if (transactionSort === "highest") return b.total_minor - a.total_minor;
                      if (transactionSort === "lowest") return a.total_minor - b.total_minor;
                      return transactionSort === "oldest"
                        ? a.invoice_date.localeCompare(b.invoice_date)
                        : b.invoice_date.localeCompare(a.invoice_date);
                    })
                    .map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <Link
                            to="/sales/invoices/$invoiceId"
                            params={{ invoiceId: i.id }}
                            className="underline-offset-2 hover:underline"
                          >
                            {i.invoice_date}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/sales/invoices/$invoiceId"
                            params={{ invoiceId: i.id }}
                            className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            aria-label={`Open invoice ${i.invoice_number ?? i.id}: ${i.invoice_number ?? "—"}`}
                          >
                            {i.invoice_number ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/sales/invoices/$invoiceId"
                            params={{ invoiceId: i.id }}
                            className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            aria-label={`Open invoice ${i.invoice_number ?? i.id}: ${i.status}`}
                          >
                            {i.status}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            to="/sales/invoices/$invoiceId"
                            params={{ invoiceId: i.id }}
                            className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            aria-label={`Open invoice ${i.invoice_number ?? i.id}: ${`${fromMinorUnits(i.total_minor, i.currency_code ?? currency)} ${i.currency_code ?? ""}`}`}
                          >{`${fromMinorUnits(i.total_minor, i.currency_code ?? currency)} ${i.currency_code ?? ""}`}</Link>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              <div className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Purchase bills</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {balQ.data!.billCount
                      ? `${billPage * HISTORY_PAGE_SIZE + 1}–${Math.min(
                          (billPage + 1) * HISTORY_PAGE_SIZE,
                          balQ.data!.billCount,
                        )} of ${balQ.data!.billCount}`
                      : "No bills"}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={billPage === 0}
                    onClick={() => setBillPage((page) => Math.max(0, page - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={(billPage + 1) * HISTORY_PAGE_SIZE >= balQ.data!.billCount}
                    onClick={() => setBillPage((page) => page + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(
                    balQ.data!.bills as Array<{
                      id: string;
                      bill_date: string;
                      bill_number: string | null;
                      status: string;
                      total_minor: number;
                      currency_code?: string | null;
                    }>
                  )
                    .filter((row) => {
                      const query = transactionSearch.trim().toLowerCase();
                      const searchable = [
                        row.bill_number ?? "",
                        row.bill_date,
                        row.status,
                        fromMinorUnits(row.total_minor, row.currency_code ?? currency),
                      ]
                        .join(" ")
                        .toLowerCase();
                      const status = row.status.toLowerCase().replace(/[\\s_-]/g, "");
                      return (
                        (!query || searchable.includes(query)) &&
                        (transactionStatus === "all" || status.includes(transactionStatus))
                      );
                    })
                    .sort((a, b) => {
                      if (transactionSort === "highest") return b.total_minor - a.total_minor;
                      if (transactionSort === "lowest") return a.total_minor - b.total_minor;
                      return transactionSort === "oldest"
                        ? a.bill_date.localeCompare(b.bill_date)
                        : b.bill_date.localeCompare(a.bill_date);
                    })
                    .map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <Link
                            to="/purchases/bills/$billId"
                            params={{ billId: b.id }}
                            className="underline-offset-2 hover:underline"
                          >
                            {b.bill_date}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/purchases/bills/$billId"
                            params={{ billId: b.id }}
                            className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            aria-label={`Open bill ${b.bill_number ?? b.id}: ${b.bill_number ?? "—"}`}
                          >
                            {b.bill_number ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link
                            to="/purchases/bills/$billId"
                            params={{ billId: b.id }}
                            className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            aria-label={`Open bill ${b.bill_number ?? b.id}: ${b.status}`}
                          >
                            {b.status}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right">
                          <Link
                            to="/purchases/bills/$billId"
                            params={{ billId: b.id }}
                            className="block w-full rounded-sm underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                            aria-label={`Open bill ${b.bill_number ?? b.id}: ${`${fromMinorUnits(b.total_minor, b.currency_code ?? currency)} ${b.currency_code ?? ""}`}`}
                          >{`${fromMinorUnits(b.total_minor, b.currency_code ?? currency)} ${b.currency_code ?? ""}`}</Link>
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </>
          )}
        </TabsContent>
      </Tabs>
      <DocumentRecordPanel entityType="contact" entityId={contactId} audience="internal" />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function otherCurrencies(
  rows: Array<{ currency: string; outstandingMinor: number }> | undefined,
  base: string,
): string | undefined {
  const others = (rows ?? []).filter((r) => r.currency !== base.toUpperCase());
  if (!others.length) return undefined;
  return `Also ${others.map((r) => `${fromMinorUnits(r.outstandingMinor, r.currency)} ${r.currency}`).join(", ")}`;
}

function Metric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
}) {
  return (
    <div className="rounded-md border px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

import { getRouteApi } from "@tanstack/react-router";
import { useState } from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { upsertContact, upsertContactPerson } from "@/lib/contacts/contacts.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
const routeApi = getRouteApi("/_authenticated/contacts/new");

export function NewContactRoute() {
  const { kind } = routeApi.useSearch();
  return <NewContact initialKind={kind} />;
}

const sections = [
  ["identity", "Contact details"],
  ["addresses", "Addresses"],
  ["financial", "Financial details"],
  ["tax", "Tax details"],
  ["sales", "Sales defaults"],
  ["purchases", "Purchase defaults"],
] as const;
type Section = (typeof sections)[number][0];
type Person = { firstName: string; lastName: string; email: string; phone: string };
const initial = {
  name: "",
  kind: "customer",
  accountNumber: "",
  legalName: "",
  email: "",
  phone: "",
  website: "",
  notes: "",
  taxNumber: "",
  paymentTermsDays: "30",
  defaultCurrency: "",
  creditLimit: "",
  billingAddressLine1: "",
  billingAddressLine2: "",
  billingCity: "",
  billingRegion: "",
  billingPostal: "",
  billingCountry: "",
  deliveryAddressLine1: "",
  deliveryAddressLine2: "",
  deliveryCity: "",
  deliveryRegion: "",
  deliveryPostal: "",
  deliveryCountry: "",
  salesTaxInclusive: "default",
  purchaseTaxInclusive: "default",
};
type FormState = typeof initial;
export function NewContact({
  initialKind = "customer",
  embedded = false,
  onSaved,
}: { initialKind?: "customer" | "supplier"; embedded?: boolean; onSaved?: () => void } = {}) {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const canManage = useCanDo("contacts.manage");
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(upsertContact);
  const savePerson = useServerFn(upsertContactPerson);
  const [section, setSection] = useState<Section>("identity");
  const [form, setForm] = useState<FormState>({ ...initial, kind: initialKind });
  const [people, setPeople] = useState<Person[]>([]);
  const set = (key: keyof FormState, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const field = (key: keyof FormState, label: string, placeholder = "") => (
    <div className="space-y-1.5" key={key}>
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => set(key, e.target.value)}
      />
    </div>
  );
  const selector = (key: "salesTaxInclusive" | "purchaseTaxInclusive", label: string) => (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={form[key]} onValueChange={(v) => set(key, v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Use organisation default</SelectItem>
          <SelectItem value="inclusive">Tax inclusive</SelectItem>
          <SelectItem value="exclusive">Tax exclusive</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
  const validTerms = /^\d+$/.test(form.paymentTermsDays) && Number(form.paymentTermsDays) <= 3650;
  const validLimit =
    form.creditLimit === "" ||
    (/^\d+(\.\d{1,2})?$/.test(form.creditLimit) &&
      Number.isSafeInteger(Math.round(Number(form.creditLimit) * 100)));
  const mutation = useMutation({
    mutationFn: async () => {
      if (!companyId || !form.name.trim() || !validTerms || !validLimit)
        throw new Error("Review required fields");
      const result = await save({
        data: {
          companyId,
          name: form.name,
          kind: form.kind,
          email: form.email,
          phone: form.phone,
          accountNumber: form.accountNumber,
          legalName: form.legalName,
          website: form.website,
          notes: form.notes,
          taxNumber: form.taxNumber,
          paymentTermsDays: Number(form.paymentTermsDays),
          defaultCurrency: form.defaultCurrency,
          creditLimitMinor: form.creditLimit ? Math.round(Number(form.creditLimit) * 100) : null,
          billingAddressLine1: form.billingAddressLine1,
          billingAddressLine2: form.billingAddressLine2,
          billingCity: form.billingCity,
          billingRegion: form.billingRegion,
          billingPostal: form.billingPostal,
          billingCountry: form.billingCountry,
          deliveryAddressLine1: form.deliveryAddressLine1,
          deliveryAddressLine2: form.deliveryAddressLine2,
          deliveryCity: form.deliveryCity,
          deliveryRegion: form.deliveryRegion,
          deliveryPostal: form.deliveryPostal,
          deliveryCountry: form.deliveryCountry,
          salesTaxInclusive:
            form.salesTaxInclusive === "default" ? null : form.salesTaxInclusive === "inclusive",
          purchaseTaxInclusive:
            form.purchaseTaxInclusive === "default"
              ? null
              : form.purchaseTaxInclusive === "inclusive",
        },
      });
      // A failed person save does not hide a successfully created contact.
      const failures: string[] = [];
      for (let i = 0; i < people.length; i++) {
        const person = people[i];
        if (!person || (!person.firstName.trim() && !person.email.trim())) continue;
        try {
          await savePerson({
            data: { companyId, contactId: result.id, ...person, isPrimary: i === 0 },
          });
        } catch (error) {
          failures.push(friendlyAuthError(error));
        }
      }
      return { id: result.id, failures };
    },
    onSuccess: async ({ id, failures }) => {
      await qc.invalidateQueries({ queryKey: ["contacts", companyId] });
      await qc.invalidateQueries({ queryKey: ["contacts-summary", companyId] });
      if (failures.length)
        toast.warning("Contact saved, but some people could not be added. Review the People tab.");
      else toast.success("Contact created");
      if (onSaved) onSaved();
      else void navigate({ to: "/contacts/$contactId", params: { contactId: id } });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  if (!companyId)
    return <EmptyState title="No organisation" description="Select an organisation first." />;
  const activeIndex = sections.findIndex(([id]) => id === section);
  const workspace = (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">Contact workspace</h2>
        <p className="text-sm text-muted-foreground">
          Complete the sections you need. Only contact name and role are required.
        </p>
      </div>
      <div className="grid lg:grid-cols-[210px_minmax(0,1fr)]">
        <nav
          aria-label="Contact sections"
          className="flex gap-1 overflow-x-auto border-b p-3 lg:flex-col lg:border-b-0 lg:border-r"
        >
          {sections.map(([id, label], i) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-left text-sm transition-colors ${section === id ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-muted"}`}
            >
              {i + 1}. {label}
            </button>
          ))}
        </nav>
        <div className="min-h-[480px] space-y-5 p-5 md:p-7">
          {section === "identity" && (
            <>
              <h3 className="text-lg font-semibold">Contact details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Contact role</Label>
                  <Select value={form.kind} onValueChange={(v) => set("kind", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="supplier">Supplier</SelectItem>
                      <SelectItem value="both">Customer & supplier</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {field("name", "Contact name *", "Business or individual name")}
                {field("accountNumber", "Account number", "Leave blank for automatic numbering")}
                {field("legalName", "Legal / registered name")}
                {field("website", "Website")}
                {field("email", "Main email")}
                {field("phone", "Main phone")}
              </div>
              <div className="border-t pt-5">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="font-semibold">Contact people</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setPeople((p) => [
                        ...p,
                        { firstName: "", lastName: "", email: "", phone: "" },
                      ])
                    }
                  >
                    Add person
                  </Button>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  The first person is marked as primary. Additional people are saved after the
                  contact.
                </p>
                {people.map((person, i) => (
                  <div key={i} className="mb-3 grid gap-3 rounded-lg border p-3 md:grid-cols-2">
                    {(["firstName", "lastName", "email", "phone"] as const).map((key) => (
                      <div key={key} className="space-y-1">
                        <Label>
                          {
                            {
                              firstName: "First name",
                              lastName: "Last name",
                              email: "Email",
                              phone: "Phone",
                            }[key]
                          }
                        </Label>
                        <Input
                          value={person[key]}
                          onChange={(e) =>
                            setPeople((p) =>
                              p.map((x, j) => (j === i ? { ...x, [key]: e.target.value } : x)),
                            )
                          }
                        />
                      </div>
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPeople((p) => p.filter((_, j) => j !== i))}
                    >
                      Remove person
                    </Button>
                  </div>
                ))}
              </div>
              <div className="space-y-1.5">
                <Label>Internal notes ({form.notes.length}/4000)</Label>
                <Textarea
                  value={form.notes}
                  maxLength={4000}
                  rows={4}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </div>
            </>
          )}
          {section === "addresses" && (
            <>
              <h3 className="text-lg font-semibold">Addresses</h3>
              <p className="text-sm text-muted-foreground">
                Billing and delivery addresses are stored separately.
              </p>
              <h4 className="border-b pb-2 font-semibold">Billing address</h4>
              <div className="grid gap-4 md:grid-cols-2">
                {field("billingAddressLine1", "Address line 1")}
                {field("billingAddressLine2", "Address line 2")}
                {field("billingCity", "City")}
                {field("billingRegion", "State / region")}
                {field("billingPostal", "Postal code")}
                {field("billingCountry", "Country")}
              </div>
              <h4 className="border-b pb-2 font-semibold">Delivery address</h4>
              <div className="grid gap-4 md:grid-cols-2">
                {field("deliveryAddressLine1", "Address line 1")}
                {field("deliveryAddressLine2", "Address line 2")}
                {field("deliveryCity", "City")}
                {field("deliveryRegion", "State / region")}
                {field("deliveryPostal", "Postal code")}
                {field("deliveryCountry", "Country")}
              </div>
            </>
          )}
          {section === "financial" && (
            <>
              <h3 className="text-lg font-semibold">Financial details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {field(
                  "defaultCurrency",
                  "Default currency (ISO code)",
                  company.base_currency ?? "GBP",
                )}
                {field("creditLimit", "Customer credit limit", "0.00")}
              </div>
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                Bank account information requires encrypted storage, masking and verified
                payment-change controls. It is not collected in this release.
              </p>
            </>
          )}
          {section === "tax" && (
            <>
              <h3 className="text-lg font-semibold">Tax details</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {field("taxNumber", "Tax / VAT / GST identification number")}
                {field("legalName", "Registered tax name")}
              </div>
              <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
                W-9, 1099, and jurisdiction-specific classifications require dedicated compliance
                controls and are not inferred from this number.
              </p>
            </>
          )}
          {section === "sales" && (
            <>
              <h3 className="text-lg font-semibold">Sales defaults</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {field("paymentTermsDays", "Payment terms (days)")}
                {selector("salesTaxInclusive", "Sales amounts entered as")}
                {field("creditLimit", "Credit limit", "0.00")}
              </div>
              <p className="text-sm text-muted-foreground">
                Contact defaults never rewrite posted invoices. Ledger account selection and
                document auto-fill will be enabled after integration testing.
              </p>
            </>
          )}
          {section === "purchases" && (
            <>
              <h3 className="text-lg font-semibold">Purchase defaults</h3>
              <div className="grid gap-4 md:grid-cols-2">
                {field("paymentTermsDays", "Payment terms (days)")}
                {selector("purchaseTaxInclusive", "Purchase amounts entered as")}
              </div>
              <p className="text-sm text-muted-foreground">
                Existing LinkBooks contacts use one shared payment-terms value. Separate sales and
                purchase terms need a schema and document-workflow upgrade.
              </p>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 md:px-7">
        <span className="text-xs text-muted-foreground">
          Step {activeIndex + 1} of {sections.length} · No data is saved until you select Save
          contact
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            type="button"
            onClick={() => setSection(sections[Math.max(0, activeIndex - 1)]![0])}
            disabled={activeIndex === 0}
          >
            Previous
          </Button>
          {activeIndex < sections.length - 1 && (
            <Button
              variant="outline"
              type="button"
              onClick={() => setSection(sections[activeIndex + 1]![0])}
            >
              Next
            </Button>
          )}
          <Button
            type="button"
            disabled={
              !canManage || !form.name.trim() || !validTerms || !validLimit || mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Saving…" : "Save contact"}
          </Button>
        </div>
      </div>
    </div>
  );
  if (embedded) return workspace;
  return (
    <ListWorkspace
      title="New contact"
      description="Create a shared customer or supplier profile with accounting defaults."
      actions={
        <Button variant="outline" asChild>
          <Link to="/contacts" search={{ view: undefined }}>
            Back to directory
          </Link>
        </Button>
      }
    >
      {workspace}
    </ListWorkspace>
  );
}

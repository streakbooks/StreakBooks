import { nativeTabLinkClass, handleNativeTabKeyDown } from "@/lib/navigation/native-tab";
import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import {
  getTaxSettings,
  listTaxCountryPacks,
  seedTaxPack,
  updateTaxSettings,
} from "@/lib/tax/tax.functions";
import { filterTaxAccountPicker, type PickerAccount } from "@/lib/tax/account-pickers";
import { TaxCodesPanel } from "@/components/tax/TaxCodesPanel";
import { TaxOverviewPanel, type TaxOverviewSettings } from "@/components/tax/TaxOverviewPanel";
import { TaxRatesPanel } from "@/components/tax/TaxRatesPanel";
import { TaxReturnsPanel } from "@/components/tax/TaxReturnsPanel";
import {
  packsForCountry,
  suggestedRegimeForCountry,
  verificationStatusLabel,
} from "@/lib/tax/country-packs";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { AccountLookup } from "@/components/lookup";
import { LoadingState, EmptyState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";

export const Route = createFileRoute("/_authenticated/tax")({
  validateSearch: (raw: Record<string, unknown>): { tab?: string | undefined } => ({
    tab: ["overview", "registration", "returns", "rates", "codes", "mappings", "packs"].includes(
      String(raw["tab"]),
    )
      ? String(raw["tab"])
      : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Tax configuration — LinkBooks" },
      {
        name: "description",
        content: "Organisation tax rates, codes and account mappings.",
      },
    ],
  }),
  component: TaxConfigPage,
});

function TaxConfigPage() {
  const { company, isPending } = useActiveCompany();
  const companyId = company?.id;
  const canTax = useCanDo("tax.settings");
  const activeTab = Route.useSearch().tab ?? "overview";
  const qc = useQueryClient();

  const fetchSettings = useServerFn(getTaxSettings);
  const saveSettings = useServerFn(updateTaxSettings);
  const doSeed = useServerFn(seedTaxPack);
  const fetchPacks = useServerFn(listTaxCountryPacks);
  const fetchAccounts = useServerFn(listAccounts);
  const orgCountry = company?.country_code ?? "GB";
  const [regDate, setRegDate] = useState("");
  const [selectedPack, setSelectedPack] = useState("");

  const settingsQ = useQuery({
    queryKey: ["tax-settings", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchSettings({ data: { companyId: companyId! } }),
  });
  const accountsQ = useQuery({
    queryKey: ["accounts", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchAccounts({ data: { companyId: companyId! } }),
  });
  const packsQ = useQuery({
    queryKey: ["tax-packs", companyId, orgCountry],
    enabled: Boolean(companyId),
    queryFn: () => fetchPacks({ data: { companyId: companyId!, countryCode: orgCountry } }),
  });

  const [regime, setRegime] = useState("none");
  const [jurisdiction, setJurisdiction] = useState("");
  const [regNumber, setRegNumber] = useState("");
  const [includeTax, setIncludeTax] = useState(false);
  const [basis, setBasis] = useState("invoice");
  const [filing, setFiling] = useState("");
  const [outputAcc, setOutputAcc] = useState("");
  const [inputAcc, setInputAcc] = useState("");
  const [nonRecAcc, setNonRecAcc] = useState("");

  useEffect(() => {
    const s = settingsQ.data as {
      tax_regime: string;
      registration_number: string | null;
      prices_include_tax: boolean;
      tax_basis: string;
      jurisdiction_code: string | null;
      output_tax_account_id: string | null;
      input_tax_account_id: string | null;
      non_recoverable_tax_account_id: string | null;
      filing_frequency: string | null;
    } | null;
    if (!s) return;
    setRegime(s.tax_regime ?? "none");
    setJurisdiction(s.jurisdiction_code ?? "");
    setRegNumber(s.registration_number ?? "");
    setIncludeTax(Boolean(s.prices_include_tax));
    setBasis(s.tax_basis ?? "invoice");
    setOutputAcc(s.output_tax_account_id ?? "");
    setInputAcc(s.input_tax_account_id ?? "");
    setNonRecAcc(s.non_recoverable_tax_account_id ?? "");
    setFiling(s.filing_frequency ?? "");
    setRegDate((s as { registration_date?: string | null }).registration_date ?? "");
  }, [settingsQ.data]);

  // TX-02: each form sends only its own fields. The server updates just those columns, so saving
  // registration never wipes the account mappings or default codes (and the reverse).
  const registrationM = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          companyId: companyId!,
          taxRegime: regime,
          registrationNumber: regNumber,
          pricesIncludeTax: includeTax,
          taxBasis: basis,
          jurisdictionCode: jurisdiction || null,
          registrationDate: regDate || null,
          filingFrequency: filing || null,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tax-settings", companyId] });
      toast.success("Registration saved. Posted history is not rewritten.");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const mappingsM = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          companyId: companyId!,
          outputTaxAccountId: outputAcc || null,
          inputTaxAccountId: inputAcc || null,
          nonRecoverableTaxAccountId: nonRecAcc || null,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tax-settings", companyId] });
      toast.success("Account mappings saved. Posted history is not rewritten.");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const seedM = useMutation({
    mutationFn: (packId?: string) =>
      doSeed({
        data: {
          companyId: companyId!,
          ...(packId || selectedPack ? { packId: packId || selectedPack } : {}),
        },
      }),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["tax-rates", companyId] });
      await qc.invalidateQueries({ queryKey: ["tax-codes", companyId] });
      await qc.invalidateQueries({ queryKey: ["tax-settings", companyId] });
      const detail = res.result
        ? ` Added ${res.result.added_rates ?? 0} rates, ${res.result.added_codes ?? 0} codes.`
        : "";
      toast.success(`Pack applied (idempotent — existing codes kept).${detail}`);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (isPending) return <LoadingState />;
  if (!companyId) {
    return (
      <EmptyState title="No organisation" description="Select an organisation to configure tax." />
    );
  }
  if (settingsQ.isPending) return <LoadingState />;
  if (settingsQ.isError) {
    return <QueryErrorState queries={[settingsQ]} title="Could not load tax settings" />;
  }

  const allAccounts = (accountsQ.data ?? []) as unknown as PickerAccount[];
  const outputAccounts = filterTaxAccountPicker(allAccounts, "output");
  const inputAccounts = filterTaxAccountPicker(allAccounts, "input");
  const nonRecAccounts = filterTaxAccountPicker(allAccounts, "non_recoverable");
  const persisted = settingsQ.data as {
    tax_regime: string;
    jurisdiction_code: string | null;
    registration_number: string | null;
    registration_date: string | null;
    prices_include_tax: boolean;
    tax_basis: string;
    filing_frequency: string | null;
    output_tax_account_id: string | null;
    input_tax_account_id: string | null;
    non_recoverable_tax_account_id: string | null;
  } | null;
  const registrationDirty =
    Boolean(persisted) &&
    (regime !== (persisted?.tax_regime ?? "none") ||
      jurisdiction.trim().toUpperCase() !== (persisted?.jurisdiction_code ?? "") ||
      regNumber.trim() !== (persisted?.registration_number ?? "") ||
      regDate !== (persisted?.registration_date ?? "") ||
      includeTax !== Boolean(persisted?.prices_include_tax) ||
      basis !== (persisted?.tax_basis ?? "invoice") ||
      filing !== (persisted?.filing_frequency ?? ""));
  const mappingsDirty =
    Boolean(persisted) &&
    (outputAcc !== (persisted?.output_tax_account_id ?? "") ||
      inputAcc !== (persisted?.input_tax_account_id ?? "") ||
      nonRecAcc !== (persisted?.non_recoverable_tax_account_id ?? ""));
  const resetRegistration = () => {
    if (!persisted) return;
    setRegime(persisted.tax_regime ?? "none");
    setJurisdiction(persisted.jurisdiction_code ?? "");
    setRegNumber(persisted.registration_number ?? "");
    setRegDate(persisted.registration_date ?? "");
    setIncludeTax(Boolean(persisted.prices_include_tax));
    setBasis(persisted.tax_basis ?? "invoice");
    setFiling(persisted.filing_frequency ?? "");
  };
  const resetMappings = () => {
    if (!persisted) return;
    setOutputAcc(persisted.output_tax_account_id ?? "");
    setInputAcc(persisted.input_tax_account_id ?? "");
    setNonRecAcc(persisted.non_recoverable_tax_account_id ?? "");
  };

  return (
    <ListWorkspace
      title="Tax"
      description={`Tax workspace for ${orgCountry}: registrations, returns, tax rates, codes, country packs and posting accounts.`}
      actions={
        <Button variant="outline" size="sm" asChild>
          <Link to="/reports/$reportId" params={{ reportId: "tax-summary" }}>
            Tax summary report
          </Link>
        </Button>
      }
    >
      <Alert className="mb-6">
        <AlertTitle>Calculation &amp; reporting, not e-filing</AlertTitle>
        <AlertDescription>
          LinkBooks calculates tax on documents and reports control-account movements. It does not
          claim MTD, BAS, GSTN, IRS, or electronic filing. Country packs are configuration scaffolds
          — verify rates against official sources. Changing settings never rewrites posted journals.
        </AlertDescription>
      </Alert>

      <Tabs value={activeTab}>
        <TabsList onKeyDown={handleNativeTabKeyDown} className="mb-4 flex h-auto flex-wrap">
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={activeTab === "overview"}
            data-state={activeTab === "overview" ? "active" : "inactive"}
            to="/tax"
            search={{ tab: "overview" }}
            resetScroll={false}
          >
            Overview
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={activeTab === "registration"}
            data-state={activeTab === "registration" ? "active" : "inactive"}
            to="/tax"
            search={{ tab: "registration" }}
            resetScroll={false}
          >
            Registration
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={activeTab === "returns"}
            data-state={activeTab === "returns" ? "active" : "inactive"}
            to="/tax"
            search={{ tab: "returns" }}
            resetScroll={false}
          >
            Returns
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={activeTab === "rates"}
            data-state={activeTab === "rates" ? "active" : "inactive"}
            to="/tax"
            search={{ tab: "rates" }}
            resetScroll={false}
          >
            Rates
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={activeTab === "codes"}
            data-state={activeTab === "codes" ? "active" : "inactive"}
            to="/tax"
            search={{ tab: "codes" }}
            resetScroll={false}
          >
            Codes
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={activeTab === "mappings"}
            data-state={activeTab === "mappings" ? "active" : "inactive"}
            to="/tax"
            search={{ tab: "mappings" }}
            resetScroll={false}
          >
            GL mappings
          </Link>
          <Link
            className={nativeTabLinkClass}
            role="tab"
            aria-selected={activeTab === "packs"}
            data-state={activeTab === "packs" ? "active" : "inactive"}
            to="/tax"
            search={{ tab: "packs" }}
            resetScroll={false}
          >
            Country packs
          </Link>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <TaxOverviewPanel
            companyId={companyId}
            settings={settingsQ.data as TaxOverviewSettings | null}
          />
        </TabsContent>

        <TabsContent value="registration" className="space-y-4">
          <div className="grid max-w-2xl gap-4 rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Organisation tax settings</h2>
              <Badge variant="outline" role="status" aria-live="polite">
                {!canTax ? "View only" : registrationDirty ? "Unsaved changes" : "Saved"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Suggested regime for {orgCountry}:{" "}
              <strong>{suggestedRegimeForCountry(orgCountry)}</strong>. Country alone does not
              determine tax treatment — set jurisdiction, registration and codes explicitly.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Regime</Label>
                <Select value={regime} onValueChange={setRegime} disabled={!canTax}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="vat">VAT</SelectItem>
                    <SelectItem value="gst">GST</SelectItem>
                    <SelectItem value="sales_tax">Sales tax</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Jurisdiction code</Label>
                <Input
                  placeholder="e.g. GB, AU"
                  value={jurisdiction}
                  disabled={!canTax}
                  onChange={(e) => setJurisdiction(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Registration number</Label>
                <Input
                  value={regNumber}
                  disabled={!canTax}
                  onChange={(e) => setRegNumber(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Registration date</Label>
                <Input
                  type="date"
                  value={regDate}
                  disabled={!canTax}
                  onChange={(e) => setRegDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Tax basis (reporting preference)</Label>
                <Select value={basis} onValueChange={setBasis} disabled={!canTax}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="invoice">Invoice (accrual)</SelectItem>
                    <SelectItem value="cash">
                      Cash (stored; report uses posted journals by date)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Filing frequency</Label>
                <Select
                  disabled={!canTax}
                  value={filing || "unset"}
                  onValueChange={(v) => setFiling(v === "unset" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not set</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="bi_monthly">Every 2 months</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="semi_annually">Every 6 months</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={includeTax} disabled={!canTax} onCheckedChange={setIncludeTax} />
              <Label>Prices include tax (inclusive treatment on documents)</Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={!canTax || !registrationDirty || registrationM.isPending}
                onClick={() => registrationM.mutate()}
              >
                {registrationM.isPending ? "Saving..." : "Save registration & defaults"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!registrationDirty || registrationM.isPending}
                onClick={resetRegistration}
              >
                Discard changes
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="mappings" className="space-y-4">
          <div className="grid max-w-2xl gap-4 rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">GL mappings</h2>
              <Badge variant="outline" role="status" aria-live="polite">
                {!canTax ? "View only" : mappingsDirty ? "Unsaved changes" : "Saved"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Posting uses these accounts when set; otherwise falls back to CoA codes 2100 (output)
              / 1200 (input). Each list only shows accounts of a suitable type (output tax:
              liabilities; input tax: assets or liabilities; non-recoverable tax: expenses or
              assets).
            </p>
            {accountsQ.isError ? (
              <QueryErrorState queries={[accountsQ]} title="Could not load tax accounts" />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Output tax liability</Label>
                  <AccountLookup
                    ariaLabel="Output tax liability"
                    disabled={!canTax || accountsQ.isPending}
                    accounts={outputAccounts}
                    value={outputAcc}
                    onChange={setOutputAcc}
                    companyId={companyId}
                    placeholder="Use fallback (2100)"
                    allowClear
                  />
                </div>
                <div className="space-y-1">
                  <Label>Recoverable input tax</Label>
                  <AccountLookup
                    ariaLabel="Recoverable input tax"
                    disabled={!canTax || accountsQ.isPending}
                    accounts={inputAccounts}
                    value={inputAcc}
                    onChange={setInputAcc}
                    companyId={companyId}
                    placeholder="Use fallback (1200)"
                    allowClear
                  />
                </div>
                <div className="space-y-1">
                  <Label>Non-recoverable tax (cost)</Label>
                  <AccountLookup
                    ariaLabel="Non-recoverable tax"
                    disabled={!canTax || accountsQ.isPending}
                    accounts={nonRecAccounts}
                    value={nonRecAcc}
                    onChange={setNonRecAcc}
                    companyId={companyId}
                    placeholder="Not set"
                    allowClear
                  />
                </div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={
                  !canTax ||
                  !mappingsDirty ||
                  accountsQ.isPending ||
                  accountsQ.isError ||
                  mappingsM.isPending
                }
                onClick={() => mappingsM.mutate()}
              >
                {mappingsM.isPending ? "Saving..." : "Save mappings"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!mappingsDirty || mappingsM.isPending}
                onClick={resetMappings}
              >
                Discard changes
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="packs" className="space-y-4">
          <div className="rounded-md border p-4">
            <h2 className="mb-2 text-sm font-medium">Country packs for {orgCountry}</h2>
            <p className="mb-4 text-xs text-muted-foreground">{packsQ.data?.disclaimer}</p>
            <ul className="mb-4 space-y-3 text-sm">
              {(packsQ.data?.packs ?? packsForCountry(orgCountry)).map((p) => (
                <li key={p.id} className="rounded-md border p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <strong>{p.label}</strong>
                    <StatusBadge
                      status={p.verificationStatus}
                      label={verificationStatusLabel(p.verificationStatus)}
                    />
                    <StatusBadge status={p.filingStatus} label={`Filing: ${p.filingStatus}`} />
                  </div>
                  <p className="text-xs text-muted-foreground">{p.sourceEffectiveNote}</p>
                  <p className="mt-1 text-xs">Limitations: {p.knownLimitations.join("; ")}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    disabled={!canTax || seedM.isPending}
                    onClick={() => {
                      setSelectedPack(p.id);
                      seedM.mutate(p.id);
                    }}
                  >
                    Apply pack (idempotent)
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="returns" className="space-y-4">
          <TaxReturnsPanel
            companyId={companyId}
            companyName={company?.name ?? ""}
            accounts={allAccounts}
            accountsLoadFailed={accountsQ.isError}
          />
        </TabsContent>

        <TabsContent value="rates" className="space-y-4">
          <TaxRatesPanel companyId={companyId} />
        </TabsContent>

        <TabsContent value="codes" className="space-y-4">
          <TaxCodesPanel
            companyId={companyId}
            accounts={allAccounts}
            accountsLoadFailed={accountsQ.isError}
          />
        </TabsContent>
      </Tabs>
    </ListWorkspace>
  );
}

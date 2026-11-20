import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { nativeTabLinkClass, handleNativeTabKeyDown } from "@/lib/navigation/native-tab";
import { openSettingsPanel } from "@/lib/settings/panels";
import { SettingsDestinationLink } from "@/components/settings/ModuleSettingsLinks";
import { InPlaceSettingsPanel } from "@/components/settings/InPlaceSettingsPanel";
import { parseSettingsPanel } from "@/lib/settings/panels";
import { ModuleSettingsLinks } from "@/components/settings/ModuleSettingsLinks";
import { WakeSettings } from "@/components/ai-voice/WakeSettings";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useBlocker, useNavigate, useRouterState } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany, companyContextKey } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { getCompanyDetails, updateCompany } from "@/lib/company.functions";
import { summariseDemoModules } from "@/lib/demo/seed-demo-modules";
import {
  createExchangeRate,
  getOrgExtendedSettings,
  listCompanyAuditEvents,
  resetDemoCompany,
  setEnabledCurrencies,
  updateDocumentSequence,
  updateLocalization,
  upsertBranding,
  voidExchangeRate,
} from "@/lib/settings/org-settings.functions";
import { countries, currencies, months, taxRegimes, timezones } from "@/lib/company-constants";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  categoryMeta,
  resolveSettingsCategory,
  type SettingsCategory,
} from "@/lib/settings/registry";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { PortalSettingsPanel } from "@/components/portals/staff-panels";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
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
import { SettingsDimensionsPanel } from "@/components/settings/SettingsDimensionsPanel";
import {
  SettingsAutomationPanel,
  SettingsIntegrationsPanel,
} from "@/components/settings/SettingsGovernanceExtras";
import { UsersAccessPanel } from "@/components/settings/UsersAccessPanel";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { SettingsOverviewPanel } from "@/components/settings/SettingsOverviewPanel";
import { SettingsFeatureManager } from "@/components/settings/SettingsFeatureManager";
import { SettingsAccountingLocksPanel } from "@/components/settings/SettingsAccountingLocksPanel";
import { SettingsCategoryConfigPanel } from "@/components/settings/SettingsCategoryConfigPanel";
import { ContactSettingsContent } from "@/components/settings/ContactSettingsContent";
import { SettingsCommunicationsPanel } from "@/components/settings/SettingsCommunicationsPanel";
import { SubscriptionPanel } from "@/components/billing/SubscriptionPanel";
import { SettingsCommandPalette } from "@/components/settings/SettingsCommandPalette";
import { maxFiscalYearEndDay, formatDocumentNumberPreview } from "@/lib/settings/dimension-helpers";
import { SettingsSaveBar } from "@/components/settings/SettingsSaveBar";
import { hasUnsavedLegacySettings } from "@/lib/settings/legacy-navigation";
import {
  AUDIT_PAGE_SIZE,
  buildSettingsAuditCsv,
  hasNextSettingsAuditPage,
  formatSettingsAuditPageLabel,
} from "@/lib/settings/audit-export";
import {
  brandingSnapshot,
  localisationSnapshot,
  sequenceSnapshot,
  type BrandingSnapshot,
  type LocalisationSnapshot,
  type SequenceSnapshot,
} from "@/lib/settings/legacy-snapshots";
import {
  isValidOptionalEmail,
  isValidPositiveFxRate,
  isValidThemeColor,
  validateDocumentSequenceDraft,
} from "@/lib/settings/legacy-form-validation";

const LEGACY_TAB_BY_SECTION: Partial<Record<SettingsCategory, string>> = {
  organisation: "organisation",
  accounting: "financial",
  dimensions: "dimensions",
  documents: "documents",
  currencies: "currencies",
  users: "users",
  automation: "automation",
  integrations: "integrations",
  audit: "audit",
  demo: "demo",
};

const CONFIG_SECTIONS: SettingsCategory[] = [
  "sales",
  "purchases",
  "banking",
  "tax",
  "products",
  "reports",
  "expenses",
  "import_migration",
  "fixed_assets",
  "payroll",
  "accountant",
];

export function SettingsPage() {
  const { company, isPending: companyPending } = useActiveCompany();
  const companyId = company?.id ?? null;

  if (companyPending) return <LoadingState />;
  if (!companyId) {
    return (
      <ListWorkspace title="Settings" description="Choose or create an organisation first.">
        <Alert>
          <AlertTitle>No organisation selected</AlertTitle>
          <AlertDescription>
            <Link className="underline" to="/onboarding">
              Create an organisation
            </Link>{" "}
            to manage settings.
          </AlertDescription>
        </Alert>
      </ListWorkspace>
    );
  }

  return <SettingsForCompany companyId={companyId} />;
}

export function SettingsForCompany({
  companyId,
  embeddedSection,
}: {
  companyId: string;
  embeddedSection?: SettingsCategory;
}) {
  const navigate = useNavigate();
  const currentSearch = useRouterState({ select: (s) => s.location.search }) as Record<
    string,
    unknown
  >;
  const sectionRaw =
    embeddedSection ??
    (typeof currentSearch["section"] === "string" ? currentSearch["section"] : "overview");
  const plan = typeof currentSearch["plan"] === "string" ? currentSearch["plan"] : undefined;
  const interval =
    currentSearch["interval"] === "month" || currentSearch["interval"] === "year"
      ? currentSearch["interval"]
      : undefined;
  const detail = embeddedSection ? undefined : parseSettingsPanel(currentSearch["settingsPanel"]);
  const section = resolveSettingsCategory(sectionRaw);
  const [navFilter, setNavFilter] = useState("");
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    if (embeddedSection) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [embeddedSection]);

  const selectSection = (id: string) => {
    if (embeddedSection) {
      void navigate({
        to: window.location.pathname,
        search: (previous: Record<string, unknown>) =>
          openSettingsPanel(
            previous,
            `category:${id}` as import("@/lib/settings/panels").SettingsPanelId,
          ),
      });
      return;
    }
    void navigate({ to: "/settings", search: { section: id } });
  };

  const fetchDetails = useServerFn(getCompanyDetails);
  const saveCompany = useServerFn(updateCompany);
  const fetchExtended = useServerFn(getOrgExtendedSettings);
  const saveLocalization = useServerFn(updateLocalization);
  const saveBranding = useServerFn(upsertBranding);
  const saveSequence = useServerFn(updateDocumentSequence);
  const saveCurrencies = useServerFn(setEnabledCurrencies);
  const addRate = useServerFn(createExchangeRate);
  const voidRate = useServerFn(voidExchangeRate);
  const doDemoReset = useServerFn(resetDemoCompany);
  const fetchAudit = useServerFn(listCompanyAuditEvents);
  const queryClient = useQueryClient();

  const detailsQuery = useQuery({
    queryKey: ["company-details", companyId],
    queryFn: () => fetchDetails({ data: { companyId } }),
  });

  const extendedQuery = useQuery({
    queryKey: ["org-extended", companyId],
    queryFn: () => fetchExtended({ data: { companyId } }),
    enabled: !detail && ["organisation", "documents", "currencies"].includes(section),
  });

  const [auditAction, setAuditAction] = useState("");
  const [auditEntity, setAuditEntity] = useState("");
  const [auditFrom, setAuditFrom] = useState("");
  const [auditTo, setAuditTo] = useState("");
  const [auditOffset, setAuditOffset] = useState(0);
  const auditDatesValid = !auditFrom || !auditTo || auditFrom <= auditTo;

  const auditQuery = useQuery({
    queryKey: ["org-audit", companyId, auditAction, auditEntity, auditFrom, auditTo, auditOffset],
    enabled: !detail && section === "audit" && auditDatesValid,
    queryFn: () =>
      fetchAudit({
        data: {
          companyId,
          limit: AUDIT_PAGE_SIZE + 1,
          offset: auditOffset,
          ...(auditAction ? { action: auditAction } : {}),
          ...(auditEntity ? { entityType: auditEntity } : {}),
          ...(auditFrom ? { fromDate: auditFrom } : {}),
          ...(auditTo ? { toDate: auditTo } : {}),
        },
      }),
  });
  const auditPageRows = (auditQuery.data ?? []).slice(0, AUDIT_PAGE_SIZE);
  const exportAuditPage = () => {
    if (!auditPageRows.length) return;
    const csv = buildSettingsAuditCsv(auditPageRows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `linkbooks-audit-${companyId.slice(0, 8)}-${auditOffset + 1}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [countryCode, setCountryCode] = useState("GB");
  const [currency, setCurrency] = useState("GBP");
  const [timezone, setTimezone] = useState("Europe/London");
  const [fyMonth, setFyMonth] = useState("3");
  const [fyDay, setFyDay] = useState("31");
  const [taxRegime, setTaxRegime] = useState("none");
  const [regNumber, setRegNumber] = useState("");
  const [pricesIncludeTax, setPricesIncludeTax] = useState(false);

  const [locale, setLocale] = useState("en-GB");
  const [dateFormat, setDateFormat] = useState("DD/MM/YYYY");
  const [invoiceFooter, setInvoiceFooter] = useState("");
  const [themeColor, setThemeColor] = useState("#0F766E");
  const [tradingName, setTradingName] = useState("");
  const [letterhead, setLetterhead] = useState("");
  const [invoiceEmail, setInvoiceEmail] = useState("");
  const [invoicePhone, setInvoicePhone] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [enabledFx, setEnabledFx] = useState<string[]>([]);
  const [rateFrom, setRateFrom] = useState("USD");
  const [rateDate, setRateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rateValue, setRateValue] = useState("1.25");
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [localizationDirty, setLocalizationDirty] = useState(false);
  const [brandingDirty, setBrandingDirty] = useState(false);
  const [currenciesDirty, setCurrenciesDirty] = useState(false);
  const [detailsBaseline, setDetailsBaseline] = useState("");
  const [localizationBaseline, setLocalizationBaseline] = useState("");
  const [brandingBaseline, setBrandingBaseline] = useState("");
  const [currenciesBaseline, setCurrenciesBaseline] = useState("");
  const [dirtySequences, setDirtySequences] = useState<Record<string, boolean>>({});
  const reportSequenceDirty = useCallback((documentType: string, isDirty: boolean) => {
    setDirtySequences((previous) => {
      if (Boolean(previous[documentType]) === isDirty) return previous;
      const next = { ...previous };
      if (isDirty) next[documentType] = true;
      else delete next[documentType];
      return next;
    });
  }, []);

  useEffect(() => {
    const d = detailsQuery.data;
    if (!d || detailsDirty) return;
    setDetailsBaseline(JSON.stringify(d));
    setName(d.name);
    setLegalName(d.legal_name ?? "");
    setCountryCode(d.country_code);
    setCurrency(d.base_currency);
    setTimezone(d.timezone);
    setFyMonth(String(d.fiscal_year_end_month));
    setFyDay(String(d.fiscal_year_end_day));
    setTaxRegime(d.tax?.tax_regime ?? "none");
    setRegNumber(d.tax?.registration_number ?? "");
    setPricesIncludeTax(Boolean(d.tax?.prices_include_tax));
  }, [detailsQuery.data, detailsDirty]);

  useEffect(() => {
    const e = extendedQuery.data;
    if (!e?.company) return;
    if (!localizationDirty) {
      setLocalizationBaseline(JSON.stringify(e.company));
      setLocale(e.company.locale || "en-GB");
      setDateFormat(e.company.date_format || "DD/MM/YYYY");
      setInvoiceFooter(e.company.invoice_footer || "");
      setThemeColor(e.company.document_theme_color || "#0F766E");
    }
    if (!brandingDirty) {
      setBrandingBaseline(JSON.stringify(e.branding));
      setTradingName(e.branding.trading_name ?? "");
      setLetterhead(e.branding.letterhead_line ?? "");
      setInvoiceEmail(e.branding.invoice_email ?? "");
      setInvoicePhone(e.branding.invoice_phone ?? "");
      setLogoUrl(e.branding.logo_url ?? "");
    }
    if (!currenciesDirty) {
      setCurrenciesBaseline(JSON.stringify(e.enabledCurrencies));
      setEnabledFx(e.enabledCurrencies);
    }
  }, [extendedQuery.data, localizationDirty, brandingDirty, currenciesDirty]);

  const detailsServerChanged = Boolean(
    detailsDirty && detailsQuery.data && JSON.stringify(detailsQuery.data) !== detailsBaseline,
  );
  const localizationServerChanged = Boolean(
    localizationDirty &&
    extendedQuery.data?.company &&
    JSON.stringify(extendedQuery.data.company) !== localizationBaseline,
  );
  const brandingServerChanged = Boolean(
    brandingDirty &&
    extendedQuery.data &&
    JSON.stringify(extendedQuery.data.branding) !== brandingBaseline,
  );
  const currenciesServerChanged = Boolean(
    currenciesDirty &&
    extendedQuery.data &&
    JSON.stringify(extendedQuery.data.enabledCurrencies) !== currenciesBaseline,
  );
  const detailsValid =
    name.trim().length >= 2 &&
    name.trim().length <= 160 &&
    legalName.trim().length <= 200 &&
    Number.isInteger(Number(fyDay)) &&
    Number(fyDay) >= 1 &&
    Number(fyDay) <= maxFiscalYearEndDay(Number(fyMonth));
  const localizationValid = isValidThemeColor(themeColor) && invoiceFooter.length <= 2000;
  const brandingValid =
    isValidOptionalEmail(invoiceEmail) && (!logoUrl.trim() || /^https:\/\//i.test(logoUrl.trim()));
  const fxRateValid =
    isValidPositiveFxRate(rateValue) &&
    rateFrom !== (detailsQuery.data?.base_currency ?? "GBP") &&
    /^\d{4}-\d{2}-\d{2}$/.test(rateDate);

  const hasUnsavedChanges = hasUnsavedLegacySettings({
    organisation: detailsDirty,
    localisation: localizationDirty,
    branding: brandingDirty,
    currencies: currenciesDirty,
    sequences: dirtySequences,
  });
  const navigationBlocker = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges,
    enableBeforeUnload: hasUnsavedChanges,
    withResolver: true,
  });

  const resetDetails = () => {
    const d = detailsQuery.data;
    if (!d) return;
    setName(d.name);
    setLegalName(d.legal_name ?? "");
    setCountryCode(d.country_code);
    setCurrency(d.base_currency);
    setTimezone(d.timezone);
    setFyMonth(String(d.fiscal_year_end_month));
    setFyDay(String(d.fiscal_year_end_day));
    setTaxRegime(d.tax?.tax_regime ?? "none");
    setRegNumber(d.tax?.registration_number ?? "");
    setPricesIncludeTax(Boolean(d.tax?.prices_include_tax));
    setDetailsBaseline(JSON.stringify(d));
    setDetailsDirty(false);
  };

  const resetLocalization = () => {
    const e = extendedQuery.data?.company;
    if (!e) return;
    setLocale(e.locale || "en-GB");
    setDateFormat(e.date_format || "DD/MM/YYYY");
    setInvoiceFooter(e.invoice_footer || "");
    setThemeColor(e.document_theme_color || "#0F766E");
    setLocalizationBaseline(JSON.stringify(e));
    setLocalizationDirty(false);
  };

  const resetBranding = () => {
    const b = extendedQuery.data?.branding;
    if (!b) return;
    setTradingName(b.trading_name ?? "");
    setLetterhead(b.letterhead_line ?? "");
    setInvoiceEmail(b.invoice_email ?? "");
    setInvoicePhone(b.invoice_phone ?? "");
    setLogoUrl(b.logo_url ?? "");
    setBrandingBaseline(JSON.stringify(b));
    setBrandingDirty(false);
  };

  const resetCurrencies = () => {
    const list = extendedQuery.data?.enabledCurrencies;
    if (!list) return;
    setEnabledFx(list);
    setCurrenciesBaseline(JSON.stringify(list));
    setCurrenciesDirty(false);
  };

  const canEdit = useCanDo("company.settings.edit");
  const canLock = useCanDo("periods.lock");
  const isDemo = Boolean(detailsQuery.data?.is_demo);
  const maxDay = useMemo(() => maxFiscalYearEndDay(Number(fyMonth)), [fyMonth]);
  const baseCurrency = detailsQuery.data?.base_currency ?? "GBP";

  const saveMutation = useMutation({
    mutationFn: () =>
      saveCompany({
        data: {
          companyId,
          name,
          legal_name: legalName,
          country_code: countryCode,
          base_currency: currency,
          fiscal_year_end_month: Number(fyMonth),
          fiscal_year_end_day: Number(fyDay),
          timezone,
          tax_regime: taxRegime,
          registration_number: regNumber,
          prices_include_tax: pricesIncludeTax,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["company-details", companyId] });
      await queryClient.invalidateQueries({ queryKey: companyContextKey });
      setDetailsDirty(false);
      toast.success("Organisation settings saved");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const localizationM = useMutation({
    mutationFn: () =>
      saveLocalization({
        data: {
          companyId,
          expected: localisationSnapshot(
            JSON.parse(localizationBaseline || "{}") as LocalisationSnapshot,
          ),
          locale,
          date_format: dateFormat,
          invoice_footer: invoiceFooter,
          document_theme_color: themeColor,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["org-extended", companyId] });
      setLocalizationDirty(false);
      toast.success("Localization saved");
    },
    onError: async (e) => {
      await queryClient.invalidateQueries({ queryKey: ["org-extended", companyId] });
      toast.error(friendlyAuthError(e));
    },
  });

  const brandingM = useMutation({
    mutationFn: () =>
      saveBranding({
        data: {
          companyId,
          expected: brandingSnapshot(JSON.parse(brandingBaseline || "{}") as BrandingSnapshot),
          trading_name: tradingName,
          letterhead_line: letterhead,
          invoice_email: invoiceEmail,
          invoice_phone: invoicePhone,
          logo_url: logoUrl,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["org-extended", companyId] });
      setBrandingDirty(false);
      toast.success("Document branding saved");
    },
    onError: async (e) => {
      await queryClient.invalidateQueries({ queryKey: ["org-extended", companyId] });
      toast.error(friendlyAuthError(e));
    },
  });

  const currenciesM = useMutation({
    mutationFn: () =>
      saveCurrencies({
        data: {
          companyId,
          currencies: enabledFx,
          // Capture the original snapshot, not a possibly refreshed query.
          // The database compares this while holding a company-scoped lock.
          expectedCurrencies: JSON.parse(currenciesBaseline || "[]") as string[],
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["org-extended", companyId] });
      setCurrenciesDirty(false);
      toast.success("Enabled currencies saved");
    },
    onError: async (error) => {
      // A stale-write rejection needs a fresh server snapshot so the editor's
      // conflict warning and Reload latest action can recover correctly.
      await queryClient.invalidateQueries({ queryKey: ["org-extended", companyId] });
      toast.error(friendlyAuthError(error));
    },
  });

  const rateM = useMutation({
    mutationFn: () =>
      addRate({
        data: {
          companyId,
          from_currency: rateFrom,
          to_currency: baseCurrency,
          rate_date: rateDate,
          rate: rateValue,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["org-extended", companyId] });
      toast.success("Exchange rate recorded (immutable)");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const demoResetM = useMutation({
    mutationFn: () => doDemoReset({ data: { companyId } }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries();
      const summary = summariseDemoModules(result.modules ?? null);
      if (summary.failed.length) {
        toast.warning(
          `Demo Company reset. ${summary.seeded} of ${summary.total} modules have sample data; not seeded: ${summary.failed.join(", ")}.`,
        );
      } else {
        toast.success(
          summary.total
            ? `Demo Company reset with sample data in all ${summary.total} modules.`
            : "Demo Company reset — transactional data cleared and masters reseeded",
        );
      }
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (detailsQuery.isPending) return <LoadingState />;
  if (detailsQuery.isError) {
    return (
      <QueryErrorState queries={[detailsQuery]} title="Could not load organisation settings" />
    );
  }

  const legacyTab = LEGACY_TAB_BY_SECTION[section];
  const sectionMeta = categoryMeta.find((c) => c.id === section);
  const showLegacy = Boolean(legacyTab);

  const settingsMain = (
    <>
      {!embeddedSection && (
        <SettingsCommandPalette
          open={cmdOpen}
          onOpenChange={setCmdOpen}
          onSelectSection={selectSection}
        />
      )}

      {!embeddedSection && (
        <div className="mb-4 lg:hidden">
          <Label htmlFor="mobile-settings-section" className="mb-2 block text-sm font-medium">
            Settings section
          </Label>
          <Select value={section} onValueChange={selectSection}>
            {/* lookup-fixed-enum: Settings sections are a fixed navigation enumeration. */}

            <SelectTrigger id="mobile-settings-section" aria-label="Choose settings section">
              <SelectValue placeholder="Choose a settings section" />
            </SelectTrigger>
            <SelectContent>
              {categoryMeta
                .filter((item) => item.id !== "demo" || isDemo)
                .map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className={embeddedSection ? "" : "grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]"}>
        {!embeddedSection && (
          <aside className="hidden lg:sticky lg:top-4 lg:block lg:self-start">
            <div className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="mb-3 flex items-center gap-2 px-2 text-sm font-semibold">
                <Settings2 className="size-4 text-primary" aria-hidden />
                All settings
              </div>
              <Input
                value={navFilter}
                onChange={(e) => setNavFilter(e.target.value)}
                placeholder="Find a setting…"
                aria-label="Filter settings categories"
                className="mb-3"
              />
              <div className="max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
                <SettingsNav
                  section={section}
                  embedded={false}
                  showDemo={isDemo}
                  filter={navFilter}
                />
              </div>
            </div>
          </aside>
        )}

        <div className="min-w-0 space-y-5">
          {!detail && sectionMeta && !embeddedSection ? (
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card/60 p-4 shadow-sm sm:p-5">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight sm:text-xl">
                  {sectionMeta.label}
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  {sectionMeta.description}
                </p>
              </div>
              {sectionMeta.availability === "unavailable" ? (
                <Badge variant="outline">Not available</Badge>
              ) : null}
            </div>
          ) : null}
          {!detail &&
          extendedQuery.isError &&
          ["organisation", "documents", "currencies"].includes(section) ? (
            <QueryErrorState
              queries={[extendedQuery]}
              title="Additional organisation settings could not be loaded"
            />
          ) : null}
          {detail ? (
            <InPlaceSettingsPanel panel={detail} insideCentre />
          ) : (
            <>
              {!embeddedSection && <ModuleSettingsLinks category={section} central />}
              {section === "overview" ? <SettingsOverviewPanel companyId={companyId} /> : null}
              {section === "features" ? (
                <SettingsFeatureManager companyId={companyId} canEdit={canEdit} />
              ) : null}
              {section === "subscription" ? (
                <SubscriptionPanel
                  companyId={companyId}
                  {...(plan ? { initialPlan: plan } : {})}
                  {...(interval ? { initialInterval: interval } : {})}
                />
              ) : null}
              {section === "portals" ? (
                <PortalSettingsPanel companyId={companyId} canEdit={canEdit} />
              ) : null}
              {section === "notifications" ? (
                <SettingsCommunicationsPanel companyId={companyId} canEdit={canEdit} />
              ) : null}
              {section === "contacts" ? <ContactSettingsContent embedded /> : null}
              {CONFIG_SECTIONS.includes(section) ? (
                <SettingsCategoryConfigPanel
                  companyId={companyId}
                  category={section}
                  canEdit={canEdit}
                  showModuleLinks={!embeddedSection}
                />
              ) : null}

              {showLegacy ? (
                <Tabs value={legacyTab}>
                  <TabsList
                    onKeyDown={handleNativeTabKeyDown}
                    className={embeddedSection ? "hidden" : "flex h-auto flex-wrap gap-1"}
                  >
                    <Link
                      className={nativeTabLinkClass}
                      role="tab"
                      aria-selected={legacyTab === "organisation"}
                      data-state={legacyTab === "organisation" ? "active" : "inactive"}
                      to="/settings"
                      search={{ section: "organisation" }}
                    >
                      Organisation
                    </Link>
                    <Link
                      className={nativeTabLinkClass}
                      role="tab"
                      aria-selected={legacyTab === "financial"}
                      data-state={legacyTab === "financial" ? "active" : "inactive"}
                      to="/settings"
                      search={{ section: "accounting" }}
                    >
                      Financial
                    </Link>
                    <Link
                      className={nativeTabLinkClass}
                      role="tab"
                      aria-selected={legacyTab === "dimensions"}
                      data-state={legacyTab === "dimensions" ? "active" : "inactive"}
                      to="/settings"
                      search={{ section: "dimensions" }}
                    >
                      Dimensions
                    </Link>
                    <Link
                      className={nativeTabLinkClass}
                      role="tab"
                      aria-selected={legacyTab === "documents"}
                      data-state={legacyTab === "documents" ? "active" : "inactive"}
                      to="/settings"
                      search={{ section: "documents" }}
                    >
                      Documents
                    </Link>
                    <Link
                      className={nativeTabLinkClass}
                      role="tab"
                      aria-selected={legacyTab === "currencies"}
                      data-state={legacyTab === "currencies" ? "active" : "inactive"}
                      to="/settings"
                      search={{ section: "currencies" }}
                    >
                      Currencies
                    </Link>
                    <Link
                      className={nativeTabLinkClass}
                      role="tab"
                      aria-selected={legacyTab === "users"}
                      data-state={legacyTab === "users" ? "active" : "inactive"}
                      to="/settings"
                      search={{ section: "users" }}
                    >
                      Users
                    </Link>
                    <Link
                      className={nativeTabLinkClass}
                      role="tab"
                      aria-selected={legacyTab === "automation"}
                      data-state={legacyTab === "automation" ? "active" : "inactive"}
                      to="/settings"
                      search={{ section: "automation" }}
                    >
                      Automation
                    </Link>
                    <Link
                      className={nativeTabLinkClass}
                      role="tab"
                      aria-selected={legacyTab === "integrations"}
                      data-state={legacyTab === "integrations" ? "active" : "inactive"}
                      to="/settings"
                      search={{ section: "integrations" }}
                    >
                      Integrations
                    </Link>
                    <Link
                      className={nativeTabLinkClass}
                      role="tab"
                      aria-selected={legacyTab === "audit"}
                      data-state={legacyTab === "audit" ? "active" : "inactive"}
                      to="/settings"
                      search={{ section: "audit" }}
                    >
                      Audit
                    </Link>
                    {isDemo ? (
                      <Link
                        className={nativeTabLinkClass}
                        role="tab"
                        aria-selected={legacyTab === "demo"}
                        data-state={legacyTab === "demo" ? "active" : "inactive"}
                        to="/settings"
                        search={{ section: "demo" }}
                      >
                        Demo
                      </Link>
                    ) : null}
                  </TabsList>

                  {section === "accounting" ? (
                    <div className="mt-4">
                      <SettingsAccountingLocksPanel
                        companyId={companyId}
                        canEdit={canEdit}
                        canLock={canLock}
                      />
                    </div>
                  ) : null}

                  <TabsContent value="organisation" className="mt-4 space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Organisation details</CardTitle>
                        <CardDescription>
                          Legal profile shown on invoices and reports.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="org-name">Organisation name</Label>
                          <Input
                            id="org-name"
                            aria-invalid={name.trim().length < 2 || name.trim().length > 160}
                            aria-describedby="org-name-hint"
                            value={name}
                            disabled={!canEdit || saveMutation.isPending}
                            onChange={(e) => {
                              setName(e.target.value);
                              setDetailsDirty(true);
                            }}
                          />
                          <p id="org-name-hint" className="text-xs text-muted-foreground">
                            Organisation name must contain 2–160 characters.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="org-legal">Legal name</Label>
                          <Input
                            id="org-legal"
                            value={legalName}
                            disabled={!canEdit || saveMutation.isPending}
                            onChange={(e) => {
                              setLegalName(e.target.value);
                              setDetailsDirty(true);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="org-country">Country</Label>
                          <RecordLookupSelect
                            value={countryCode}
                            disabled={!canEdit || saveMutation.isPending}
                            onValueChange={(value) => {
                              setCountryCode(value);
                              setDetailsDirty(true);
                            }}
                          >
                            <SelectTrigger id="org-country">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {countries.map((c) => (
                                <SelectItem key={c.code} value={c.code}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </RecordLookupSelect>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="org-tax-regime">Tax regime</Label>
                          <Select
                            value={taxRegime}
                            disabled={!canEdit || saveMutation.isPending}
                            onValueChange={(value) => {
                              setTaxRegime(value);
                              setDetailsDirty(true);
                            }}
                          >
                            {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

                            <SelectTrigger id="org-tax-regime">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {taxRegimes.map((t) => (
                                <SelectItem key={t.value} value={t.value}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="tax-reg">Tax registration number</Label>
                          <Input
                            id="tax-reg"
                            value={regNumber}
                            disabled={!canEdit || saveMutation.isPending}
                            onChange={(e) => {
                              setRegNumber(e.target.value);
                              setDetailsDirty(true);
                            }}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-4 sm:col-span-2">
                          <Label className="font-normal">Prices include tax by default</Label>
                          <Switch
                            checked={pricesIncludeTax}
                            disabled={!canEdit || saveMutation.isPending}
                            onCheckedChange={(checked) => {
                              setPricesIncludeTax(checked);
                              setDetailsDirty(true);
                            }}
                          />
                        </div>
                        <SettingsSaveBar
                          label="Save organisation details"
                          dirty={detailsDirty}
                          valid={detailsValid}
                          canEdit={canEdit}
                          pending={saveMutation.isPending}
                          serverChanged={detailsServerChanged}
                          error={
                            saveMutation.isError ? friendlyAuthError(saveMutation.error) : null
                          }
                          onSave={() => saveMutation.mutate()}
                          onDiscard={resetDetails}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Localization</CardTitle>
                        <CardDescription>
                          Display preferences only — ledger dates remain ISO.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="org-locale">Locale</Label>
                          <Select
                            value={locale}
                            disabled={!canEdit || !extendedQuery.isSuccess}
                            onValueChange={(value) => {
                              setLocale(value);
                              setLocalizationDirty(true);
                            }}
                          >
                            {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

                            <SelectTrigger id="org-locale">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(extendedQuery.data?.locales ?? ["en-GB"]).map((l) => (
                                <SelectItem key={l} value={l}>
                                  {l}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="org-date-format">Date format</Label>
                          <Select
                            value={dateFormat}
                            disabled={!canEdit || !extendedQuery.isSuccess}
                            onValueChange={(value) => {
                              setDateFormat(value);
                              setLocalizationDirty(true);
                            }}
                          >
                            {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

                            <SelectTrigger id="org-date-format">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(extendedQuery.data?.dateFormats ?? ["DD/MM/YYYY"]).map((f) => (
                                <SelectItem key={f} value={f}>
                                  {f}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="org-document-color">Document theme colour</Label>
                          <Input
                            id="org-document-color"
                            value={themeColor}
                            aria-invalid={!isValidThemeColor(themeColor)}
                            aria-describedby="org-document-color-hint"
                            disabled={!canEdit || !extendedQuery.isSuccess}
                            onChange={(e) => {
                              setThemeColor(e.target.value);
                              setLocalizationDirty(true);
                            }}
                          />
                          <p id="org-document-color-hint" className="text-xs text-muted-foreground">
                            Enter a six-digit colour code, such as #0F766E.
                          </p>
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="org-invoice-footer">Default invoice footer</Label>
                          <Input
                            id="org-invoice-footer"
                            value={invoiceFooter}
                            maxLength={2000}
                            disabled={!canEdit || !extendedQuery.isSuccess}
                            onChange={(e) => {
                              setInvoiceFooter(e.target.value);
                              setLocalizationDirty(true);
                            }}
                          />
                        </div>
                        <SettingsSaveBar
                          label="Save localisation"
                          dirty={localizationDirty}
                          valid={localizationValid && extendedQuery.isSuccess}
                          canEdit={canEdit}
                          pending={localizationM.isPending}
                          serverChanged={localizationServerChanged}
                          error={
                            localizationM.isError ? friendlyAuthError(localizationM.error) : null
                          }
                          onSave={() => localizationM.mutate()}
                          onDiscard={resetLocalization}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="financial" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Financial settings</CardTitle>
                        <CardDescription>
                          Base currency, financial year and time zone. Period locks are managed
                          under Accounting. Base currency cannot change after journals are posted.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Base currency</Label>
                          <RecordLookupSelect
                            value={currency}
                            disabled={!canEdit || saveMutation.isPending}
                            onValueChange={(value) => {
                              setCurrency(value);
                              setDetailsDirty(true);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {currencies.map((c) => (
                                <SelectItem key={c} value={c}>
                                  {c}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </RecordLookupSelect>
                        </div>
                        <div className="space-y-2">
                          <Label>Time zone</Label>
                          <RecordLookupSelect
                            value={timezone}
                            disabled={!canEdit || saveMutation.isPending}
                            onValueChange={(value) => {
                              setTimezone(value);
                              setDetailsDirty(true);
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {timezones.map((tz) => (
                                <SelectItem key={tz} value={tz}>
                                  {tz}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </RecordLookupSelect>
                        </div>
                        <div className="space-y-2">
                          <Label>Financial year end month</Label>
                          <Select
                            value={fyMonth}
                            disabled={!canEdit || saveMutation.isPending}
                            onValueChange={(m) => {
                              setFyMonth(m);
                              setDetailsDirty(true);
                              const max = maxFiscalYearEndDay(Number(m));
                              if (Number(fyDay) > max) setFyDay(String(max));
                            }}
                          >
                            {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {months.map((m, i) => (
                                <SelectItem key={m} value={String(i + 1)}>
                                  {m}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="fy-day">Financial year end day</Label>
                          <Input
                            id="fy-day"
                            type="number"
                            min={1}
                            max={maxDay}
                            value={fyDay}
                            disabled={!canEdit || saveMutation.isPending}
                            onChange={(e) => {
                              setFyDay(e.target.value);
                              setDetailsDirty(true);
                            }}
                          />
                        </div>
                        <div className="sm:col-span-2 space-y-2 text-sm text-muted-foreground">
                          <p>
                            Tax rates and codes:{" "}
                            <Link className="underline" to="/tax">
                              Tax settings
                            </Link>
                            . Accounting periods:{" "}
                            <Link className="underline" to="/accounting">
                              Accounting
                            </Link>
                            .
                          </p>
                        </div>
                        <SettingsSaveBar
                          label="Save financial settings"
                          dirty={detailsDirty}
                          valid={detailsValid}
                          canEdit={canEdit}
                          pending={saveMutation.isPending}
                          serverChanged={detailsServerChanged}
                          error={
                            saveMutation.isError ? friendlyAuthError(saveMutation.error) : null
                          }
                          onSave={() => saveMutation.mutate()}
                          onDiscard={resetDetails}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="dimensions" className="mt-4">
                    <SettingsDimensionsPanel
                      companyId={companyId}
                      canEdit={canEdit}
                      currency={baseCurrency}
                    />
                  </TabsContent>

                  <TabsContent value="documents" className="mt-4 space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Document branding</CardTitle>
                        <CardDescription>
                          Letterhead and contact details for customer-facing documents. Logo upload,
                          accent colour, address, tax number, bank details and footer are on the{" "}
                          <SettingsDestinationLink
                            className="underline"
                            destination={{ to: "/documents/branding" }}
                          >
                            document branding page
                          </SettingsDestinationLink>
                          .
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="org-trading-name">Trading name</Label>
                          <Input
                            id="org-trading-name"
                            value={tradingName}
                            disabled={!canEdit || !extendedQuery.isSuccess}
                            onChange={(e) => {
                              setTradingName(e.target.value);
                              setBrandingDirty(true);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="org-letterhead">Letterhead line</Label>
                          <Input
                            id="org-letterhead"
                            value={letterhead}
                            disabled={!canEdit || !extendedQuery.isSuccess}
                            onChange={(e) => {
                              setLetterhead(e.target.value);
                              setBrandingDirty(true);
                            }}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="org-invoice-email">Invoice email</Label>
                          <Input
                            id="org-invoice-email"
                            type="email"
                            value={invoiceEmail}
                            aria-invalid={!isValidOptionalEmail(invoiceEmail)}
                            aria-describedby="org-invoice-email-hint"
                            disabled={!canEdit || !extendedQuery.isSuccess}
                            onChange={(e) => {
                              setInvoiceEmail(e.target.value);
                              setBrandingDirty(true);
                            }}
                          />
                          <p id="org-invoice-email-hint" className="text-xs text-muted-foreground">
                            Optional. Enter a valid address for customer-facing invoice replies.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="org-invoice-phone">Invoice phone</Label>
                          <Input
                            id="org-invoice-phone"
                            value={invoicePhone}
                            disabled={!canEdit || !extendedQuery.isSuccess}
                            onChange={(e) => {
                              setInvoicePhone(e.target.value);
                              setBrandingDirty(true);
                            }}
                          />
                        </div>
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="org-logo-url">Logo URL</Label>
                          <Input
                            id="org-logo-url"
                            inputMode="url"
                            value={logoUrl}
                            aria-invalid={Boolean(
                              logoUrl.trim() && !/^https:\/\//i.test(logoUrl.trim()),
                            )}
                            aria-describedby="org-logo-url-hint"
                            disabled={!canEdit || !extendedQuery.isSuccess}
                            onChange={(e) => {
                              setLogoUrl(e.target.value);
                              setBrandingDirty(true);
                            }}
                            placeholder="https://… (no file upload integration yet)"
                          />
                          <p id="org-logo-url-hint" className="text-xs text-muted-foreground">
                            Optional. Use a secure HTTPS image URL; uploading is available on the
                            dedicated document-branding page.
                          </p>
                        </div>
                        <SettingsSaveBar
                          label="Save branding"
                          dirty={brandingDirty}
                          valid={brandingValid && extendedQuery.isSuccess}
                          canEdit={canEdit}
                          pending={brandingM.isPending}
                          serverChanged={brandingServerChanged}
                          error={brandingM.isError ? friendlyAuthError(brandingM.error) : null}
                          onSave={() => brandingM.mutate()}
                          onDiscard={resetBranding}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Invoice and bill numbering</CardTitle>
                        <CardDescription>
                          Prefix, next number and zero-padding per document type. Allocation uses a
                          concurrency-safe database function when creating invoices/bills without a
                          manual number. Changing next number never renumbers historical documents.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {extendedQuery.isPending ? (
                          <LoadingState rows={3} />
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Type</TableHead>
                                <TableHead>Prefix</TableHead>
                                <TableHead>Next</TableHead>
                                <TableHead>Padding</TableHead>
                                <TableHead>Preview</TableHead>
                                <TableHead />
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {(extendedQuery.data?.sequences ?? []).map((seq) => (
                                <SequenceRow
                                  key={seq.document_type}
                                  seq={seq}
                                  disabled={!canEdit}
                                  onDirtyChange={reportSequenceDirty}
                                  onSave={async (patch, expected) => {
                                    try {
                                      await saveSequence({
                                        data: {
                                          companyId,
                                          document_type: seq.document_type,
                                          ...patch,
                                          expected,
                                        },
                                      });
                                      toast.success("Sequence updated");
                                    } finally {
                                      await queryClient.invalidateQueries({
                                        queryKey: ["org-extended", companyId],
                                      });
                                    }
                                  }}
                                />
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="currencies" className="mt-4 space-y-4">
                    <Alert>
                      <AlertTitle>FX policy</AlertTitle>
                      <AlertDescription>
                        Rates are append-only. Posted journals keep their snapshot{" "}
                        <code className="text-xs">fx_rate_to_base</code>. Void a rate to stop new
                        lookups — historical journals are never rewritten. See{" "}
                        <span className="font-medium">
                          docs/settings-fx-firm/FX_ACCOUNTING_POLICY.md
                        </span>
                        .
                      </AlertDescription>
                    </Alert>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Enabled transaction currencies</CardTitle>
                        <CardDescription>
                          Base currency {baseCurrency} is always available.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="flex flex-wrap gap-3">
                          {currencies
                            .filter((c) => c !== baseCurrency)
                            .map((c) => (
                              <label key={c} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={enabledFx.includes(c)}
                                  disabled={!canEdit || !extendedQuery.isSuccess}
                                  onChange={(e) => {
                                    setEnabledFx((prev) =>
                                      e.target.checked ? [...prev, c] : prev.filter((x) => x !== c),
                                    );
                                    setCurrenciesDirty(true);
                                  }}
                                />
                                {c}
                              </label>
                            ))}
                        </div>
                        <SettingsSaveBar
                          label="Save currencies"
                          dirty={currenciesDirty}
                          valid={extendedQuery.isSuccess}
                          canEdit={canEdit}
                          pending={currenciesM.isPending}
                          serverChanged={currenciesServerChanged}
                          error={currenciesM.isError ? friendlyAuthError(currenciesM.error) : null}
                          onSave={() => currenciesM.mutate()}
                          onDiscard={resetCurrencies}
                        />
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Recorded exchange rates</CardTitle>
                        <CardDescription>
                          Rate = units of {baseCurrency} per 1 unit of foreign currency, as-of date.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {canEdit ? (
                          <div className="grid gap-3 sm:grid-cols-4">
                            <div className="space-y-1">
                              <Label>From</Label>
                              <RecordLookupSelect value={rateFrom} onValueChange={setRateFrom}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {currencies
                                    .filter((c) => c !== baseCurrency)
                                    .map((c) => (
                                      <SelectItem key={c} value={c}>
                                        {c}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </RecordLookupSelect>
                            </div>
                            <div className="space-y-1">
                              <Label>Date</Label>
                              <Input
                                type="date"
                                value={rateDate}
                                onChange={(e) => setRateDate(e.target.value)}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label htmlFor="org-fx-rate">Rate → {baseCurrency}</Label>
                              <Input
                                id="org-fx-rate"
                                inputMode="decimal"
                                aria-invalid={!isValidPositiveFxRate(rateValue)}
                                value={rateValue}
                                onChange={(e) => setRateValue(e.target.value)}
                              />
                            </div>
                            <div className="flex items-end">
                              <Button
                                size="sm"
                                disabled={rateM.isPending || !fxRateValid}
                                onClick={() => rateM.mutate()}
                              >
                                Record rate
                              </Button>
                            </div>
                          </div>
                        ) : null}
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date</TableHead>
                              <TableHead>Pair</TableHead>
                              <TableHead>Rate</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(extendedQuery.data?.exchangeRates ?? []).map((r) => (
                              <TableRow key={r.id}>
                                <TableCell>{r.rate_date}</TableCell>
                                <TableCell>
                                  {r.from_currency}/{r.to_currency}
                                </TableCell>
                                <TableCell>{r.rate}</TableCell>
                                <TableCell>{r.voided_at ? "Voided" : "Active"}</TableCell>
                                <TableCell>
                                  {canEdit && !r.voided_at ? (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() =>
                                        voidRate({ data: { rateId: r.id } }).then(async () => {
                                          await queryClient.invalidateQueries({
                                            queryKey: ["org-extended", companyId],
                                          });
                                          toast.success("Rate voided");
                                        })
                                      }
                                    >
                                      Void
                                    </Button>
                                  ) : null}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="users" className="mt-4">
                    <UsersAccessPanel companyId={companyId} />
                  </TabsContent>

                  <TabsContent value="automation" className="mt-4 space-y-4">
                    <SettingsAutomationPanel companyId={companyId} canEdit={canEdit} />
                    <WakeSettings />
                  </TabsContent>

                  <TabsContent value="integrations" className="mt-4">
                    <SettingsIntegrationsPanel companyId={companyId} />
                  </TabsContent>

                  <TabsContent value="audit" className="mt-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base">Audit history</CardTitle>
                        <CardDescription>
                          Append-only financial and administrative actions. Filter to reduce noise
                          from journal.posted / demo.seed bursts. Secrets are stripped server-side.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input
                            aria-label="Filter audit action"
                            placeholder="Filter action (e.g. settings, members, journal)"
                            value={auditAction}
                            onChange={(e) => {
                              setAuditAction(e.target.value);
                              setAuditOffset(0);
                            }}
                          />
                          <Input
                            aria-label="Filter audit entity type"
                            placeholder="Entity type (e.g. company, exchange_rate)"
                            value={auditEntity}
                            onChange={(e) => {
                              setAuditEntity(e.target.value);
                              setAuditOffset(0);
                            }}
                          />
                          <Input
                            type="date"
                            aria-label="Audit history from date"
                            value={auditFrom}
                            max={auditTo || undefined}
                            onChange={(e) => {
                              setAuditFrom(e.target.value);
                              setAuditOffset(0);
                            }}
                          />
                          <Input
                            type="date"
                            aria-label="Audit history to date"
                            value={auditTo}
                            min={auditFrom || undefined}
                            onChange={(e) => {
                              setAuditTo(e.target.value);
                              setAuditOffset(0);
                            }}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={!auditPageRows.length || auditQuery.isFetching}
                            onClick={exportAuditPage}
                          >
                            Export current page (CSV)
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setAuditAction("");
                              setAuditEntity("");
                              setAuditFrom("");
                              setAuditTo("");
                              setAuditOffset(0);
                            }}
                          >
                            Clear filters
                          </Button>
                        </div>
                        {!auditDatesValid ? (
                          <p role="alert" className="text-sm text-destructive">
                            The from date must not be after the to date.
                          </p>
                        ) : auditQuery.isPending ? (
                          <LoadingState rows={4} />
                        ) : auditQuery.isError ? (
                          <QueryErrorState queries={[auditQuery]} title="Could not load audit" />
                        ) : auditPageRows.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No events match these filters.
                          </p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>When</TableHead>
                                <TableHead>Action</TableHead>
                                <TableHead>Entity</TableHead>
                                <TableHead>Actor</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {auditPageRows.map((a) => (
                                <TableRow key={a.id}>
                                  <TableCell className="whitespace-nowrap text-xs">
                                    {new Date(a.created_at).toLocaleString()}
                                  </TableCell>
                                  <TableCell>{a.action}</TableCell>
                                  <TableCell className="text-xs">
                                    {a.entity_type}
                                    {a.entity_id ? ` · ${a.entity_id.slice(0, 8)}…` : ""}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {a.actor_user_id?.slice(0, 8) ?? "—"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                        {auditDatesValid && !auditQuery.isPending && !auditQuery.isError ? (
                          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                            <p role="status" className="text-xs text-muted-foreground">
                              {formatSettingsAuditPageLabel(auditOffset, auditPageRows.length)}
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={auditOffset === 0 || auditQuery.isFetching}
                                onClick={() =>
                                  setAuditOffset((previous) =>
                                    Math.max(0, previous - AUDIT_PAGE_SIZE),
                                  )
                                }
                              >
                                Previous
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={
                                  auditQuery.isFetching ||
                                  !hasNextSettingsAuditPage(auditQuery.data?.length ?? 0)
                                }
                                onClick={() =>
                                  setAuditOffset((previous) => previous + AUDIT_PAGE_SIZE)
                                }
                              >
                                Next
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {isDemo ? (
                    <TabsContent value="demo" className="mt-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Demo Company reset & reseed</CardTitle>
                          <CardDescription>
                            Clears every module's data for this demo organisation only, reseeds the
                            chart of accounts and periods, posts the sample ledger through the real
                            PostingEngine, then adds sample data to every module (expenses, payroll,
                            fixed assets, budgets, tax, reports, files, accountant, firm, advisors
                            portal, App Store and more). Cannot target non-demo organisations.
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <p className="text-sm text-muted-foreground">
                            Payroll, depreciation and expense postings are added on top of the core
                            sample ledger, so totals include them. Steps are in docs/demo/RESET.md.
                          </p>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={demoResetM.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  "Reset and reseed Demo Company? Sample journals and documents will be replaced. Live organisations are never affected.",
                                )
                              ) {
                                demoResetM.mutate();
                              }
                            }}
                          >
                            {demoResetM.isPending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : null}
                            Reset & reseed demo data
                          </Button>
                        </CardContent>
                      </Card>
                    </TabsContent>
                  ) : null}
                </Tabs>
              ) : null}
            </>
          )}
        </div>
      </div>
      <AlertDialog
        open={navigationBlocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && navigationBlocker.status === "blocked") navigationBlocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved Settings Centre changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved organisation, branding, currency or document numbering changes will be
              discarded if you leave this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (navigationBlocker.status === "blocked") navigationBlocker.reset();
              }}
            >
              Stay and keep editing
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                saveMutation.isPending ||
                localizationM.isPending ||
                brandingM.isPending ||
                currenciesM.isPending
              }
              onClick={() => {
                if (navigationBlocker.status === "blocked") navigationBlocker.proceed();
              }}
            >
              Discard and leave
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );

  if (embeddedSection) return settingsMain;

  return (
    <ListWorkspace
      title="Settings Centre"
      description="Manage your organisation, financial controls and connected workflows in one place."
      actions={
        <Button variant="outline" size="sm" onClick={() => setCmdOpen(true)}>
          <Search className="mr-1.5 size-3.5" />
          Search
          <kbd className="ml-2 hidden rounded border px-1 text-[10px] sm:inline">
            Ctrl/⌘ Shift K
          </kbd>
        </Button>
      }
    >
      {settingsMain}
    </ListWorkspace>
  );
}

function SequenceRow({
  seq,
  disabled,
  onDirtyChange,
  onSave,
}: {
  seq: { document_type: string; prefix: string; next_number: number; padding: number };
  disabled: boolean;
  onDirtyChange: (documentType: string, dirty: boolean) => void;
  onSave: (patch: SequenceSnapshot, expected: SequenceSnapshot) => Promise<unknown>;
}) {
  const [prefix, setPrefix] = useState(seq.prefix);
  const [next, setNext] = useState(String(seq.next_number));
  const [pad, setPad] = useState(String(seq.padding));
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [baseline, setBaseline] = useState(JSON.stringify(seq));

  useEffect(() => {
    if (dirty) return;
    setPrefix(seq.prefix);
    setNext(String(seq.next_number));
    setPad(String(seq.padding));
    setBaseline(JSON.stringify(seq));
  }, [seq, dirty]);

  useEffect(() => {
    onDirtyChange(seq.document_type, dirty);
    return () => onDirtyChange(seq.document_type, false);
  }, [dirty, onDirtyChange, seq.document_type]);

  const parsed = validateDocumentSequenceDraft({ prefix, next, padding: pad });
  const serverChanged = dirty && JSON.stringify(seq) !== baseline;
  const errorId = "sequence-" + seq.document_type + "-error";
  const error = !parsed.ok ? Object.values(parsed.errors)[0] : null;
  const discard = () => {
    setPrefix(seq.prefix);
    setNext(String(seq.next_number));
    setPad(String(seq.padding));
    setBaseline(JSON.stringify(seq));
    setDirty(false);
  };
  const saveDraft = async () => {
    if (!parsed.ok || serverChanged || disabled || pending || !dirty) return;
    setPending(true);
    try {
      await onSave(parsed.value, sequenceSnapshot(JSON.parse(baseline) as SequenceSnapshot));
      setDirty(false);
    } catch (e) {
      toast.error(friendlyAuthError(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="font-mono text-xs">{seq.document_type}</TableCell>
      <TableCell>
        <Input
          aria-label={seq.document_type + " number prefix"}
          className="h-8 w-24"
          value={prefix}
          maxLength={21}
          aria-invalid={Boolean(!parsed.ok && parsed.errors["prefix"])}
          disabled={disabled || pending}
          onChange={(e) => {
            setPrefix(e.target.value);
            setDirty(true);
          }}
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label={seq.document_type + " next number"}
          className="h-8 w-20"
          inputMode="numeric"
          value={next}
          aria-invalid={Boolean(!parsed.ok && parsed.errors["next"])}
          disabled={disabled || pending}
          onChange={(e) => {
            setNext(e.target.value);
            setDirty(true);
          }}
        />
      </TableCell>
      <TableCell>
        <Input
          aria-label={seq.document_type + " number padding"}
          className="h-8 w-16"
          inputMode="numeric"
          value={pad}
          aria-invalid={Boolean(!parsed.ok && parsed.errors["padding"])}
          disabled={disabled || pending}
          onChange={(e) => {
            setPad(e.target.value);
            setDirty(true);
          }}
        />
      </TableCell>
      <TableCell className="font-mono text-xs text-muted-foreground">
        {parsed.ok
          ? formatDocumentNumberPreview(
              parsed.value.prefix,
              parsed.value.next_number,
              parsed.value.padding,
            )
          : "—"}
        {error ? (
          <span id={errorId} role="alert" className="mt-1 block max-w-40 text-xs text-destructive">
            {error}
          </span>
        ) : serverChanged ? (
          <span role="status" className="mt-1 block max-w-40 text-xs text-destructive">
            Numbering changed on the server.
          </span>
        ) : null}
      </TableCell>
      <TableCell>
        {!disabled ? (
          <div className="flex flex-wrap gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={!dirty || !parsed.ok || serverChanged || pending}
              onClick={() => void saveDraft()}
            >
              {pending ? "Saving…" : "Save"}
            </Button>
            {dirty ? (
              <Button size="sm" variant="ghost" disabled={pending} onClick={discard}>
                {serverChanged ? "Reload" : "Discard"}
              </Button>
            ) : null}
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { SourceMigrationWizard } from "@/components/imports/SourceMigrationWizard";
import { validateMigrationCsv } from "@/lib/imports/source-migration";
import { toCsv } from "@/lib/sales/csv";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  importProductsCsv,
  type ProductsImportResult,
} from "@/lib/imports/products-import.functions";
import {
  importProjectsCsv,
  type ProjectsImportResult,
} from "@/lib/imports/projects-import.functions";
import { prepareBudgetImportCsv } from "@/lib/imports/budget-import";
import { prepareFixedAssetsCsv } from "@/lib/imports/fixed-assets-import";
import {
  fixedAssetSourceHeaders,
  mapFixedAssetCsv,
  type FixedAssetColumnMapping,
} from "@/lib/imports/fixed-assets-header-mapping";
import { fromMinorUnits } from "@/lib/accounting/money";
import {
  importFixedAssetRegisterCsv,
  getFixedAssetImportAvailability,
  type FixedAssetCsvImportResult,
} from "@/lib/fixed-assets/fixed-assets.functions";
import { importBudgetLinesCsv, listBudgets } from "@/lib/budgets/budgets.functions";
import { importSalesInvoicesCsv } from "@/lib/sales/sales.functions";
import { importPurchaseBillsCsv } from "@/lib/purchases/purchases.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  IMPORT_DEFINITIONS,
  importTemplateCsv,
  importFieldDictionaryCsv,
  type ImportModule,
} from "@/lib/imports/import-definitions";
import { previewImportCsv } from "@/lib/imports/import-preflight";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";

export const Route = createFileRoute("/_authenticated/imports")({
  validateSearch: (search: Record<string, unknown>) => ({
    module:
      typeof search["module"] === "string" &&
      IMPORT_DEFINITIONS.some((item) => item.module === search["module"])
        ? (search["module"] as ImportModule)
        : undefined,
  }),
  component: ImportCentre,
});

function saveCsv(text: string, name: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function ImportCentre() {
  const { module: scopedModule } = Route.useSearch();
  const [selected, setSelected] = useState(0);
  const definitions = useMemo(
    () =>
      scopedModule
        ? IMPORT_DEFINITIONS.filter((item) => item.module === scopedModule)
        : IMPORT_DEFINITIONS,
    [scopedModule],
  );
  useEffect(() => {
    setSelected(0);
    setCsv("");
    setFileName("");
  }, [scopedModule]);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [importResult, setImportResult] = useState<ProductsImportResult | null>(null);
  const [projectResult, setProjectResult] = useState<ProjectsImportResult | null>(null);
  const [salesResult, setSalesResult] = useState<{
    createdDrafts: number;
    authorised: number;
    skipped: number;
    failed: number;
    auditError: string | null;
    errors: Array<{ row: number; number: string; draftId: string | null; message: string }>;
  } | null>(null);
  const [authoriseImportedInvoices, setAuthoriseImportedInvoices] = useState(false);
  const [billResult, setBillResult] = useState<{
    createdDrafts: number;
    authorised: number;
    skipped: number;
    failed: number;
    auditError: string | null;
    errors: Array<{ row: number; number: string; draftId: string | null; message: string }>;
  } | null>(null);
  const [authoriseImportedBills, setAuthoriseImportedBills] = useState(false);
  const [budgetId, setBudgetId] = useState("");
  const [budgetMode, setBudgetMode] = useState<"merge" | "replace">("merge");
  const [budgetResult, setBudgetResult] = useState<{
    stored: number;
    accounts: number;
    budgetId: string;
    auditError: string | null;
  } | null>(null);
  const [fixedAssetResult, setFixedAssetResult] = useState<FixedAssetCsvImportResult | null>(null);
  const [assetImportAcknowledged, setAssetImportAcknowledged] = useState(false);
  const [assetFieldMapping, setAssetFieldMapping] = useState<FixedAssetColumnMapping>({});
  const isFixedAssetSelected = (definitions[selected] ?? definitions[0])?.module === "fixed_assets";
  const assetSourceHeaders = useMemo(() => {
    if (!csv || !isFixedAssetSelected) return [];
    try {
      return fixedAssetSourceHeaders(csv);
    } catch {
      return [];
    }
  }, [csv, isFixedAssetSelected]);
  const assetMapped = useMemo(() => {
    if (!csv || !isFixedAssetSelected) return { csv: "", error: "" };
    try {
      return { csv: mapFixedAssetCsv(csv, assetFieldMapping), error: "" };
    } catch (error) {
      return { csv: "", error: error instanceof Error ? error.message : "Invalid field mapping" };
    }
  }, [csv, assetFieldMapping, isFixedAssetSelected]);

  const { company } = useActiveCompany();
  const canManageProducts = useCanDo("products.manage");
  const canManageProjects = useCanDo("accounts.manage");
  const canDraftSales = useCanDo("sales.draft");
  const canAuthoriseSales = useCanDo("sales.authorise");
  const canDraftPurchases = useCanDo("purchases.draft");
  const canAuthorisePurchases = useCanDo("purchases.authorise");

  const importProducts = useServerFn(importProductsCsv);
  const importProjects = useServerFn(importProjectsCsv);
  const importSales = useServerFn(importSalesInvoicesCsv);
  const importBills = useServerFn(importPurchaseBillsCsv);
  const importBudgetLines = useServerFn(importBudgetLinesCsv);
  const importAssets = useServerFn(importFixedAssetRegisterCsv);
  const fetchBudgets = useServerFn(listBudgets);
  const checkAssetImport = useServerFn(getFixedAssetImportAvailability);
  const isAssetImport = isFixedAssetSelected;
  const assetReadyQ = useQuery({
    queryKey: ["fixed-asset-import-availability", company?.id],
    enabled: Boolean(company?.id && isAssetImport),
    queryFn: () => checkAssetImport({ data: { companyId: company!.id } }),
  });
  const isBudgetImport = (definitions[selected] ?? definitions[0])?.module === "budgets";
  const budgetsQ = useQuery({
    queryKey: ["budgets", company?.id],
    enabled: Boolean(company?.id && isBudgetImport),
    queryFn: () => fetchBudgets({ data: { companyId: company!.id } }),
  });
  const queryClient = useQueryClient();
  const productImport = useMutation({
    mutationFn: () => importProducts({ data: { companyId: company!.id, csvText: csv } }),
    onSuccess: async (result) => {
      setImportResult(result);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products", company!.id] }),
        queryClient.invalidateQueries({ queryKey: ["products-page", company!.id] }),
      ]);
      if (result.failed || result.auditError)
        toast.warning("Import completed with issues; review the result below.");
      else
        toast.success(
          `Imported ${result.created} products; skipped ${result.skipped} existing SKUs.`,
        );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const projectImport = useMutation({
    mutationFn: () => importProjects({ data: { companyId: company!.id, csvText: csv } }),
    onSuccess: async (result) => {
      setProjectResult(result);
      await queryClient.invalidateQueries({ queryKey: ["project-profitability", company!.id] });
      if (result.failed || result.auditError)
        toast.warning("Project import completed with issues; review results.");
      else
        toast.success(
          `Imported ${result.created} projects; skipped ${result.skipped} existing codes.`,
        );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const salesImport = useMutation({
    mutationFn: () =>
      importSales({
        data: { companyId: company!.id, csvText: csv, authorise: authoriseImportedInvoices },
      }),
    onSuccess: async (result) => {
      setSalesResult(result);
      await queryClient.invalidateQueries({ queryKey: ["sales-invoices", company!.id] });
      if (result.failed || result.auditError)
        toast.warning("Invoice import has issues. Review the results.");
      else
        toast.success(
          `Created ${result.createdDrafts} invoice drafts; authorised ${result.authorised}; skipped ${result.skipped}.`,
        );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const billImport = useMutation({
    mutationFn: () =>
      importBills({
        data: { companyId: company!.id, csvText: csv, authorise: authoriseImportedBills },
      }),
    onSuccess: async (result) => {
      setBillResult(result);
      await queryClient.invalidateQueries({ queryKey: ["purchase-bills", company!.id] });
      if (result.failed || result.auditError)
        toast.warning("Bill import completed with issues; review results.");
      else
        toast.success(
          `Created ${result.createdDrafts} bills; authorised ${result.authorised}; skipped ${result.skipped}.`,
        );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const budgetImport = useMutation({
    mutationFn: () =>
      importBudgetLines({
        data: { companyId: company!.id, budgetId, csvText: csv, mode: budgetMode },
      }),
    onSuccess: async (result) => {
      setBudgetResult(result);
      await queryClient.invalidateQueries({ queryKey: ["budget", company!.id, budgetId] });
      await queryClient.invalidateQueries({ queryKey: ["budgets", company!.id] });
      if (result.auditError)
        toast.warning("Budget saved, but audit logging failed. Review the audit log.");
      else
        toast.success(
          `Imported ${result.accounts} budget accounts and ${result.stored} monthly amounts.`,
        );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const assetImport = useMutation({
    mutationFn: () => importAssets({ data: { companyId: company!.id, csvText: assetMapped.csv } }),
    onSuccess: async (result) => {
      setFixedAssetResult(result);
      await queryClient.invalidateQueries({ queryKey: ["fixed-assets", company!.id] });
      toast.success(
        `Imported ${result.created} assets; skipped ${result.skipped} identical references.`,
      );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const importPending =
    productImport.isPending ||
    projectImport.isPending ||
    salesImport.isPending ||
    billImport.isPending ||
    budgetImport.isPending ||
    assetImport.isPending;
  const receiveMigrationCsv = useCallback((value: string, name: string) => {
    setCsv(value);
    setFileName(name);
    setImportResult(null);
    setProjectResult(null);
    setSalesResult(null);
    setBillResult(null);
  }, []);
  useEffect(() => {
    setCsv("");
    setFileName("");
    setImportResult(null);
    setProjectResult(null);
    setSalesResult(null);
    setBillResult(null);
    setBudgetResult(null);
    setFixedAssetResult(null);
    setBudgetId("");
    setAssetImportAcknowledged(false);
    setAssetFieldMapping({});
  }, [company?.id]);
  const definition = definitions[selected] ?? definitions[0]!;
  const preview = useMemo(() => {
    if (!csv) return null;
    if (definition.module === "fixed_assets" && assetMapped.error)
      return { result: null, error: assetMapped.error };
    const effectiveCsv = definition.module === "fixed_assets" ? assetMapped.csv : csv;
    try {
      if (["sales", "purchases", "products", "projects"].includes(definition.module))
        validateMigrationCsv(effectiveCsv, definition, company?.base_currency ?? "USD");
      if (definition.module === "budgets")
        prepareBudgetImportCsv(csv, company?.base_currency ?? "USD");
      if (definition.module === "fixed_assets")
        prepareFixedAssetsCsv(effectiveCsv, company?.base_currency ?? "USD");
      return {
        result: previewImportCsv(effectiveCsv, definition, {
          maxRows:
            definition.module === "fixed_assets"
              ? 100
              : ["products", "projects", "budgets"].includes(definition.module)
                ? 250
                : 10_000,
          uniqueBy: ["products", "projects"].includes(definition.module)
            ? definition.fields.slice(0, 1).map((f) => f.key)
            : [],
        }),
        error: "",
      };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : "Invalid CSV" };
    }
  }, [csv, definition, company?.base_currency, assetMapped]);
  const assetRows = useMemo(() => {
    if (
      definition.module !== "fixed_assets" ||
      !assetMapped.csv ||
      preview?.error ||
      preview?.result?.issues.length
    )
      return null;
    try {
      return prepareFixedAssetsCsv(assetMapped.csv, company?.base_currency ?? "USD");
    } catch {
      return null;
    }
  }, [
    definition.module,
    assetMapped.csv,
    company?.base_currency,
    preview?.error,
    preview?.result?.issues.length,
  ]);
  return (
    <ListWorkspace
      className="space-y-5"
      title={
        scopedModule
          ? `${scopedModule === "fixed_assets" ? "Fixed assets" : scopedModule.charAt(0).toUpperCase() + scopedModule.slice(1)} imports`
          : "Data import centre"
      }
      description={
        scopedModule
          ? "Import records for this module. Validate and review before saving; posting requires explicit authorisation."
          : "Organisation-wide data management: download templates, inspect files and validate before saving."
      }
    >
      {scopedModule && (
        <p className="text-sm text-muted-foreground">
          Only {scopedModule.replace("_", " ")} import types are shown here. For organisation-wide
          migrations, open the{" "}
          <Link to="/imports" search={{ module: undefined }} className="underline">
            full Data Import Centre
          </Link>
          .
        </p>
      )}
      {(salesResult ||
        billResult ||
        importResult ||
        projectResult ||
        budgetResult ||
        fixedAssetResult) && (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const result =
              salesResult ||
              billResult ||
              importResult ||
              projectResult ||
              budgetResult ||
              fixedAssetResult;
            saveCsv(
              toCsv(
                ["Field", "Result"],
                [
                  ["Organisation", company?.id ?? ""],
                  ["Source file", fileName],
                  ...Object.entries(result ?? {}).map(([key, value]) => [
                    key,
                    typeof value === "object" ? JSON.stringify(value) : String(value ?? ""),
                  ]),
                ],
              ),
              "streakbooks-import-results.csv",
            );
          }}
        >
          Download import results
        </Button>
      )}
      <div className="rounded-xl border p-5 space-y-4">
        <label className="block text-sm font-medium" htmlFor="import-kind">
          Import type
        </label>
        <select
          id="import-kind"
          disabled={importPending}
          className="w-full rounded-md border bg-background p-2"
          value={selected}
          onChange={(e) => {
            setSelected(Number(e.target.value));
            setCsv("");
            setFileName("");
            setImportResult(null);
            setProjectResult(null);
            setSalesResult(null);
            setBillResult(null);
            setBudgetResult(null);
            setFixedAssetResult(null);
            setAssetImportAcknowledged(false);
            setAssetFieldMapping({});
          }}
        >
          {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

          {definitions.map((item, i) => (
            <option key={item.module + item.documentType} value={i}>
              {item.module.replaceAll("_", " ")} — {item.documentType}
            </option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              saveCsv(importTemplateCsv(definition), definition.module + "-template.csv")
            }
          >
            Download template
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              saveCsv(importFieldDictionaryCsv(definition), definition.module + "-field-guide.csv")
            }
          >
            Download field guide
          </Button>
        </div>
        {["sales", "purchases", "products", "projects"].includes(definition.module) ? (
          <SourceMigrationWizard
            key={`${company?.id}:${definition.module}`}
            definition={definition}
            companyId={company?.id ?? ""}
            currency={company?.base_currency ?? "USD"}
            disabled={importPending || !company}
            onValidated={receiveMigrationCsv}
          />
        ) : (
          <>
            <label className="block text-sm font-medium" htmlFor="import-file">
              Select CSV to validate
            </label>
            <input
              id="import-file"
              disabled={importPending}
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                if (file.size > 5 * 1024 * 1024) {
                  setCsv("");
                  setFileName("File exceeds 5 MB");
                  return;
                }
                setImportResult(null);
                setProjectResult(null);
                setSalesResult(null);
                setBillResult(null);
                setBudgetResult(null);
                setFixedAssetResult(null);
                setAssetImportAcknowledged(false);
                setAssetFieldMapping({});
                setFileName(file.name);
                void file
                  .text()
                  .then(setCsv)
                  .catch(() => {
                    setCsv("");
                    setFileName("Could not read file");
                  });
              }}
            />
          </>
        )}
        {fileName && <p className="text-sm text-muted-foreground">{fileName}</p>}
        {preview?.error && (
          <p role="alert" className="text-sm text-destructive">
            {preview.error}
          </p>
        )}
        {preview?.result && (
          <div className="space-y-2">
            <p className="text-sm">
              Rows: {preview.result.records.length}; validation issues:{" "}
              {preview.result.issues.length}; possible duplicates:{" "}
              {preview.result.duplicates.length}
            </p>
            {preview.result.issues.slice(0, 30).map((issue, i) => (
              <p key={i} className="text-sm text-destructive">
                Row {issue.row}: {issue.message}
              </p>
            ))}
            {preview.result.issues.length > 30 && (
              <p className="text-sm">
                Additional issues exist. Correct the source file before importing.
              </p>
            )}
          </div>
        )}
        {definition.module === "products" && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm">
              Catalogue import creates non-inventory products and services only; it never posts
              stock, COGS, invoices or journals. Optional description, unit, sales/purchase tax
              rates and account IDs are supported. Account IDs must belong to this organisation and
              reference eligible active accounts. Only Active records can be imported: filter out
              Archived rows before exporting or importing. Existing active SKUs are skipped
              case-insensitively. Maximum 250 rows per file; database failures can produce a partial
              import.
            </p>
            <Button
              type="button"
              disabled={
                !company ||
                !canManageProducts ||
                !preview?.result ||
                preview.result.issues.length > 0 ||
                preview.result.duplicates.length > 0 ||
                productImport.isPending
              }
              onClick={() => {
                if (
                  window.confirm(
                    "Create validated Active items in this organisation? Existing SKUs are skipped. Prices, tax rates and eligible account defaults will be saved; no journals are posted.",
                  )
                )
                  productImport.mutate();
              }}
            >
              {productImport.isPending ? "Importing…" : "Import products and services"}
            </Button>
            {!canManageProducts && (
              <p className="text-sm text-destructive">
                You need products.manage permission to import.
              </p>
            )}
            {importResult && (
              <div role="status" className="space-y-1 text-sm">
                <p>
                  Created: {importResult.created}; skipped existing SKUs: {importResult.skipped};
                  failed: {importResult.failed}.
                </p>
                {importResult.errors.map((error, i) => (
                  <p key={i} className="text-destructive">
                    Row {error.row}: {error.message}
                  </p>
                ))}
                {importResult.auditError && (
                  <p className="text-destructive">
                    Audit recording failed: {friendlyAuthError(importResult.auditError)}. Review the
                    audit log before relying on this import.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {definition.module === "projects" && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm">
              Project master-data import only; does not post journals. Customer names must exactly
              match one active customer. Existing project codes are skipped (case-sensitive). A
              database error may result in a partial import.
            </p>
            <Button
              type="button"
              disabled={
                !company ||
                !canManageProjects ||
                !preview?.result ||
                preview.result.issues.length > 0 ||
                preview.result.duplicates.length > 0 ||
                projectImport.isPending
              }
              onClick={() => {
                if (
                  window.confirm(
                    "Import validated projects into this organisation? Existing exact project codes will be skipped.",
                  )
                )
                  projectImport.mutate();
              }}
            >
              {projectImport.isPending ? "Importing…" : "Import projects"}
            </Button>
            {!canManageProjects && (
              <p className="text-sm text-destructive">
                You need accounts.manage permission to import projects.
              </p>
            )}
            {projectResult && (
              <div role="status" className="space-y-1 text-sm">
                <p>
                  Created: {projectResult.created}; skipped existing codes: {projectResult.skipped};
                  failed: {projectResult.failed}.
                </p>
                {projectResult.errors.map((error, i) => (
                  <p key={i} className="text-destructive">
                    Row {error.row}: {error.message}
                  </p>
                ))}
                {projectResult.auditError && (
                  <p className="text-destructive">
                    Audit recording failed: {friendlyAuthError(projectResult.auditError)}. Review
                    the audit log before relying on this import.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {definition.module === "sales" && definition.documentType === "Invoices" && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm">
              Import invoice lines as real drafts through StreakBooks Sales services. Optionally
              authorise and post AR journals after creating each draft. Existing non-void invoice
              numbers are not imported again. Import is per-invoice: failures can leave a saved
              draft requiring review. Receipts and credit notes are not included in this import.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={authoriseImportedInvoices}
                onChange={(e) => setAuthoriseImportedInvoices(e.currentTarget.checked)}
                disabled={!canAuthoriseSales}
              />
              Authorise invoices and post accounts receivable journals
            </label>
            <Button
              type="button"
              disabled={
                !company ||
                !canDraftSales ||
                (authoriseImportedInvoices && !canAuthoriseSales) ||
                !preview?.result ||
                preview.result.issues.length > 0 ||
                salesImport.isPending
              }
              onClick={() => {
                if (
                  window.confirm(
                    authoriseImportedInvoices
                      ? "Create invoices and post accounts receivable journals? This changes your financial records."
                      : "Create invoice drafts from this CSV? No journals will be posted.",
                  )
                )
                  salesImport.mutate();
              }}
            >
              {salesImport.isPending
                ? "Importing invoices…"
                : authoriseImportedInvoices
                  ? "Import and authorise invoices"
                  : "Import invoice drafts"}
            </Button>
            {!canDraftSales && (
              <p className="text-sm text-destructive">
                You need sales.draft permission to import invoices.
              </p>
            )}
            {salesResult && (
              <div role="status" className="space-y-1 text-sm">
                <p>
                  Created drafts: {salesResult.createdDrafts}; authorised: {salesResult.authorised};
                  skipped: {salesResult.skipped}; failed: {salesResult.failed}.
                </p>
                {salesResult.errors.map((issue, i) => (
                  <p key={i} className="text-destructive">
                    Row {issue.row}, invoice {issue.number}: {issue.message}
                    {issue.draftId ? ` (draft ID: ${issue.draftId})` : ""}
                  </p>
                ))}
                {salesResult.auditError && (
                  <p className="text-destructive">
                    Audit recording failed: {friendlyAuthError(salesResult.auditError)}.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {definition.module === "purchases" && definition.documentType === "Bills" && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm">
              Import bills as real drafts through the Purchases service. Optionally authorise and
              post AP journals. Existing supplier invoice numbers are skipped. Supply tax codes when
              needed; no tax rate is inferred for blank codes. Failures can leave drafts requiring
              review. This does not import supplier payments, expenses or credits.
            </p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={authoriseImportedBills}
                onChange={(e) => setAuthoriseImportedBills(e.currentTarget.checked)}
                disabled={!canAuthorisePurchases}
              />
              Authorise imported bills and post accounts payable journals
            </label>
            <Button
              type="button"
              disabled={
                !company ||
                !canDraftPurchases ||
                (authoriseImportedBills && !canAuthorisePurchases) ||
                !preview?.result ||
                preview.result.issues.length > 0 ||
                billImport.isPending
              }
              onClick={() => {
                if (
                  window.confirm(
                    authoriseImportedBills
                      ? "Create bills and post accounts payable journals? This changes your financial records."
                      : "Create purchase bill drafts only? No journals will be posted.",
                  )
                )
                  billImport.mutate();
              }}
            >
              {billImport.isPending
                ? "Importing bills…"
                : authoriseImportedBills
                  ? "Import and authorise bills"
                  : "Import bill drafts"}
            </Button>
            {!canDraftPurchases && (
              <p className="text-sm text-destructive">
                You need purchases.draft permission to import bills.
              </p>
            )}
            {billResult && (
              <div role="status" className="space-y-1 text-sm">
                <p>
                  Created drafts: {billResult.createdDrafts}; authorised: {billResult.authorised};
                  skipped: {billResult.skipped}; failed: {billResult.failed}.
                </p>
                {billResult.errors.map((issue, i) => (
                  <p key={i} className="text-destructive">
                    Row {issue.row}, bill {issue.number}: {issue.message}
                    {issue.draftId ? ` (draft ID: ${issue.draftId})` : ""}
                  </p>
                ))}
                {billResult.auditError && (
                  <p className="text-destructive">
                    Audit recording failed: {friendlyAuthError(billResult.auditError)}.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {definition.module === "budgets" && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm">
              Import twelve fiscal months into an existing budget. This updates the planning budget
              only; it never posts to the general ledger. Account codes must match active income or
              expense accounts in this organisation. Import is validated before one atomic
              budget-lines RPC.
            </p>
            <label className="block text-sm font-medium" htmlFor="budget-import-target">
              Target budget
            </label>
            {budgetsQ.isPending ? (
              <LoadingState />
            ) : budgetsQ.isError ? (
              <QueryErrorState queries={[budgetsQ]} title="Could not load budgets" />
            ) : budgetsQ.isSuccess ? (
              <RecordLookupSelect
                id="budget-import-target"
                className="w-full rounded-md border bg-background p-2"
                value={budgetId}
                onValueChange={(e) => {
                  setBudgetId(e);
                  setBudgetResult(null);
                }}
              >
                <option value="">Select an existing budget</option>
                {(budgetsQ.data?.budgets ?? []).map((budget) => (
                  <option key={budget.id} value={budget.id}>
                    {budget.name} — FY from {budget.fiscal_year_start}
                  </option>
                ))}
              </RecordLookupSelect>
            ) : null}
            {budgetsQ.isSuccess && !budgetsQ.data?.budgets.length && (
              <p className="text-sm">
                No budgets found.{" "}
                <Link to="/budgets" className="underline">
                  Create a budget
                </Link>{" "}
                before importing lines.
              </p>
            )}
            <label className="block text-sm font-medium" htmlFor="budget-import-mode">
              How should imported amounts affect the existing budget?
            </label>
            <select
              id="budget-import-mode"
              className="w-full rounded-md border bg-background p-2"
              value={budgetMode}
              onChange={(e) => setBudgetMode(e.target.value as "merge" | "replace")}
            >
              <option value="merge">Merge: update only imported account-month combinations</option>
              <option value="replace">
                Replace: overwrite all existing budget amounts for this budget
              </option>
            </select>
            <Button
              type="button"
              disabled={
                !company ||
                !canManageProjects ||
                !budgetId ||
                !preview?.result ||
                preview.result.issues.length > 0 ||
                preview.result.duplicates.length > 0 ||
                budgetImport.isPending ||
                !budgetsQ.isSuccess ||
                budgetsQ.isError
              }
              onClick={() => {
                if (
                  window.confirm(
                    budgetMode === "replace"
                      ? "REPLACE all existing amounts in this budget with the uploaded CSV? This will overwrite any budget lines not included in the file."
                      : "Merge the validated monthly budget values into the selected budget? This changes budget planning data but not the general ledger.",
                  )
                )
                  budgetImport.mutate();
              }}
            >
              {budgetImport.isPending
                ? "Importing budget…"
                : budgetMode === "replace"
                  ? "Replace budget with CSV"
                  : "Merge budget CSV"}
            </Button>
            {!canManageProjects && (
              <p className="text-sm text-destructive">
                You need accounts.manage permission to import budget lines.
              </p>
            )}
            {budgetResult && (
              <div role="status" className="space-y-1 text-sm">
                <p>
                  Imported budget accounts: {budgetResult.accounts}; monthly amounts stored:{" "}
                  {budgetResult.stored}.
                </p>
                {budgetResult.auditError && (
                  <p className="text-destructive">
                    Audit logging failed: {friendlyAuthError(budgetResult.auditError)}. Review the
                    audit log.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {definition.module === "fixed_assets" && (
          <div className="space-y-4 rounded-lg border p-4">
            <h3 className="text-base font-semibold">Import fixed assets — review before saving</h3>
            {assetReadyQ.data?.available === false && (
              <p role="alert" className="text-sm text-destructive">
                {assetReadyQ.data.reason} Your accounting data has not been modified.
              </p>
            )}
            {assetReadyQ.isError ? (
              <QueryErrorState
                queries={[assetReadyQ]}
                title="Cannot verify fixed-asset import availability"
              />
            ) : (
              <>
                <p className="text-sm">
                  1. Download the sample CSV and field guide above. 2. Upload an asset register. 3.
                  Match your columns and review every financial field. 4. Confirm to create register
                  records.
                </p>
                <p className="text-sm">
                  External asset references are retained in the audit mapping. Your registered
                  assets receive StreakBooks asset numbers. This batch does not change existing
                  assets or create accounting journals.
                </p>
                {csv && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold">Match columns from your file</h4>
                    <p className="text-xs text-muted-foreground">
                      Headers matching the StreakBooks template are selected automatically. For
                      other systems, choose the source column for each field. Every required field
                      must be mapped.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {definition.fields.map((field) => {
                        const automatic =
                          assetSourceHeaders.find(
                            (h) =>
                              h.toLocaleLowerCase("en-US") ===
                              field.label.toLocaleLowerCase("en-US"),
                          ) ?? "";
                        const selectedColumn = assetFieldMapping[field.key] ?? automatic;
                        return (
                          <label key={field.key} className="space-y-1 text-xs">
                            <span className="font-medium">
                              {field.label}
                              {field.required ? " *" : ""}
                            </span>
                            <RecordLookupSelect
                              className="w-full rounded-md border bg-background p-2 text-sm"
                              value={selectedColumn}
                              onValueChange={(e) => {
                                setAssetFieldMapping((current) => ({
                                  ...current,
                                  [field.key]: e,
                                }));
                                setFixedAssetResult(null);
                                setAssetImportAcknowledged(false);
                              }}
                            >
                              <option value="">
                                {field.required ? "Select required column" : "Not supplied"}
                              </option>
                              {assetSourceHeaders.map((header) => (
                                <option key={header} value={header}>
                                  {header}
                                </option>
                              ))}
                            </RecordLookupSelect>
                          </label>
                        );
                      })}
                    </div>
                    {assetMapped.error && (
                      <p role="alert" className="text-sm text-destructive">
                        {assetMapped.error}
                      </p>
                    )}
                  </div>
                )}
                {assetRows && assetRows.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold">
                      Validated asset preview ({assetRows.length} records)
                    </h4>
                    <div className="overflow-x-auto rounded-md border">
                      <table className="w-full min-w-[850px] text-left text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            {[
                              "CSV row",
                              "External reference",
                              "Asset",
                              "Purchased",
                              "Method",
                              "Cost",
                              "Opening depreciation",
                              "Net book value",
                            ].map((h) => (
                              <th key={h} className="p-2">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {assetRows.slice(0, 25).map((a) => (
                            <tr key={a.externalCode} className="border-t">
                              <td className="p-2">{a.sourceRow}</td>
                              <td className="p-2">{a.externalCode}</td>
                              <td className="p-2">{a.name}</td>
                              <td className="p-2">{a.purchaseDate}</td>
                              <td className="p-2">{a.method.replaceAll("_", " ")}</td>
                              <td className="p-2 tabular-nums">
                                {fromMinorUnits(a.costMinor, company?.base_currency ?? "USD")}
                              </td>
                              <td className="p-2 tabular-nums">
                                {fromMinorUnits(
                                  a.openingAccumulatedMinor,
                                  company?.base_currency ?? "USD",
                                )}
                              </td>
                              <td className="p-2 tabular-nums">
                                {fromMinorUnits(
                                  a.costMinor - a.openingAccumulatedMinor,
                                  company?.base_currency ?? "USD",
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {assetRows.length > 25 && (
                      <p className="text-xs text-muted-foreground">
                        Showing the first 25 of {assetRows.length} assets; the server validates
                        every row before saving.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-4 text-sm">
                      <span>
                        Gross cost:{" "}
                        <strong className="tabular-nums">
                          {fromMinorUnits(
                            assetRows.reduce((sum, a) => sum + BigInt(a.costMinor), 0n),
                            company?.base_currency ?? "USD",
                          )}
                        </strong>
                      </span>
                      <span>
                        Opening depreciation:{" "}
                        <strong className="tabular-nums">
                          {fromMinorUnits(
                            assetRows.reduce(
                              (sum, a) => sum + BigInt(a.openingAccumulatedMinor),
                              0n,
                            ),
                            company?.base_currency ?? "USD",
                          )}
                        </strong>
                      </span>
                      <span>
                        Net book value:{" "}
                        <strong className="tabular-nums">
                          {fromMinorUnits(
                            assetRows.reduce(
                              (sum, a) => sum + BigInt(a.costMinor - a.openingAccumulatedMinor),
                              0n,
                            ),
                            company?.base_currency ?? "USD",
                          )}
                        </strong>
                      </span>
                    </div>
                  </div>
                )}
                <p className="text-sm">
                  All mapped GL account codes must resolve to active accounts in this organisation.
                  Each row supplies a depreciation method, valuation, residual amount, and the
                  remaining useful life or declining-balance rate where applicable.
                </p>
                <p className="text-sm font-medium">
                  Register-only import: historical acquisition cost and opening accumulated
                  depreciation must be reconciled to existing opening GL balances. This import will
                  not create purchase, opening-balance or depreciation journals.
                </p>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={assetImportAcknowledged}
                    onChange={(e) => setAssetImportAcknowledged(e.currentTarget.checked)}
                  />
                  I understand these are fixed asset register entries only, and I will reconcile
                  opening ledger balances separately.
                </label>
                <Button
                  type="button"
                  disabled={
                    !company ||
                    !canManageProjects ||
                    !assetReadyQ.data?.available ||
                    !assetImportAcknowledged ||
                    !assetRows?.length ||
                    !preview?.result ||
                    preview.result.issues.length > 0 ||
                    assetImport.isPending
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        "Import this entire fixed asset register into the selected organisation? No journals will be posted; existing external references will be checked for conflicts.",
                      )
                    )
                      assetImport.mutate();
                  }}
                >
                  {assetImport.isPending
                    ? "Importing asset register…"
                    : "Import fixed asset register"}
                </Button>
                {!canManageProjects && (
                  <p className="text-sm text-destructive">
                    You need accounts.manage permission to import assets.
                  </p>
                )}
                {fixedAssetResult && (
                  <div role="status" className="space-y-1 text-sm">
                    <p>
                      Created: {fixedAssetResult.created}; skipped identical imports:{" "}
                      {fixedAssetResult.skipped}.{" "}
                      <Link to="/fixed-assets" className="underline">
                        Return to fixed asset register
                      </Link>
                      .
                    </p>
                    {fixedAssetResult.assets.map((asset) => (
                      <p key={asset.asset_id}>
                        Reference {asset.external_code}: asset ID {asset.asset_id}
                      </p>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {definition.writeStatus === "implemented"
            ? ["products", "projects", "budgets", "fixed_assets"].includes(definition.module)
              ? "A validated import writer is available above. Explicit confirmation is required; budgets do not post ledger entries."
              : "An existing module-specific import workflow is available. Validation here is read-only; use the module workflow to save records."
            : definition.module === "sales" && definition.documentType === "Invoices"
              ? "Invoice drafting and optional AR posting are available above; receipts and credit notes require separate workflows."
              : definition.module === "purchases" && definition.documentType === "Bills"
                ? "Purchase bill drafting and optional AP posting are available above; expenses, supplier payments and credits require separate workflows."
                : "Import writing is not yet available for this document type. This page validates CSV only and does not create records or post journals."}
        </p>
        {definition.module === "banking" && (
          <Button asChild>
            <Link to="/banking/import">Open Banking importer</Link>
          </Button>
        )}
        {definition.module === "contacts" && (
          <Button asChild>
            <Link to="/contacts/import">Open Contacts importer</Link>
          </Button>
        )}
      </div>
    </ListWorkspace>
  );
}

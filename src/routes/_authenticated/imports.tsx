import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { importProductsCsv, type ProductsImportResult } from "@/lib/imports/products-import.functions";
import { importProjectsCsv, type ProjectsImportResult } from "@/lib/imports/projects-import.functions";
import { importPurchaseBillsCsv } from "@/lib/purchases/purchases.functions";
import { createFileRoute, Link } from "@tanstack/react-router";
import { IMPORT_DEFINITIONS, importTemplateCsv, importFieldDictionaryCsv } from "@/lib/imports/import-definitions";
import { previewImportCsv } from "@/lib/imports/import-preflight";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/common/states";

export const Route = createFileRoute("/_authenticated/imports")({
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
  const [selected, setSelected] = useState(0);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [importResult, setImportResult] = useState<ProductsImportResult | null>(null);
  const [projectResult, setProjectResult] = useState<ProjectsImportResult | null>(null);
  const [billResult, setBillResult] = useState<{ createdDrafts: number; authorised: number; skipped: number; failed: number; auditError: string | null; errors: Array<{ row: number; number: string; draftId: string | null; message: string }> } | null>(null);
  const [authoriseImportedBills, setAuthoriseImportedBills] = useState(false);
  const { company } = useActiveCompany();
  const canManageProducts = useCanDo("products.manage");
  const canManageProjects = useCanDo("accounts.manage");
  const canDraftPurchases = useCanDo("purchases.draft");
  const canAuthorisePurchases = useCanDo("purchases.authorise");
  const importProducts = useServerFn(importProductsCsv);
  const importProjects = useServerFn(importProjectsCsv);
  const importBills = useServerFn(importPurchaseBillsCsv);
  const queryClient = useQueryClient();
  const productImport = useMutation({
    mutationFn: () => importProducts({ data: { companyId: company!.id, csvText: csv } }),
    onSuccess: async (result) => {
      setImportResult(result);
      await queryClient.invalidateQueries({ queryKey: ["products", company!.id] });
      if (result.failed || result.auditError) toast.warning("Import completed with issues; review the result below.");
      else toast.success(`Imported ${result.created} products; skipped ${result.skipped} existing SKUs.`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const projectImport = useMutation({
    mutationFn: () => importProjects({ data: { companyId: company!.id, csvText: csv } }),
    onSuccess: async (result) => {
      setProjectResult(result);
      await queryClient.invalidateQueries({ queryKey: ["project-profitability", company!.id] });
      if (result.failed || result.auditError) toast.warning("Project import completed with issues; review results.");
      else toast.success(`Imported ${result.created} projects; skipped ${result.skipped} existing codes.`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const billImport = useMutation({
    mutationFn: () => importBills({ data: { companyId: company!.id, csvText: csv, authorise: authoriseImportedBills } }),
    onSuccess: async (result) => {
      setBillResult(result);
      await queryClient.invalidateQueries({ queryKey: ["purchase-bills", company!.id] });
      if (result.failed || result.auditError) toast.warning("Bill import completed with issues; review results.");
      else toast.success(`Created ${result.createdDrafts} bills; authorised ${result.authorised}; skipped ${result.skipped}.`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const definition = IMPORT_DEFINITIONS[selected]!;
  const preview = useMemo(() => {
    if (!csv) return null;
    try { return { result: previewImportCsv(csv, definition, { maxRows: ["products", "projects"].includes(definition.module) ? 250 : 10_000, uniqueBy: ["products", "projects"].includes(definition.module) ? definition.fields.slice(0, 1).map((f) => f.key) : [] }), error: "" }; }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : "Invalid CSV" }; }
  }, [csv, definition]);
  return (
    <div className="space-y-5">
      <PageHeader title="Data import centre" description="Download templates, inspect files and validate data before any accounting records are created." />
      <div className="rounded-xl border p-5 space-y-4">
        <label className="block text-sm font-medium" htmlFor="import-kind">Import type</label>
        <select id="import-kind" className="w-full rounded-md border bg-background p-2" value={selected} onChange={(e) => { setSelected(Number(e.target.value)); setCsv(""); setFileName(""); setImportResult(null); setProjectResult(null); setBillResult(null); }}>
          {IMPORT_DEFINITIONS.map((item, i) => <option key={item.module + item.documentType} value={i}>{item.module.replaceAll("_", " ")} — {item.documentType}</option>)}
        </select>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => saveCsv(importTemplateCsv(definition), definition.module + "-template.csv")}>Download template</Button>
          <Button type="button" variant="outline" onClick={() => saveCsv(importFieldDictionaryCsv(definition), definition.module + "-field-guide.csv")}>Download field guide</Button>
        </div>
        <label className="block text-sm font-medium" htmlFor="import-file">Select CSV to validate</label>
        <input id="import-file" type="file" accept=".csv,text/csv" onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (!file) return;
          if (file.size > 5 * 1024 * 1024) { setCsv(""); setFileName("File exceeds 5 MB"); return; }
          setImportResult(null);
          setProjectResult(null);
          setBillResult(null);
          setFileName(file.name);
          void file.text().then(setCsv).catch(() => { setCsv(""); setFileName("Could not read file"); });
        }} />
        {fileName && <p className="text-sm text-muted-foreground">{fileName}</p>}
        {preview?.error && <p role="alert" className="text-sm text-destructive">{preview.error}</p>}
        {preview?.result && <div className="space-y-2">
          <p className="text-sm">Rows: {preview.result.records.length}; validation issues: {preview.result.issues.length}; possible duplicates: {preview.result.duplicates.length}</p>
          {preview.result.issues.slice(0, 30).map((issue, i) => <p key={i} className="text-sm text-destructive">Row {issue.row}: {issue.message}</p>)}
          {preview.result.issues.length > 30 && <p className="text-sm">Additional issues exist. Correct the source file before importing.</p>}
        </div>}
        {definition.module === "products" && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm">Catalogue import only: creates non-inventory product and service records. It does not create stock balances, COGS, invoices or journal entries. Existing active SKUs are skipped, including case-insensitive matches. A database error can produce a partial import.</p>
            <Button type="button" disabled={!company || !canManageProducts || !preview?.result || preview.result.issues.length > 0 || preview.result.duplicates.length > 0 || productImport.isPending}
              onClick={() => {
                if (window.confirm("Import validated catalogue rows into this organisation? Existing active SKUs will be skipped.")) productImport.mutate();
              }}>
              {productImport.isPending ? "Importing…" : "Import products and services"}
            </Button>
            {!canManageProducts && <p className="text-sm text-destructive">You need products.manage permission to import.</p>}
            {importResult && (
              <div role="status" className="space-y-1 text-sm">
                <p>Created: {importResult.created}; skipped existing SKUs: {importResult.skipped}; failed: {importResult.failed}.</p>
                {importResult.errors.map((error, i) => <p key={i} className="text-destructive">Row {error.row}: {error.message}</p>)}
                {importResult.auditError && <p className="text-destructive">Audit recording failed: {importResult.auditError}. Review the audit log before relying on this import.</p>}
              </div>
            )}
          </div>
        )}
        {definition.module === "projects" && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm">Project master-data import only; does not post journals. Customer names must exactly match one active customer. Existing project codes are skipped (case-sensitive). A database error may result in a partial import.</p>
            <Button type="button" disabled={!company || !canManageProjects || !preview?.result || preview.result.issues.length > 0 || preview.result.duplicates.length > 0 || projectImport.isPending}
              onClick={() => {
                if (window.confirm("Import validated projects into this organisation? Existing exact project codes will be skipped.")) projectImport.mutate();
              }}>
              {projectImport.isPending ? "Importing…" : "Import projects"}
            </Button>
            {!canManageProjects && <p className="text-sm text-destructive">You need accounts.manage permission to import projects.</p>}
            {projectResult && (
              <div role="status" className="space-y-1 text-sm">
                <p>Created: {projectResult.created}; skipped existing codes: {projectResult.skipped}; failed: {projectResult.failed}.</p>
                {projectResult.errors.map((error, i) => <p key={i} className="text-destructive">Row {error.row}: {error.message}</p>)}
                {projectResult.auditError && <p className="text-destructive">Audit recording failed: {projectResult.auditError}. Review the audit log before relying on this import.</p>}
              </div>
            )}
          </div>
        )}
        {definition.module === "purchases" && definition.documentType === "Bills" && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm">Import bills as real drafts through the Purchases service. Optionally authorise and post AP journals. Existing supplier invoice numbers are skipped. Supply tax codes when needed; no tax rate is inferred for blank codes. Failures can leave drafts requiring review. This does not import supplier payments, expenses or credits.</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={authoriseImportedBills} onChange={(e) => setAuthoriseImportedBills(e.currentTarget.checked)} disabled={!canAuthorisePurchases} />
              Authorise imported bills and post accounts payable journals
            </label>
            <Button type="button" disabled={!company || !canDraftPurchases || (authoriseImportedBills && !canAuthorisePurchases) || !preview?.result || preview.result.issues.length > 0 || billImport.isPending}
              onClick={() => {
                if (window.confirm(authoriseImportedBills
                  ? "Create bills and post accounts payable journals? This changes your financial records."
                  : "Create purchase bill drafts only? No journals will be posted.")) billImport.mutate();
              }}>
              {billImport.isPending ? "Importing bills…" : authoriseImportedBills ? "Import and authorise bills" : "Import bill drafts"}
            </Button>
            {!canDraftPurchases && <p className="text-sm text-destructive">You need purchases.draft permission to import bills.</p>}
            {billResult && <div role="status" className="space-y-1 text-sm">
              <p>Created drafts: {billResult.createdDrafts}; authorised: {billResult.authorised}; skipped: {billResult.skipped}; failed: {billResult.failed}.</p>
              {billResult.errors.map((issue, i) => <p key={i} className="text-destructive">Row {issue.row}, bill {issue.number}: {issue.message}{issue.draftId ? ` (draft ID: ${issue.draftId})` : ""}</p>)}
              {billResult.auditError && <p className="text-destructive">Audit recording failed: {billResult.auditError}.</p>}
            </div>}
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          {definition.writeStatus === "implemented"
            ? definition.module === "products" || definition.module === "projects"
              ? "Master-data writes are available here after validation and explicit confirmation."
              : "An existing module-specific import workflow is available. Validation here is read-only; use the module workflow to save records."
            : definition.module === "purchases" && definition.documentType === "Bills"
              ? "Purchase bill drafting and optional AP posting are available above; expenses, supplier payments and credits require separate workflows."
              : "Import writing is not yet available for this document type. This page validates CSV only and does not create records or post journals."}
        </p>
        {definition.module === "banking" && <Button asChild><Link to="/banking/import">Open Banking importer</Link></Button>}
        {definition.module === "contacts" && <Button asChild><Link to="/contacts/import">Open Contacts importer</Link></Button>}
      </div>
    </div>
  );
}

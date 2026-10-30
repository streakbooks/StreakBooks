import { useMemo, useState } from "react";
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
  const definition = IMPORT_DEFINITIONS[selected]!;
  const preview = useMemo(() => {
    if (!csv) return null;
    try { return { result: previewImportCsv(csv, definition, { uniqueBy: definition.fields.slice(0, 1).map((f) => f.key) }), error: "" }; }
    catch (error) { return { result: null, error: error instanceof Error ? error.message : "Invalid CSV" }; }
  }, [csv, definition]);
  return (
    <div className="space-y-5">
      <PageHeader title="Data import centre" description="Download templates, inspect files and validate data before any accounting records are created." />
      <div className="rounded-xl border p-5 space-y-4">
        <label className="block text-sm font-medium" htmlFor="import-kind">Import type</label>
        <select id="import-kind" className="w-full rounded-md border bg-background p-2" value={selected} onChange={(e) => { setSelected(Number(e.target.value)); setCsv(""); setFileName(""); }}>
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
        <p className="text-sm text-muted-foreground">
          {definition.writeStatus === "implemented"
            ? "An existing module-specific import workflow is available. Validation here is read-only; use the module workflow to save records."
            : "Import writing is not yet available for this document type. This page validates CSV only and does not create records or post journals."}
        </p>
        {definition.module === "banking" && <Button asChild><Link to="/banking/import">Open Banking importer</Link></Button>}
        {definition.module === "contacts" && <Button asChild><Link to="/contacts/import">Open Contacts importer</Link></Button>}
      </div>
    </div>
  );
}

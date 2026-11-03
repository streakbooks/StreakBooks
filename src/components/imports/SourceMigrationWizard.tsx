import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { ImportDefinition } from "@/lib/imports/import-definitions";
import {
  MIGRATION_SOURCES,
  mapMigrationCsv,
  migrationHeaders,
  migrationValidationReport,
  suggestMigrationMapping,
  validateMigrationCsv,
  validateSourceFinancialSemantics,
  type MigrationDateFormat,
  type MigrationMapping,
} from "@/lib/imports/source-migration";

function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function SourceMigrationWizard({
  definition,
  companyId,
  currency,
  disabled,
  onValidated,
}: {
  definition: ImportDefinition;
  companyId: string;
  currency: string;
  disabled: boolean;
  onValidated: (csv: string, fileName: string) => void;
}) {
  const [source, setSource] = useState("Xero");
  const [raw, setRaw] = useState("");
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<MigrationMapping>({});
  const [format, setFormat] = useState<MigrationDateFormat>("ISO");
  const [readError, setReadError] = useState("");
  const [reading, setReading] = useState(false);
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  const headers = useMemo(() => {
    try {
      return raw ? migrationHeaders(raw) : [];
    } catch {
      return [];
    }
  }, [raw]);
  const result = useMemo(() => {
    if (!raw) return { csv: "", error: "" };
    try {
      if (["sales", "purchases"].includes(definition.module))
        validateSourceFinancialSemantics(raw, currency);
      const csv = mapMigrationCsv(raw, definition, mapping, format);
      validateMigrationCsv(csv, definition, currency);
      return { csv, error: "" };
    } catch (error) {
      return { csv: "", error: error instanceof Error ? error.message : "Validation failed" };
    }
  }, [raw, definition, mapping, format, currency]);
  useEffect(() => {
    onValidated(result.csv, fileName);
  }, [result.csv, fileName, onValidated]);
  return (
    <section aria-label="Migration wizard" className="space-y-3 rounded-lg border p-4">
      <h2 className="font-semibold">Migration wizard — map, validate, import</h2>
      <p className="text-sm text-muted-foreground">
        Upload one exported CSV at a time. Review suggested columns, then use the import action
        below. Import contacts, accounts and tax codes first. Source selection labels the validation
        report; export layouts vary and every mapping needs review.
      </p>
      <label className="block text-sm">
        Source software
        <select
          aria-label="Source software"
          className="mt-1 block w-full rounded border bg-background p-2"
          disabled={disabled || reading}
          value={source}
          onChange={(e) => setSource(e.target.value)}
        >
          {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

          {MIGRATION_SOURCES.map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Source date format
        <select
          aria-label="Source date format"
          className="mt-1 block w-full rounded border bg-background p-2"
          disabled={disabled}
          value={format}
          onChange={(e) => setFormat(e.target.value as MigrationDateFormat)}
        >
          <option value="ISO">YYYY-MM-DD</option>
          <option value="DMY">DD/MM/YYYY</option>
          <option value="MDY">MM/DD/YYYY</option>
        </select>
      </label>
      <label className="block text-sm">
        Exported CSV (maximum 5 MB)
        <input
          className="mt-1 block"
          type="file"
          accept=".csv,text/csv"
          disabled={disabled || reading}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            const version = ++generation.current;
            setRaw("");
            setMapping({});
            setReadError("");
            onValidated("", "");
            if (!file) return;
            setFileName(file.name);
            if (file.size > 5 * 1024 * 1024) {
              setReadError("File exceeds 5 MB");
              return;
            }
            setReading(true);
            void file
              .text()
              .then((text) => {
                if (generation.current !== version) return;
                const headings = migrationHeaders(text);
                setMapping(suggestMigrationMapping(headings, definition));
                setRaw(text);
              })
              .catch((error: unknown) => {
                if (generation.current === version)
                  setReadError(error instanceof Error ? error.message : "Could not read file");
              })
              .finally(() => {
                if (generation.current === version) setReading(false);
              });
          }}
        />
      </label>
      {reading && <p role="status">Reading source file…</p>}
      {fileName && <p className="text-sm">{fileName}</p>}
      {headers.length > 0 && (
        <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
          <legend className="text-sm font-medium">Review column mapping</legend>
          {definition.fields.map((field) => (
            <label key={field.key} className="text-sm">
              {field.label}
              {field.required ? " *" : ""}
              <RecordLookupSelect
                aria-label={`Map ${field.label}`}
                className="mt-1 block w-full rounded border bg-background p-2"
                value={mapping[field.key] ?? ""}
                onValueChange={(e) => setMapping({ ...mapping, [field.key]: e })}
              >
                <option value="">
                  {field.required ? "Choose source column" : "Do not import"}
                </option>
                {headers.map((header) => (
                  <option key={header}>{header}</option>
                ))}
              </RecordLookupSelect>
            </label>
          ))}
        </fieldset>
      )}
      {(readError || result.error) && (
        <p role="alert" className="text-sm text-destructive">
          {readError || result.error}
        </p>
      )}
      {result.csv && (
        <p role="status" className="text-sm">
          File checks passed. Ready for server validation and import below. This is not a reconciled
          migration.
        </p>
      )}
      <Button
        type="button"
        variant="outline"
        disabled={!raw && !readError}
        onClick={() =>
          download(
            migrationValidationReport(
              source,
              fileName,
              definition,
              mapping,
              readError || result.error,
              companyId,
              currency,
            ),
            "linkbooks-migration-validation.csv",
          )
        }
      >
        Download validation report
      </Button>
      <p className="text-sm text-muted-foreground">
        This workflow imports base-currency, tax-exclusive document lines. Convert tax-inclusive
        exports explicitly before upload. Payments, credits, discounts, attachments, foreign
        currency and opening balances require separate reconciliation and workflows. No direct
        provider connection is made.
      </p>
    </section>
  );
}

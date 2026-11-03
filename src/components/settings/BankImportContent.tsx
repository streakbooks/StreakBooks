import { parseOfxStatement, OFX_MAPPING } from "@/lib/banking/ofx-import";
import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useRouterState } from "@tanstack/react-router";
import { useId, useEffect, useMemo, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { fromMinorUnits } from "@/lib/accounting/money";
import {
  getImportDefinition,
  importTemplateCsv,
  importFieldDictionaryCsv,
} from "@/lib/imports/import-definitions";
import { listBankAccounts, listStatementImports } from "@/lib/banking/banking.functions";
import {
  AMOUNT_MODES,
  DATE_FORMATS,
  applyMapping,
  assignExternalIds,
  coerceMapping,
  guessMapping,
  parseCsvText,
  validateMapping,
  type AmountMode,
  type DateFormat,
  type Delimiter,
  type ImportMapping,
} from "@/lib/banking/csv-mapping";
import {
  getBankImportMapping,
  importBankStatement,
  previewBankImport,
  saveBankImportMapping,
} from "@/lib/banking/import.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { BankLookup } from "@/components/lookup";
import { Label } from "@/components/ui/label";
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

const NONE = "none";
const MAX_FILE_CHARS = 5_000_000;
function downloadImportCsv(content: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob(["\\uFEFF", content], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
function downloadBankTemplate() {
  downloadImportCsv(
    importTemplateCsv(getImportDefinition("banking", "Bank transactions")),
    "linkbooks-bank-transactions-template.csv",
  );
}
function downloadBankDictionary() {
  downloadImportCsv(
    importFieldDictionaryCsv(getImportDefinition("banking", "Bank transactions")),
    "linkbooks-bank-import-field-guide.csv",
  );
}

const storageKey = (companyId: string, bankAccountId: string) =>
  `linkbooks.bankImportMapping.${companyId}.${bankAccountId}`;

function readLocalMapping(companyId: string, bankAccountId: string): ImportMapping | null {
  try {
    const raw = window.localStorage.getItem(storageKey(companyId, bankAccountId));
    return raw ? coerceMapping(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocalMapping(companyId: string, bankAccountId: string, mapping: ImportMapping) {
  try {
    window.localStorage.setItem(storageKey(companyId, bankAccountId), JSON.stringify(mapping));
  } catch {
    /* storage unavailable (private mode): the mapping is simply not remembered */
  }
}

function ColumnSelect({
  label,
  value,
  columns,
  optional,
  onChange,
}: {
  label: string;
  value: number | null;
  columns: string[];
  optional?: boolean;
  onChange: (next: number | null) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <RecordLookupSelect
        value={value === null ? NONE : String(value)}
        onValueChange={(v) => onChange(v === NONE ? null : Number(v))}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optional ? <SelectItem value={NONE}>Not in file</SelectItem> : null}
          {columns.map((c, i) => (
            <SelectItem key={i} value={String(i)}>
              {i + 1}. {c}
            </SelectItem>
          ))}
        </SelectContent>
      </RecordLookupSelect>
    </div>
  );
}

export function BankImportContent({ embedded = false }: { embedded?: boolean }) {
  const uiId = useId();
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const search = useRouterState({ select: (s) => s.location.search }) as { bankAccountId?: string };
  const qc = useQueryClient();
  const fetchAccounts = useServerFn(listBankAccounts);
  const fetchImports = useServerFn(listStatementImports);
  const fetchMapping = useServerFn(getBankImportMapping);
  const saveMapping = useServerFn(saveBankImportMapping);
  const preview = useServerFn(previewBankImport);
  const doImport = useServerFn(importBankStatement);

  const [bankAccountId, setBankAccountId] = useState(
    typeof search.bankAccountId === "string" ? search.bankAccountId : "",
  );
  const [filename, setFilename] = useState("statement.csv");
  const [csvText, setCsvText] = useState("");
  const [mapping, setMapping] = useState<ImportMapping | null>(null);
  const [mappingSource, setMappingSource] = useState<"guess" | "saved">("guess");
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState("");
  const [ofxInfo, setOfxInfo] = useState<{ currency: string; accountId: string } | null>(null);
  async function loadCsvFile(file: File) {
    setFileError("");
    setCsvText("");
    setOfxInfo(null);
    if (!/\.(csv|txt|ofx|qfx)$/i.test(file.name)) {
      setFileError(
        "Use CSV, TXT, OFX or QFX. PDF, QIF and investment statements are not supported.",
      );
      return;
    }
    if (file.size > MAX_FILE_CHARS) {
      setFileError("File is too large (maximum 5 MB). Split it by date range.");
      return;
    }
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error("The selected file is empty.");
      const ofx = /\.(ofx|qfx)$/i.test(file.name) ? parseOfxStatement(text) : null;
      setOfxInfo(ofx ? { currency: ofx.currency, accountId: ofx.accountId } : null);
      setFilename(file.name);
      setCsvText(ofx?.csvText ?? text);
      setMapping(ofx ? { ...OFX_MAPPING } : null);
      setIncludeDuplicates(false);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Could not read statement");
    }
  }

  const accountsQ = useQuery({
    queryKey: ["bank-accounts", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchAccounts({ data: { companyId: companyId! } }),
  });
  const importsQ = useQuery({
    queryKey: ["bank-imports", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchImports({ data: { companyId: companyId! } }),
  });
  const account = (accountsQ.data ?? []).find((a) => a.id === bankAccountId);
  const currency = account?.currency_code ?? company?.base_currency ?? "GBP";
  const ofxCurrencyMismatch = Boolean(ofxInfo && account && ofxInfo.currency !== currency);

  const savedQ = useQuery({
    queryKey: ["bank-import-mapping", companyId, bankAccountId],
    enabled: Boolean(companyId && bankAccountId),
    queryFn: () => fetchMapping({ data: { companyId: companyId!, bankAccountId } }),
  });

  const parsed = useMemo(() => {
    if (!csvText.trim()) return null;
    return parseCsvText(csvText, mapping?.delimiter ?? "auto");
  }, [csvText, mapping?.delimiter]);

  // Pick the starting mapping when a file is loaded: saved mapping (server, then this browser), else a guess.
  useEffect(() => {
    if (!csvText.trim() || !companyId || !bankAccountId || savedQ.isPending) return;
    if (ofxInfo) {
      setMapping({ ...OFX_MAPPING });
      setMappingSource("guess");
      return;
    }
    const base = parseCsvText(csvText, "auto");
    const saved =
      savedQ.data?.mapping ?? (bankAccountId ? readLocalMapping(companyId, bankAccountId) : null);
    const usable =
      saved && validateMapping(saved, base.rows[0]?.length ?? 0).length === 0 ? saved : null;
    setMapping(usable ?? guessMapping(base.rows, "auto"));
    setMappingSource(usable ? "saved" : "guess");
  }, [csvText, companyId, bankAccountId, savedQ.isPending, savedQ.data, ofxInfo]);

  const columnCount = Math.max(0, ...(parsed?.rows ?? []).slice(0, 50).map((r) => r.length));
  const headerRow = parsed?.rows[0] ?? [];
  const columns = Array.from({ length: columnCount }, (_, i) => {
    const label = mapping?.hasHeader ? (headerRow[i] ?? "").trim() : "";
    return label || `Column ${i + 1}`;
  });
  const problems = mapping && parsed ? validateMapping(mapping, columnCount) : [];
  const mapped = useMemo(
    () =>
      mapping && parsed && problems.length === 0
        ? applyMapping(parsed.rows, mapping, currency)
        : null,
    [mapping, parsed, currency, problems.length],
  );

  const mappingKey = JSON.stringify(mapping);
  const dupQ = useQuery({
    queryKey: [
      "bank-import-dups",
      companyId,
      bankAccountId,
      csvText.length,
      filename,
      mappingKey,
      currency,
    ],
    enabled: Boolean(companyId && bankAccountId && mapped && mapped.rows.length > 0),
    queryFn: async () => {
      const keyed = await assignExternalIds(mapped!.rows, bankAccountId);
      const rows = keyed.map((r) => ({
        rowNumber: r.rowNumber,
        txnDate: r.txnDate,
        amountMinor: Number(r.amountMinor),
        description: r.description,
        reference: r.reference,
        payee: r.payee,
        externalId: r.externalId,
      }));
      const res = await preview({ data: { companyId: companyId!, bankAccountId, rows } });
      return { rows, duplicates: res.duplicates };
    },
  });
  const dupRows = new Set((dupQ.data?.duplicates ?? []).map((d) => d.rowNumber));

  const mutation = useMutation({
    mutationFn: async () => {
      if (ofxCurrencyMismatch)
        throw new Error("The OFX currency does not match the selected bank account");
      const base = dupQ.data!.rows;
      const rows = base
        .filter((r) => includeDuplicates || !dupRows.has(r.rowNumber))
        .map((r) => ({ ...r, force: dupRows.has(r.rowNumber) }));
      if (rows.length === 0)
        throw new Error("Every row looks like a duplicate. Tick the box to import them anyway.");
      const result = await doImport({
        data: {
          companyId: companyId!,
          bankAccountId,
          filename,
          rows,
          parseErrorCount: mapped!.errors.length,
          parseErrorSummary: mapped!.errors
            .slice(0, 10)
            .map((e) => `Row ${e.rowNumber}: ${e.message}`)
            .join("; "),
        },
      });
      // Remember the mapping for this bank account (database, with this browser as a fallback).
      writeLocalMapping(companyId!, bankAccountId, mapping!);
      await saveMapping({
        data: { companyId: companyId!, bankAccountId, mapping: mapping! },
      }).catch(() => null);
      return result;
    },
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["bank-imports", companyId] });
      await qc.invalidateQueries({ queryKey: ["bank-transactions", companyId] });
      await qc.invalidateQueries({ queryKey: ["bank-account-summaries", companyId] });
      await qc.invalidateQueries({ queryKey: ["banking-counts", companyId] });
      await qc.invalidateQueries({ queryKey: ["bank-import-mapping", companyId, bankAccountId] });
      toast.success(
        `Imported ${r.imported}. Already present (skipped): ${r.duplicates}. Rows with problems: ${r.parseErrors}. Status: ${r.status}`,
      );
      setCsvText("");
      setMapping(null);
      setIncludeDuplicates(false);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  const patch = (p: Partial<ImportMapping>) => setMapping((m) => (m ? { ...m, ...p } : m));
  const rowsToImport = mapped ? mapped.rows.length - (includeDuplicates ? 0 : dupRows.size) : 0;
  const canImport =
    Boolean(bankAccountId && mapped && mapped.rows.length > 0 && dupQ.data) &&
    !ofxCurrencyMismatch &&
    rowsToImport > 0 &&
    !mutation.isPending;

  return (
    <>
      {!embedded && (
        <PageHeader
          title="Import bank transactions"
          description="Upload a statement, map fields, review errors and duplicates, then confirm the import."
        />
      )}
      <div className="mb-6 flex flex-wrap gap-2" aria-label="Import steps">
        {["1. Upload", "2. Map fields", "3. Review", "4. Import"].map((step, i) => (
          <span
            key={step}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${(csvText ? (mapped ? 2 : 1) : 0) === i ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"}`}
          >
            {step}
          </span>
        ))}
      </div>
      <section className="mb-6 max-w-3xl space-y-5 rounded-lg border bg-card p-5">
        <div className="space-y-2">
          <h2 className="font-semibold">Prepare your bank statement</h2>
          <p className="text-sm text-muted-foreground">
            Export CSV, OFX or QFX from your bank, or use the LinkBooks CSV template. Import one
            bank account at a time. Positive amounts are money received and negative amounts are
            money spent.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={downloadBankTemplate}>
            <Download className="mr-2 size-4" /> Download CSV template
          </Button>
          <p className="text-xs text-muted-foreground">
            Columns: Date, Description, Amount, Payee, Reference, Bank Transaction ID and optional
            Running Balance. Use YYYY-MM-DD dates. Remove the example row before importing.
          </p>
        </div>
        <div className="space-y-1">
          <Label>Bank account</Label>
          <BankLookup
            ariaLabel="Bank account"
            accounts={accountsQ.data ?? []}
            value={bankAccountId}
            onChange={setBankAccountId}
            companyId={companyId}
            placeholder="Select account"
            allowClear={false}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${uiId}-csv-file`}>Statement file</Label>
          <label
            htmlFor={`${uiId}-csv-file`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) void loadCsvFile(file);
            }}
            className={`flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-center ${dragOver ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}
          >
            <UploadCloud className="size-8 text-muted-foreground" />
            <span className="text-sm font-medium">Drag and drop your file or click to browse</span>
            <span className="text-xs text-muted-foreground">
              CSV, TXT, OFX or QFX · Maximum 5 MB
            </span>
            <span className="rounded-md border bg-background px-3 py-1.5 text-sm">
              {csvText ? filename : "Choose file"}
            </span>
          </label>
          <input
            id={`${uiId}-csv-file`}
            type="file"
            accept=".csv,.txt,.ofx,.qfx,text/csv,text/plain,application/x-ofx"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void loadCsvFile(file);
              e.currentTarget.value = "";
            }}
          />
          {ofxInfo ? (
            <p className="mb-3 text-sm">
              OFX account ending {ofxInfo.accountId.slice(-4)} · {ofxInfo.currency}. Verify the
              selected bank account. Bank FITIDs are preserved for duplicate detection.
            </p>
          ) : null}
          {ofxCurrencyMismatch ? (
            <p role="alert" className="mb-3 text-sm text-destructive">
              Statement currency does not match the selected bank account. Select the correct
              account.
            </p>
          ) : null}
          {fileError ? (
            <p role="alert" className="text-sm text-destructive">
              {fileError}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Bank and credit-card OFX/QFX and CSV statements are supported. QBO, QIF, PDF, investment
            statements and OFX correction records are not supported. Imported statement lines remain
            uncategorised until coded or reconciled.
          </p>
        </div>
      </section>

      {parsed && mapping ? (
        <section className="mb-6 space-y-4">
          <div className="rounded-md border p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="font-semibold">Column mapping</h2>
              <Badge variant="secondary">
                {mappingSource === "saved" ? "Saved for this account" : "Guessed from the file"}
              </Badge>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1">
                <Label className="text-xs">Delimiter</Label>
                <Select
                  value={mapping.delimiter}
                  onValueChange={(v) => patch({ delimiter: v as Delimiter })}
                >
                  <SelectTrigger aria-label="Delimiter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">
                      Auto ({parsed.delimiter === "\t" ? "tab" : parsed.delimiter})
                    </SelectItem>
                    <SelectItem value=",">Comma</SelectItem>
                    <SelectItem value=";">Semicolon</SelectItem>
                    <SelectItem value="\t">Tab</SelectItem>
                    <SelectItem value="|">Pipe</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 pt-5 text-sm">
                <Checkbox
                  checked={mapping.hasHeader}
                  onCheckedChange={(v) => patch({ hasHeader: v === true })}
                  aria-label="First row is a header"
                />
                First row is a header
              </label>
              <ColumnSelect
                label="Date"
                value={mapping.dateColumn}
                columns={columns}
                onChange={(v) => patch({ dateColumn: v ?? 0 })}
              />
              <div className="space-y-1">
                <Label className="text-xs">Date format</Label>
                <Select
                  value={mapping.dateFormat}
                  onValueChange={(v) => patch({ dateFormat: v as DateFormat })}
                >
                  {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

                  <SelectTrigger aria-label="Date format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATE_FORMATS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Description columns (joined)</Label>
                <div className="flex flex-wrap gap-2">
                  {columns.map((c, i) => (
                    <label key={i} className="flex items-center gap-1 text-xs">
                      <Checkbox
                        aria-label={`Use ${c} for description`}
                        checked={mapping.descriptionColumns.includes(i)}
                        onCheckedChange={(v) =>
                          patch({
                            descriptionColumns:
                              v === true
                                ? [...mapping.descriptionColumns, i].sort((a, b) => a - b)
                                : mapping.descriptionColumns.filter((x) => x !== i),
                          })
                        }
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </div>
              <ColumnSelect
                label="Reference"
                optional
                value={mapping.referenceColumn}
                columns={columns}
                onChange={(v) => patch({ referenceColumn: v })}
              />
              <ColumnSelect
                label="Payee"
                optional
                value={mapping.payeeColumn}
                columns={columns}
                onChange={(v) => patch({ payeeColumn: v })}
              />
              <ColumnSelect
                label="Bank transaction id"
                optional
                value={mapping.bankIdColumn}
                columns={columns}
                onChange={(v) => patch({ bankIdColumn: v })}
              />
              <ColumnSelect
                label="Running balance"
                optional
                value={mapping.balanceColumn}
                columns={columns}
                onChange={(v) => patch({ balanceColumn: v })}
              />
              <div className="space-y-1">
                <Label className="text-xs">Amounts</Label>
                <Select
                  value={mapping.amountMode}
                  onValueChange={(v) => patch({ amountMode: v as AmountMode })}
                >
                  {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

                  <SelectTrigger aria-label="Amount layout">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AMOUNT_MODES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m === "single"
                          ? "One signed column"
                          : m === "debit_credit"
                            ? "Separate debit / credit columns"
                            : "Trailing minus or CR/DR"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mapping.amountMode === "debit_credit" ? (
                <>
                  <ColumnSelect
                    label="Debit (money out)"
                    optional
                    value={mapping.debitColumn}
                    columns={columns}
                    onChange={(v) => patch({ debitColumn: v })}
                  />
                  <ColumnSelect
                    label="Credit (money in)"
                    optional
                    value={mapping.creditColumn}
                    columns={columns}
                    onChange={(v) => patch({ creditColumn: v })}
                  />
                </>
              ) : (
                <ColumnSelect
                  label="Amount"
                  value={mapping.amountColumn}
                  columns={columns}
                  onChange={(v) => patch({ amountColumn: v })}
                />
              )}
              <div className="space-y-1">
                <Label className="text-xs">Decimal separator</Label>
                <Select
                  value={mapping.decimalSeparator}
                  onValueChange={(v) => patch({ decimalSeparator: v as "." | "," })}
                >
                  <SelectTrigger aria-label="Decimal separator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value=".">Dot (1,234.56)</SelectItem>
                    <SelectItem value=",">Comma (1.234,56)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 pt-5 text-sm">
                <Checkbox
                  checked={mapping.invertSign}
                  onCheckedChange={(v) => patch({ invertSign: v === true })}
                  aria-label="Flip the sign of amounts"
                />
                Flip sign (outflows are positive)
              </label>
            </div>
            {problems.length > 0 ? (
              <ul className="mt-3 list-disc pl-5 text-sm text-destructive">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
          </div>

          {mapped ? (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{mapped.rows.length}</strong> rows ready ·{" "}
                <strong>{mapped.errors.length}</strong> with problems · amounts read in{" "}
                <strong>{currency}</strong>
                {dupQ.data ? (
                  <>
                    {" "}
                    · <strong>{dupRows.size}</strong> look like duplicates
                  </>
                ) : dupQ.isFetching ? (
                  " · checking for duplicates…"
                ) : null}
              </p>
              {dupQ.isError ? (
                <p className="text-sm text-destructive">{friendlyAuthError(dupQ.error)}</p>
              ) : null}
              {mapped.errors.length > 0 ? (
                <Alert variant="destructive">
                  <AlertTitle>Rows that cannot be imported</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-5">
                      {mapped.errors.slice(0, 8).map((e) => (
                        <li key={e.rowNumber}>
                          Row {e.rowNumber}: {e.message}
                        </li>
                      ))}
                      {mapped.errors.length > 8 ? (
                        <li>…and {mapped.errors.length - 8} more</li>
                      ) : null}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Row</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mapped.rows.slice(0, 12).map((r) => (
                    <TableRow key={r.rowNumber}>
                      <TableCell>{r.rowNumber}</TableCell>
                      <TableCell className="whitespace-nowrap">{r.txnDate}</TableCell>
                      <TableCell>{r.description}</TableCell>
                      <TableCell>{r.reference ?? ""}</TableCell>
                      <TableCell className="money">
                        {fromMinorUnits(r.amountMinor, currency)}
                      </TableCell>
                      <TableCell>
                        {dupRows.has(r.rowNumber) ? (
                          <Badge variant="outline">likely duplicate</Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {mapped.rows.length > 12 ? (
                <p className="text-xs text-muted-foreground">
                  Showing the first 12 of {mapped.rows.length} rows.
                </p>
              ) : null}
              {dupRows.size > 0 ? (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeDuplicates}
                    onCheckedChange={(v) => setIncludeDuplicates(v === true)}
                    aria-label="Import likely duplicates anyway"
                  />
                  Import the {dupRows.size} likely duplicate rows anyway (they are real, repeated
                  transactions)
                </label>
              ) : null}
              <Button size="sm" disabled={!canImport} onClick={() => mutation.mutate()}>
                {mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null} Import{" "}
                {rowsToImport} rows
              </Button>
            </div>
          ) : null}
        </section>
      ) : csvText && !bankAccountId ? (
        <p className="mb-6 text-sm text-muted-foreground">Choose the bank account to continue.</p>
      ) : null}

      <h3 className="mb-2 text-sm font-medium text-muted-foreground">Import history</h3>
      {importsQ.isPending ? (
        <LoadingState />
      ) : importsQ.isError ? (
        <ErrorState
          title="Could not load imports"
          description={friendlyAuthError(importsQ.error)}
        />
      ) : (importsQ.data ?? []).length === 0 ? (
        <EmptyState title="No imports yet" description="Upload a CSV, OFX or QFX statement." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>File</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Imported</TableHead>
              <TableHead>Skipped (already present)</TableHead>
              <TableHead>Errors</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(
              importsQ.data as Array<{
                id: string;
                created_at: string;
                filename: string;
                status: string;
                imported_count: number;
                duplicate_count: number;
                error_count: number;
                error_summary: string | null;
              }>
            ).map((i) => (
              <TableRow key={i.id}>
                <TableCell>{new Date(i.created_at).toLocaleString()}</TableCell>
                <TableCell>{i.filename}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{i.status}</Badge>
                </TableCell>
                <TableCell>{i.imported_count}</TableCell>
                <TableCell>{i.duplicate_count}</TableCell>
                <TableCell title={i.error_summary ?? undefined}>{i.error_count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}

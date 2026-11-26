"use client";

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { listAccounts, postManualJournal } from "@/lib/accounting/accounting.functions";
import { getOrganisationConfig } from "@/lib/settings/settings-centre.functions";
import { backdatedJournalWarning } from "@/lib/settings/backdated-journal-warning";
import {
  generateRecurringJournal,
  saveRecurringJournalTemplate,
} from "@/lib/create-new/money-documents.functions";
import { fromMinorUnits, toSafeMinorNumber } from "@/lib/accounting/money";
import { tryParseMinor } from "@/lib/purchases/money-input";
import { inspectManualJournal } from "@/lib/accounting/manual-journal-review";
import { importJournalLinesCsv, JOURNAL_CSV_HEADERS } from "@/lib/accounting/journal-csv-import";
import { toCsv } from "@/lib/sales/csv";
import { validateAutoReverseDate } from "@/lib/accounting/fx-reval";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  DocumentRecordPanel,
  type DocumentRecordHandle,
} from "@/components/documents/DocumentRecordPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AccountLookup } from "@/components/lookup";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { FormControlShell, FormGrid } from "@/components/common/form-layout";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EditableLineItemGrid } from "@/components/common/EditableLineItemGrid";
import { TableCell, TableRow } from "@/components/ui/table";
import { interpretLineGridKey } from "@/lib/ui/line-grid-keyboard";
import { parseLineGridClipboard } from "@/lib/ui/line-grid-paste";

type Line = { accountId: string; description: string; debit: string; credit: string };
type AccountRow = {
  id: string;
  code: string;
  name: string;
  is_postable: boolean;
  is_active: boolean;
  is_control?: boolean;
};

const emptyLine = (): Line => ({ accountId: "", description: "", debit: "", credit: "" });

export function ManualJournalPanel() {
  return <JournalLines mode="post" />;
}

export function RecurringJournalPanel() {
  return <JournalLines mode="template" />;
}

function JournalLines({ mode }: { mode: "post" | "template" }) {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";
  const today = new Date().toISOString().slice(0, 10);
  const qc = useQueryClient();
  const fetchAccounts = useServerFn(listAccounts);
  const fetchAccountingSettings = useServerFn(getOrganisationConfig);
  const post = useServerFn(postManualJournal);
  const saveTemplate = useServerFn(saveRecurringJournalTemplate);
  const generate = useServerFn(generateRecurringJournal);
  const accountsQ = useQuery({
    queryKey: ["accounts", companyId],
    enabled: Boolean(companyId),
    queryFn: () => fetchAccounts({ data: { companyId: companyId! } }),
  });
  const accountingSettingsQ = useQuery({
    queryKey: ["organisation-config", companyId, "accounting"],
    enabled: Boolean(companyId) && mode === "post",
    staleTime: 60_000,
    queryFn: () =>
      fetchAccountingSettings({ data: { companyId: companyId!, category: "accounting" } }),
  });
  const [date, setDate] = useState(today);
  const [name, setName] = useState("");
  const [memo, setMemo] = useState("");
  const [autoReverseOn, setAutoReverseOn] = useState("");
  const [lines, setLines] = useState<Line[]>(() => Array.from({ length: 5 }, () => emptyLine()));
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [intervalMonths, setIntervalMonths] = useState("1");
  const [maxOccurrences, setMaxOccurrences] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const recordRef = useRef<DocumentRecordHandle>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [importedCount, setImportedCount] = useState(0);

  const allAccounts = (accountsQ.data ?? []) as unknown as AccountRow[];
  // Control accounts (receivables, payables, tax) are written by their own documents, not by hand.
  const accounts = allAccounts.filter((a) => a.is_active && a.is_postable && !a.is_control);

  const review = inspectManualJournal(
    lines,
    currency,
    accounts.map((account) => account.id),
  );
  const totals = review;
  const balanced = review.balanced;
  const reverseError = mode === "post" ? validateAutoReverseDate(date, autoReverseOn) : null;
  const backdatedWarning =
    mode === "post"
      ? backdatedJournalWarning(
          date,
          Number(accountingSettingsQ.data?.document["warn_backdated_days"] ?? 90),
        )
      : null;
  const canSubmit =
    review.canPost &&
    !reverseError &&
    (mode === "post" || name.trim().length > 0) &&
    accountsQ.isSuccess &&
    !accountsQ.isError;

  async function handleCsvImport(file: File) {
    if (file.size > 256000) throw new Error("CSV file exceeds the 256 KB import limit.");
    if (accountsQ.isPending || accountsQ.isError) {
      throw new Error("Wait until the chart of accounts has loaded before importing.");
    }
    const parsed = importJournalLinesCsv(await file.text(), accounts, currency);
    setLines(parsed);
    setIdempotencyKey(crypto.randomUUID());
    setRecordId(null);
    setImportedCount(parsed.length);
    setError(null);
    toast.success(
      "Loaded " + parsed.length + " balanced journal lines for review. Nothing posted.",
    );
  }

  function downloadCsvTemplate() {
    const csv = toCsv([...JOURNAL_CSV_HEADERS], []);
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "streakbooks-manual-journal-import-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function updateLine(index: number, patch: Partial<Line>) {
    setLines((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function payloadLines() {
    if (!review.canPost) {
      throw new Error("Resolve invalid or unbalanced journal lines before continuing.");
    }
    return lines
      .filter((line) => line.accountId)
      .map((line) => ({
        accountId: line.accountId,
        description: line.description || memo || name,
        debitMinor: toSafeMinorNumber(tryParseMinor(line.debit, currency) ?? 0n, "Journal debit"),
        creditMinor: toSafeMinorNumber(
          tryParseMinor(line.credit, currency) ?? 0n,
          "Journal credit",
        ),
      }));
  }

  function reset() {
    setLines(Array.from({ length: 5 }, () => emptyLine()));
    setImportedCount(0);
    setMemo("");
    setName("");
    setAutoReverseOn("");
    setIdempotencyKey(crypto.randomUUID());
  }

  const saveM = useMutation({
    mutationFn: async () => {
      const journalLines = payloadLines();
      if (mode === "template") {
        return saveTemplate({
          data: {
            companyId: companyId!,
            name,
            startDate: date,
            memo,
            intervalMonths: Number(intervalMonths) || 1,
            maxOccurrences: Number(maxOccurrences) > 0 ? Number(maxOccurrences) : null,
            lines: journalLines,
          },
        });
      }
      return post({
        data: {
          companyId: companyId!,
          journalDate: date,
          memo,
          idempotencyKey,
          ...(autoReverseOn ? { autoReverseOn } : {}),
          lines: journalLines,
        },
      });
    },
    onSuccess: async (result) => {
      setError(null);
      const savedId =
        result && "posted" in result
          ? result.id
          : result && "journalId" in result
            ? result.journalId
            : null;
      if (savedId) {
        try {
          await recordRef.current?.flush(savedId);
        } catch (e) {
          setError(`Saved, but notes or files could not be stored: ${friendlyAuthError(e)}`);
        }
        setRecordId(savedId);
      }
      if (result && "posted" in result) {
        setTemplateId(result.id);
        toast.success("Template saved. Nothing was posted.");
        return;
      }
      toast.success("Journal posted");
      reset();
      await qc.invalidateQueries({ queryKey: ["journals", companyId] });
      await qc.invalidateQueries({ queryKey: ["accounts", companyId] });
    },
    onError: (e) => setError(friendlyAuthError(e)),
  });

  const generateM = useMutation({
    mutationFn: () => generate({ data: { companyId: companyId!, templateId: templateId! } }),
    onSuccess: (result) => toast.success(`Journal posted for ${result.occurrenceDate}`),
    onError: (e) => setError(friendlyAuthError(e)),
  });

  if (!companyId) return null;
  if (accountsQ.isPending) return <LoadingState />;
  if (accountsQ.isError) {
    return <QueryErrorState queries={[accountsQ]} title="Could not load chart of accounts" />;
  }

  const onLineKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    rowIndex: number,
    colIndex: number,
  ) => {
    const action = interpretLineGridKey(event.key, {
      shiftKey: event.shiftKey,
      atLastRow: rowIndex === lines.length - 1,
      atLastCol: colIndex === 3,
    });
    if (action.type === "none") return;
    if (action.type === "add-row") {
      event.preventDefault();
      setLines((current) => [...current, emptyLine()]);
      return;
    }
    if (
      action.type === "move" &&
      (event.key === "Enter" || event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      const nextRow = Math.max(0, Math.min(lines.length - 1, rowIndex + action.rowDelta));
      const selector = `[data-journal-cell="${nextRow}-${colIndex}"]`;
      const target = document.querySelector<HTMLElement>(selector);
      target?.focus();
    }
  };

  const onMoneyPaste = (
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: "debit" | "credit",
  ) => {
    const grid = parseLineGridClipboard(event.clipboardData.getData("text"));
    if (grid.length <= 1 && (grid[0]?.length ?? 0) <= 1) return;
    event.preventDefault();
    setLines((current) => {
      const next = current.map((line) => ({ ...line }));
      for (let r = 0; r < grid.length; r++) {
        const targetRow = rowIndex + r;
        while (next.length <= targetRow) next.push(emptyLine());
        const cells = grid[r] ?? [];
        if (field === "debit") {
          const debit = cells[0] ?? "";
          const credit = cells[1] ?? "";
          next[targetRow] = {
            ...next[targetRow]!,
            debit,
            credit: debit ? "" : credit || next[targetRow]!.credit,
          };
          if (!debit && credit) next[targetRow]!.debit = "";
        } else {
          const credit = cells[0] ?? "";
          next[targetRow] = {
            ...next[targetRow]!,
            credit,
            debit: credit ? "" : next[targetRow]!.debit,
          };
        }
      }
      return next;
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        if (!canSubmit) return;
        if (mode === "post") {
          const reverseText = autoReverseOn
            ? ` It will be scheduled for auto-reversal on ${autoReverseOn}.`
            : "";
          const accepted = window.confirm(
            `Post ${review.filledCount} journal lines dated ${date}? Debits ${fromMinorUnits(
              totals.debit,
              currency,
            )} ${currency}; credits ${fromMinorUnits(totals.credit, currency)} ${currency}.${reverseText}`,
          );
          if (!accepted) return;
        }
        saveM.mutate();
      }}
    >
      <TransactionWorkspace
        title={mode === "template" ? "Recurring journal template" : "Manual journal"}
        description={
          mode === "template"
            ? "Saving this template does not post a journal. Post it from the Recurring journals page (or let your scheduler run it)."
            : "Posts a balanced journal through the accounting engine. A locked period rejects the date. Receivables, payables and tax accounts are not available here: use an invoice, bill, credit note or payment."
        }
        breadcrumbs={[
          { label: "Accounting", to: "/accounting" },
          { label: mode === "template" ? "Recurring journal" : "Manual journal" },
        ]}
        meta={<StatusBadge status={recordId ? "posted" : "draft"} />}
        stickyActions={
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={!canSubmit || saveM.isPending}>
              {saveM.isPending ? "Saving…" : mode === "template" ? "Save template" : "Post journal"}
            </Button>
            {mode === "template" && templateId ? (
              <Button
                type="button"
                variant="secondary"
                disabled={generateM.isPending}
                onClick={() => generateM.mutate()}
              >
                Generate now
              </Button>
            ) : null}
          </div>
        }
        details={
          <div className="space-y-4">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <FormGrid columns={4}>
              {mode === "template" ? (
                <FormControlShell className="sm:col-span-2">
                  <Label htmlFor="journal-name">Template name</Label>
                  <Input
                    id="journal-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </FormControlShell>
              ) : null}
              <FormControlShell width="date">
                <Label htmlFor="journal-date">{mode === "template" ? "First date" : "Date"}</Label>
                <Input
                  id="journal-date"
                  type="date"
                  required
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                {backdatedWarning ? (
                  <p role="status" className="text-sm text-amber-700">
                    {backdatedWarning} This is a warning only; accounting period locks still apply.
                  </p>
                ) : null}
              </FormControlShell>
              <FormControlShell className="sm:col-span-2">
                <Label htmlFor="journal-memo">Narration</Label>
                <Input id="journal-memo" value={memo} onChange={(e) => setMemo(e.target.value)} />
              </FormControlShell>
              {mode === "post" ? (
                <FormControlShell width="date">
                  <Label htmlFor="journal-auto-reverse">Reverse automatically on (optional)</Label>
                  <Input
                    id="journal-auto-reverse"
                    type="date"
                    min={date}
                    value={autoReverseOn}
                    onChange={(e) => setAutoReverseOn(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    For accruals and prepayments. The reversal is posted when due; process it from
                    Accounting → FX &amp; reversals.
                  </p>
                  {reverseError ? <p className="text-xs text-destructive">{reverseError}</p> : null}
                </FormControlShell>
              ) : null}
              {mode === "template" ? (
                <>
                  <FormControlShell width="money">
                    <Label htmlFor="journal-interval">Repeat every (months)</Label>
                    <Input
                      id="journal-interval"
                      type="number"
                      min={1}
                      max={12}
                      value={intervalMonths}
                      onChange={(e) => setIntervalMonths(e.target.value)}
                    />
                  </FormControlShell>
                  <FormControlShell width="money">
                    <Label htmlFor="journal-max">Stop after (occurrences, optional)</Label>
                    <Input
                      id="journal-max"
                      type="number"
                      min={1}
                      value={maxOccurrences}
                      onChange={(e) => setMaxOccurrences(e.target.value)}
                    />
                  </FormControlShell>
                </>
              ) : null}
            </FormGrid>
            {mode === "post" ? (
              <section
                aria-label="Import manual journal CSV"
                className="space-y-2 rounded-md border p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="journal-csv-import">Import manual journal lines (CSV)</Label>
                  <Button type="button" size="sm" variant="outline" onClick={downloadCsvTemplate}>
                    Download CSV template
                  </Button>
                </div>
                <Input
                  id="journal-csv-import"
                  aria-label="Select journal lines CSV"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={saveM.isPending || accountsQ.isPending || accountsQ.isError}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void handleCsvImport(file).catch((e) => setError(friendlyAuthError(e)));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Columns: account_code, description, debit, credit. Imports one balanced journal
                  (2–200 lines). Uploading never posts.
                </p>
                {importedCount > 0 ? (
                  <p role="status" className="text-sm">
                    {importedCount} lines imported into this draft. Check the date, narration and
                    accounts before posting.
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        }
        lines={
          <EditableLineItemGrid
            aria-label="Journal lines"
            columns={[
              { id: "account", header: "Account", widthPx: 200, minWidthPx: 140 },
              {
                id: "description",
                header: "Description",
                widthPx: 280,
                minWidthPx: 200,
                fluid: true,
              },
              { id: "debit", header: "Debit", align: "right", widthPx: 112, minWidthPx: 88 },
              { id: "credit", header: "Credit", align: "right", widthPx: 112, minWidthPx: 88 },
              { id: "actions", header: "", widthPx: 48, minWidthPx: 40, resizable: false },
            ]}
            onAddRow={() => setLines((current) => [...current, emptyLine()])}
            addRowLabel="Add line"
          >
            {lines.map((line, index) => (
              <TableRow key={index}>
                <TableCell className="align-middle p-0">
                  <AccountLookup
                    ariaLabel={`Line ${index + 1} account`}
                    accounts={accounts}
                    value={line.accountId}
                    onChange={(accountId) => updateLine(index, { accountId })}
                    companyId={companyId}
                    purpose="posting"
                    placeholder="Select account"
                    allowClear
                  />
                </TableCell>
                <TableCell className="align-top p-0">
                  <Textarea
                    data-journal-cell={`${index}-1`}
                    aria-label={`Line ${index + 1} description`}
                    placeholder="Description"
                    value={line.description}
                    rows={1}
                    className="lb-spreadsheet-wrap min-h-8"
                    onChange={(e) => updateLine(index, { description: e.target.value })}
                    onKeyDown={(e) => onLineKeyDown(e, index, 1)}
                  />
                </TableCell>
                <TableCell className="align-top">
                  <Input
                    data-journal-cell={`${index}-2`}
                    aria-label={`Line ${index + 1} debit`}
                    className="text-right"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={line.debit}
                    onChange={(e) =>
                      updateLine(index, {
                        debit: e.target.value,
                        credit: e.target.value ? "" : line.credit,
                      })
                    }
                    onKeyDown={(e) => onLineKeyDown(e, index, 2)}
                    onPaste={(e) => onMoneyPaste(e, index, "debit")}
                  />
                </TableCell>
                <TableCell className="align-top">
                  <Input
                    data-journal-cell={`${index}-3`}
                    aria-label={`Line ${index + 1} credit`}
                    className="text-right"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={line.credit}
                    onChange={(e) =>
                      updateLine(index, {
                        credit: e.target.value,
                        debit: e.target.value ? "" : line.debit,
                      })
                    }
                    onKeyDown={(e) => onLineKeyDown(e, index, 3)}
                    onPaste={(e) => onMoneyPaste(e, index, "credit")}
                  />
                </TableCell>
                <TableCell className="align-top">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove line ${index + 1}`}
                    disabled={lines.length <= 2}
                    onClick={() => setLines((current) => current.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </EditableLineItemGrid>
        }
        totals={
          <div className="space-y-2">
            <TotalsSummary
              lines={[
                {
                  id: "debit",
                  label: "Debits",
                  value: fromMinorUnits(totals.debit, currency),
                },
                {
                  id: "credit",
                  label: "Credits",
                  value: fromMinorUnits(totals.credit, currency),
                },
                {
                  id: "balance",
                  label: balanced ? "Balance" : "Out of balance",
                  value: balanced
                    ? "Balanced"
                    : fromMinorUnits(
                        totals.difference < 0n ? -totals.difference : totals.difference,
                        currency,
                      ),
                  emphasis: balanced ? "total" : "muted",
                },
              ]}
            />
            {balanced ? (
              <Badge variant="secondary">Balanced</Badge>
            ) : (
              <Badge variant="destructive">Out of balance</Badge>
            )}
            {review.invalidLines.length > 0 ? (
              <p role="alert" className="text-sm text-destructive">
                Review line{review.invalidLines.length === 1 ? "" : "s"}{" "}
                {review.invalidLines.join(", ")}: select an eligible account and enter one valid,
                non-negative debit or credit within the supported amount limits.
              </p>
            ) : null}
          </div>
        }
        support={
          <DocumentRecordPanel
            ref={recordRef}
            entityType={mode === "template" ? "recurring_journal" : "journal"}
            entityId={recordId}
            audience="internal"
          />
        }
      />
    </form>
  );
}

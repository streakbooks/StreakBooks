"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listAccounts, postManualJournal } from "@/lib/accounting/accounting.functions";
import {
  journalBatchFingerprint,
  journalBatchIdempotencyKey,
  MULTI_JOURNAL_CSV_HEADERS,
  previewMultiJournalCsv,
  type PreviewedManualJournal,
} from "@/lib/accounting/multi-journal-csv";
import { toMinorUnits } from "@/lib/accounting/money";
import { toCsv } from "@/lib/sales/csv";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type PostingResult = { state: "posted" | "failed"; message: string };

export function BulkJournalImportPanel({
  companyId,
  currency,
}: {
  companyId: string;
  currency: string;
}) {
  const canPost = useCanDo("journals.manual");
  const fmt = useFormat();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [preview, setPreview] = useState<PreviewedManualJournal[]>([]);
  const [fingerprint, setFingerprint] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, PostingResult>>({});
  const [error, setError] = useState("");
  const completed = useRef(new Set<string>());
  const fetchAccounts = useServerFn(listAccounts);
  const postJournal = useServerFn(postManualJournal);
  const accountsQ = useQuery({
    queryKey: ["accounts", companyId],
    enabled: expanded && canPost,
    queryFn: () => fetchAccounts({ data: { companyId } }),
  });

  const downloadTemplate = () => {
    const csv = toCsv([...MULTI_JOURNAL_CSV_HEADERS], []);
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "streakbooks-multiple-manual-journals.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    if (file.size > 256000) throw new Error("CSV exceeds the 256 KB import limit.");
    if (accountsQ.isPending || accountsQ.isError || !accountsQ.data) {
      throw new Error("Load the current chart of accounts before importing.");
    }
    const text = await file.text();
    // Fail closed: keep existing preview unchanged if the replacement is invalid.
    const journals = previewMultiJournalCsv(text, accountsQ.data, currency);
    const hash = await journalBatchFingerprint(companyId, text);
    completed.current = new Set<string>();
    setPreview(journals);
    setFingerprint(hash);
    setResults({});
    setSelected(Object.fromEntries(journals.map((journal) => [journal.key, true])));
    setError("");
    toast.success(journals.length + " balanced journals staged for review. Nothing has posted.");
  };

  const posting = useMutation({
    mutationFn: async () => {
      if (!canPost || !fingerprint) throw new Error("Review and upload a valid batch first.");
      const toPost = preview.filter(
        (journal) => selected[journal.key] && !completed.current.has(journal.key),
      );
      let successes = 0;
      let failures = 0;
      for (const journal of toPost) {
        // The index is stable and never changes if selected rows change after a partial run.
        const index = preview.findIndex((candidate) => candidate.key === journal.key);
        try {
          const result = await postJournal({
            data: {
              companyId,
              journalDate: journal.date,
              memo: journal.memo,
              idempotencyKey: journalBatchIdempotencyKey(fingerprint, index),
              lines: journal.lines.map((line) => ({
                accountId: line.accountId,
                description: line.description,
                debitMinor: Number(toMinorUnits(line.debit, currency)),
                creditMinor: Number(toMinorUnits(line.credit, currency)),
              })),
            },
          });
          const id = result.journalId;
          completed.current.add(journal.key);
          setResults((current) => ({
            ...current,
            [journal.key]: { state: "posted", message: "Journal " + id },
          }));
          successes += 1;
        } catch (cause) {
          setResults((current) => ({
            ...current,
            [journal.key]: { state: "failed", message: friendlyAuthError(cause) },
          }));
          failures += 1;
        }
      }
      return { successes, failures };
    },
    onSuccess: async (result) => {
      if (result.successes) {
        await qc.invalidateQueries({ queryKey: ["journals", companyId] });
        await qc.invalidateQueries({ queryKey: ["accountant-journal-quality", companyId] });
        await qc.invalidateQueries({ queryKey: ["account-workpapers-trial", companyId] });
      }
      if (result.failures)
        toast.error(result.failures + " journals were not posted. Review the errors.");
      if (result.successes) toast.success(result.successes + " journals successfully posted.");
    },
    onError: (cause) => setError(friendlyAuthError(cause)),
  });

  const pending = preview.filter(
    (journal) => selected[journal.key] && !completed.current.has(journal.key),
  );
  const confirmPosting = () => {
    if (!pending.length || posting.isPending) return;
    if (
      !window.confirm(
        "Post " +
          pending.length +
          " selected manual journals to the live ledger? " +
          "This is NOT a dry run. Each journal is posted separately; failures do not roll back successful entries. " +
          "Locked periods and organisation permissions will be checked by the posting engine.",
      )
    )
      return;
    posting.mutate();
  };

  if (!canPost) return null;

  return (
    <section
      className="rounded-lg border p-4"
      aria-label="Controlled multiple manual journal import"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Controlled multiple-journal import</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Validate up to 25 manual journals and 200 lines from CSV, preview every posting, then
            explicitly confirm selected journals. No automatic posting on upload.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? (
            <ChevronDown className="mr-1 size-4" />
          ) : (
            <ChevronRight className="mr-1 size-4" />
          )}
          {expanded ? "Hide import" : "Import journals"}
        </Button>
      </div>
      {expanded ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button size="sm" type="button" variant="outline" onClick={downloadTemplate}>
              Download multi-journal CSV template
            </Button>
            <Input
              aria-label="Choose multiple journal CSV"
              type="file"
              accept=".csv,text/csv"
              className="max-w-sm"
              disabled={posting.isPending || accountsQ.isPending || accountsQ.isError}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file)
                  void importFile(file).catch((cause) => setError(friendlyAuthError(cause)));
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Each journal_key groups balanced debit and credit lines. Date and memo must match
            throughout the group. Control accounts, unsafe amounts, duplicate groups and invalid
            dates are rejected. Reuploading the exact same CSV uses stable idempotency keys.
          </p>
          {accountsQ.isPending ? <LoadingState /> : null}
          {accountsQ.isError ? (
            <QueryErrorState queries={[accountsQ]} title="Chart of accounts unavailable" />
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          {preview.length ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{preview.length} journals validated</Badge>
                <Badge variant="outline">{completed.current.size} confirmed posted</Badge>
                <Button
                  size="sm"
                  disabled={
                    !pending.length || posting.isPending || !accountsQ.isSuccess || accountsQ.isError
                  }
                  onClick={confirmPosting}
                >
                  {posting.isPending
                    ? "Posting selected journals…"
                    : "Confirm and post selected (" + pending.length + ")"}
                </Button>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Select</TableHead>
                      <TableHead>Journal key / date</TableHead>
                      <TableHead>Narration</TableHead>
                      <TableHead className="text-right">Balanced debit</TableHead>
                      <TableHead>Posting result</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((journal) => {
                      const result = results[journal.key];
                      const posted = completed.current.has(journal.key);
                      return (
                        <TableRow key={journal.key}>
                          <TableCell>
                            <input
                              aria-label={"Select journal " + journal.key}
                              type="checkbox"
                              checked={posted || Boolean(selected[journal.key])}
                              disabled={posted || posting.isPending}
                              onChange={(event) =>
                                setSelected((current) => ({
                                  ...current,
                                  [journal.key]: event.target.checked,
                                }))
                              }
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <strong>{journal.key}</strong>
                            <div className="text-xs text-muted-foreground">
                              {journal.date} · {journal.lines.length} lines
                            </div>
                          </TableCell>
                          <TableCell>{journal.memo}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {fmt.amount(Number(journal.totalMinor), currency)}
                          </TableCell>
                          <TableCell>
                            {result?.state === "posted" ? (
                              <Badge variant="secondary">Posted</Badge>
                            ) : result?.state === "failed" ? (
                              <p role="alert" className="text-xs text-destructive">
                                {result.message}
                              </p>
                            ) : (
                              <Badge variant="outline">Awaiting confirmation</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <p className="text-xs text-muted-foreground">
                Every journal posts through the existing permission-checked accounting engine.
                Partial failures are shown per journal; successful journals are not retried. Posting
                is not a multi-journal atomic transaction and is not an approval workflow.
              </p>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

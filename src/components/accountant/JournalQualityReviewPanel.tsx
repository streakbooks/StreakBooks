import { useState } from "react";
import { format, subDays } from "date-fns";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { scanManualJournalQuality } from "@/lib/accountant/journal-quality.functions";
import { listAccountantExceptionReviews } from "@/lib/accountant/exception-reviews.functions";
import { JournalExceptionReviewDetails } from "@/components/accountant/JournalExceptionReviewDetails";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { toCsv } from "@/lib/sales/csv";
import { LoadingState, ErrorState } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function JournalQualityReviewPanel({ companyId }: { companyId: string }) {
  const scan = useServerFn(scanManualJournalQuality);
  const fetchReviews = useServerFn(listAccountantExceptionReviews);
  const [expanded, setExpanded] = useState(false);
  const [selectedFindingId, setSelectedFindingId] = useState("");
  const [from, setFrom] = useState(() => format(subDays(new Date(), 90), "yyyy-MM-dd"));
  const [to, setTo] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const datesValid = Boolean(from && to && from <= to);
  const query = useQuery({
    queryKey: ["accountant-journal-quality", companyId, from, to],
    queryFn: () => scan({ data: { companyId, from, to } }),
    enabled: expanded && datesValid,
    staleTime: 30_000,
  });

  const journalIds = Array.from(
    new Set((query.data?.findings ?? []).map((finding) => finding.journalId)),
  );
  const reviews = useQuery({
    queryKey: ["accountant-exception-reviews", companyId, journalIds],
    enabled: expanded && datesValid && journalIds.length > 0,
    queryFn: () => fetchReviews({ data: { companyId, journalIds } }),
  });
  const reviewByKey = new Map((reviews.data ?? []).map((record) => [record.finding_key, record]));
  const selectedFinding = query.data?.findings.find((finding) => finding.id === selectedFindingId);

  const exportCsv = () => {
    if (!query.data) return;
    const csv = toCsv(
      ["Journal", "Posting date", "Severity", "Finding", "Reason", "Related journal", "Review status"],
      query.data.findings.map((finding) => [
        finding.journalNumber,
        finding.journalDate,
        finding.severity,
        finding.kind,
        finding.reason,
        finding.relatedJournalNumber ?? "",
        reviewByKey.get(finding.id)?.status ?? "untracked",
      ]),
    );
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "linkbooks-manual-journal-quality.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-label="Manual journal quality review" className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Manual journal quality review</h2>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Identify possible duplicate postings, missing narrations and ledger-line exceptions.
            Record investigation notes with independent review. Findings never change posted journals.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <ChevronDown className="mr-1 size-4" />
          ) : (
            <ChevronRight className="mr-1 size-4" />
          )}
          {expanded ? "Hide review" : "Review journals"}
        </Button>
      </div>
      {expanded ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              From
              <Input
                aria-label="Quality review from"
                type="date"
                className="mt-1 w-44"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="text-sm">
              To
              <Input
                aria-label="Quality review to"
                type="date"
                className="mt-1 w-44"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={!datesValid || query.isFetching}
              onClick={() => void query.refetch()}
            >
              Refresh scan
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!query.data?.findings.length}
              onClick={exportCsv}
            >
              Export findings CSV
            </Button>
          </div>
          {!datesValid ? (
            <p role="alert" className="text-sm text-destructive">
              Choose a valid date range with From on or before To.
            </p>
          ) : query.isPending ? (
            <LoadingState />
          ) : query.isError ? (
            <ErrorState
              title="Could not review manual journals"
              description={friendlyAuthError(query.error)}
              onRetry={() => void query.refetch()}
            />
          ) : query.data ? (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge variant="secondary">{query.data.scanned} journals examined</Badge>
                <Badge variant="outline">{query.data.findings.length} findings</Badge>
                {query.data.limited ? (
                  <span role="alert" className="text-amber-700 dark:text-amber-400">
                    Only the latest 500 entries in this range were scanned. Narrow the date range
                    for more complete coverage.
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">{query.data.disclaimer}</p>
              {reviews.isError ? (
                <p role="alert" className="text-sm text-destructive">
                  Review history unavailable: {friendlyAuthError(reviews.error)}
                </p>
              ) : null}
              {query.data.findings.length ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Journal</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Severity</TableHead>
                        <TableHead>Review evidence</TableHead>
                        <TableHead>Disposition</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {query.data.findings.map((finding) => (
                        <TableRow key={finding.id}>
                          <TableCell>
                            <Link
                              className="font-medium underline-offset-4 hover:underline"
                              to="/accounting"
                              search={{ tab: "journals", journal: finding.journalId }}
                            >
                              {"#" + finding.journalNumber}
                            </Link>
                          </TableCell>
                          <TableCell>{finding.journalDate}</TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                finding.severity === "critical" ? "destructive" : "secondary"
                              }
                            >
                              {finding.severity === "critical" ? (
                                <AlertTriangle className="mr-1 size-3" />
                              ) : null}
                              {finding.severity === "critical" ? "Investigate" : "Review"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <p className="max-w-xl text-sm">{finding.reason}</p>
                            {finding.relatedJournalId ? (
                              <Link
                                className="text-xs text-primary underline-offset-4 hover:underline"
                                to="/accounting"
                                search={{
                                  tab: "journals",
                                  journal: finding.relatedJournalId,
                                }}
                              >
                                {"Open matching journal #" + finding.relatedJournalNumber}
                              </Link>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-2">
                              <Badge variant="outline">
                                {reviewByKey.get(finding.id)?.status ?? "Not investigated"}
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setSelectedFindingId(finding.id)}
                              >
                                Review finding
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No exceptions found in the scanned entries. This does not certify the ledger or
                  replace period-end review.
                </p>
              )}
              {selectedFinding ? (
                <JournalExceptionReviewDetails
                  key={selectedFinding.id + ":" + (reviewByKey.get(selectedFinding.id)?.version ?? 0)}
                  companyId={companyId}
                  finding={selectedFinding}
                  record={reviewByKey.get(selectedFinding.id)}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

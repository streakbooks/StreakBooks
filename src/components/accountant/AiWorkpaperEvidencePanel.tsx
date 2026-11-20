import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, ClipboardList } from "lucide-react";
import { useCanDo } from "@/hooks/use-can";
import { getAiWorkpaperEvidence } from "@/lib/ai/workpaper-handoff.functions";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AiWorkpaperEvidencePanel({
  companyId,
  accountId,
  asOf,
  canStageReference,
  onUseReference,
}: {
  companyId: string;
  accountId: string;
  asOf: string;
  canStageReference: boolean;
  onUseReference: (reference: string) => void;
}) {
  const canAi = useCanDo("ai.use");
  const canReports = useCanDo("reports.view");
  const load = useServerFn(getAiWorkpaperEvidence);
  const [page, setPage] = useState(0);
  const permitted = canAi && canReports;
  const evidence = useQuery({
    queryKey: ["ai-accountant-workpaper-handoff", companyId, accountId, asOf, page],
    enabled: permitted && Boolean(accountId),
    queryFn: () => load({ data: { companyId, accountId, asOf, page } }),
    staleTime: 30_000,
  });

  if (!permitted) return null;
  const d = evidence.isSuccess ? evidence.data : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
          <ClipboardList className="size-4" />
          Linked AI journal reviews
          <Badge variant="outline">Supplemental evidence only</Badge>
        </CardTitle>
        <CardDescription>
          Link recorded AI evidence reviews for journals affecting this account up to {asOf}. Formal
          workpaper balance verification, preparation and sign-off remain separate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {evidence.isPending ? (
          <p role="status" className="text-sm text-muted-foreground">
            Finding linked AI reviews…
          </p>
        ) : evidence.isError ? (
          <QueryErrorState queries={[evidence]} title="Could not load linked AI reviews" />
        ) : d ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{d.pageCounts.reviewed} AI-reviewed on this page</Badge>
              <Badge variant="outline">{d.pageCounts.followUp} pending on this page</Badge>
              {d.pageCounts.notPosted > 0 ? (
                <Badge variant="destructive">
                  {d.pageCounts.notPosted} no longer posted on this page
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              {d.total} matching AI review case(s) across all pages for this account through {asOf}.
              Showing {d.links.length} result(s) on page {d.page + 1} of{" "}
              {Math.max(1, Math.ceil(d.total / d.pageSize))}. The status badges count this page
              only; they are not ledger-wide totals.
            </p>
            {d.links.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {d.total > 0
                  ? "No results on this page. Go to a previous page to see matching AI reviews."
                  : "No AI review cases link to this account through the selected date."}
                This does not establish that all ledger movements have been examined.
              </p>
            ) : (
              <div className="max-h-72 space-y-2 overflow-y-auto">
                {d.links.map((entry) => (
                  <div
                    key={entry.reviewId}
                    className="flex flex-wrap items-start justify-between gap-2 rounded-lg border p-3 text-sm"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          to="/accounting"
                          search={{ tab: "journals", journal: entry.journalId }}
                          className="font-medium text-primary underline-offset-2 hover:underline"
                        >
                          Journal #{entry.journalNumber}
                        </Link>
                        <Badge
                          variant={
                            entry.signal === "journal_not_posted" ? "destructive" : "outline"
                          }
                        >
                          {entry.signal === "journal_not_posted"
                            ? "No longer posted"
                            : entry.signal === "reviewed_evidence"
                              ? "AI evidence reviewed"
                              : "Review pending"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.journalDate} · {entry.sourceType.replaceAll("_", " ")}
                      </p>
                      <p className="text-xs text-muted-foreground">{entry.explanation}</p>
                      {entry.reviewedAt && entry.signal === "reviewed_evidence" ? (
                        <p className="text-xs text-muted-foreground">
                          AI review signed off {entry.reviewedAt.slice(0, 16).replace("T", " ")}
                        </p>
                      ) : null}
                    </div>
                    <Link
                      to="/ai-assistant"
                      search={{ reviewCase: entry.reviewId }}
                      className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Open exact AI review
                    </Link>
                    {canStageReference && entry.signal === "reviewed_evidence" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          onUseReference(
                            "AI journal evidence review " +
                              entry.reviewId +
                              " (journal #" +
                              entry.journalNumber +
                              ")",
                          )
                        }
                      >
                        Use reference
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground" aria-live="polite">
                Page {d.page + 1} / {Math.max(1, Math.ceil(d.total / d.pageSize))}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={page === 0 || evidence.isFetching}
                  onClick={() => setPage((value) => Math.max(0, value - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={(page + 1) * d.pageSize >= d.total || evidence.isFetching}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              {d.disclaimer} Using a reference fills the workpaper draft input only. It does not
              save evidence, infer a supporting balance, submit for review, or satisfy the separate
              accountant sign-off requirements.
            </p>
            <Button type="button" asChild size="sm" variant="outline">
              <Link to="/ai-assistant">Open AI Assistant review queue</Link>
            </Button>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

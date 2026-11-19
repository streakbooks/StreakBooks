import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ClipboardCopy, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getAiJournalExplanation } from "@/lib/ai/journal-explanation.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { JournalLink, SourceLink } from "@/components/reports/ReportShell";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export function AiJournalExplanationDialog({
  companyId,
  journalId,
  open,
  onOpenChange,
}: {
  companyId: string;
  journalId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const fetchExplanation = useServerFn(getAiJournalExplanation);
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const query = useQuery({
    queryKey: ["ai-posted-journal-explanation", companyId, journalId],
    queryFn: () => {
      if (!journalId) throw new Error("Select a journal to explain");
      return fetchExplanation({ data: { companyId, journalId } });
    },
    enabled: open && Boolean(journalId),
    staleTime: 30_000,
  });
  const result = query.data;
  const reviewedCount = result?.actions.filter((action) => reviewed[action.id]).length ?? 0;
  const currency = result?.journal.currency_code ?? "";

  async function copyReviewNotes() {
    if (!result) return;
    const notes = [
      result.summary,
      ...result.lines.map((line) =>
        [
          line.account_code,
          line.account_name,
          line.debit_display,
          line.credit_display,
          line.meaning,
        ].join(" | "),
      ),
      "Review items (not approvals):",
      ...result.actions.map(
        (action) =>
          (reviewed[action.id] ? "[reviewed this session] " : "[not reviewed] ") +
          action.title +
          ": " +
          action.detail,
      ),
      ...result.limitations,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(notes);
      toast.success("Read-only review notes copied");
    } catch {
      toast.error("Clipboard unavailable. Select the explanation text and copy it manually.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Explain this posted journal</DialogTitle>
          <DialogDescription>
            Account-direction explanation based on recorded journal lines, with source links and a
            session-only review checklist. No AI model, posting or approval action.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <p role="status" className="py-6 text-sm text-muted-foreground">
            Retrieving the authorised posted journal and account information…
          </p>
        ) : query.isError ? (
          <QueryErrorState queries={[query]} title="Could not explain this journal" />
        ) : result ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={result.balanced ? "secondary" : "destructive"}>
                {result.balanced ? "Debits and credits equal" : "Totals require review"}
              </Badge>
              <Badge variant="outline">{currency} journal currency</Badge>
              <span className="text-sm text-muted-foreground">{result.journal.journal_date}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <JournalLink journalId={result.journal.id} number={result.journal.journal_number} />
              <SourceLink type={result.journal.source_type} id={result.journal.source_id} />
              {result.journal.reverses_journal_id ? (
                <span className="text-xs text-muted-foreground">
                  Reversal of another journal — verify its original entry
                </span>
              ) : null}
            </div>
            <p className="text-sm leading-relaxed">{result.summary}</p>
            <p className="rounded-md bg-muted/40 p-3 text-sm">
              <strong>Recorded memo:</strong>{" "}
              {result.journal.memo?.trim() || "No journal header memo recorded."}
            </p>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account and meaning</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.lines.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className="min-w-56 text-sm">
                        <p className="font-medium">
                          {line.account_code} — {line.account_name || "Account details unavailable"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">{line.meaning}</p>
                        {line.description?.trim() ? (
                          <p className="mt-1 break-words text-xs text-muted-foreground">
                            Line description: {line.description}
                          </p>
                        ) : null}
                        {line.account_active === false ? (
                          <p className="mt-1 text-xs text-destructive">
                            Currently inactive account — review historical use
                          </p>
                        ) : null}
                        <Link
                          className="mt-1 inline-flex text-xs text-primary underline-offset-2 hover:underline"
                          to="/reports/$reportId"
                          params={{ reportId: "general-ledger" }}
                          search={{
                            account: line.account_id,
                            from: result.journal.journal_date,
                            to: result.journal.journal_date,
                            basis: "accrual",
                          }}
                        >
                          Inspect account in posted ledger
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                        {line.debit_minor === "0" ? "—" : line.debit_display}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-xs tabular-nums">
                        {line.credit_minor === "0" ? "—" : line.credit_display}
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-semibold">Recorded totals</TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs font-semibold tabular-nums">
                      {currency} {fromMinorUnits(BigInt(result.total_debit_minor), currency)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs font-semibold tabular-nums">
                      {currency} {fromMinorUnits(BigInt(result.total_credit_minor), currency)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="text-sm font-semibold">Suggested human review</h3>
                <span className="text-xs text-muted-foreground" aria-live="polite">
                  {reviewedCount}/{result.actions.length} reviewed in this session
                </span>
              </div>
              {result.actions.map((action) => (
                <div
                  key={action.id}
                  className="flex items-start gap-3 border-t pt-3 first:border-0 first:pt-0"
                >
                  <Checkbox
                    id={"ai-review-" + action.id}
                    checked={Boolean(reviewed[action.id])}
                    onCheckedChange={(value) =>
                      setReviewed((old) => ({ ...old, [action.id]: value === true }))
                    }
                    aria-label={"Mark review item: " + action.title}
                  />
                  <div className="space-y-1">
                    <label
                      htmlFor={"ai-review-" + action.id}
                      className="cursor-pointer text-sm font-medium"
                    >
                      {action.title}
                    </label>
                    <p
                      className={
                        action.severity === "review"
                          ? "text-xs text-destructive"
                          : "text-xs text-muted-foreground"
                      }
                    >
                      {action.detail}
                    </p>
                  </div>
                </div>
              ))}
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 shrink-0" />
                Checking these items only tracks this browser session. It does not record sign-off,
                change a journal, or bypass organisation approval rules.
              </p>
            </div>
            <details className="rounded-md border p-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer font-medium">
                Source limitations and assumptions
              </summary>
              <ul className="mt-2 list-inside list-disc space-y-2">
                {result.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={!result} onClick={() => void copyReviewNotes()}>
            <ClipboardCopy className="size-4" /> Copy review notes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

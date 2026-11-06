import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History, Loader2, LockKeyhole, UnlockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { useFormat } from "@/hooks/use-format";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  getBudgetRevision,
  setBudgetLock,
  type BudgetGovernanceResult,
} from "@/lib/budgets/budgets.functions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  companyId: string;
  budgetId: string;
  currency: string;
  canManage: boolean;
  dirty: boolean;
  governance: BudgetGovernanceResult | undefined;
  loading: boolean;
  error: unknown;
  onRefresh: () => void;
};

export function BudgetGovernancePanel({
  companyId,
  budgetId,
  currency,
  canManage,
  dirty,
  governance,
  loading,
  error,
  onRefresh,
}: Props) {
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const lockFn = useServerFn(setBudgetLock);
  const revisionFn = useServerFn(getBudgetRevision);
  const [reason, setReason] = useState("");
  const [selectedRevisionId, setSelectedRevisionId] = useState("");
  const [revisionPage, setRevisionPage] = useState(0);

  const locked = governance?.locked ?? false;
  const available = governance?.available === true;
  const changeLock = useMutation({
    mutationFn: () =>
      lockFn({ data: { companyId, budgetId, locked: !locked, reason: reason.trim() } }),
    onSuccess: async ({ locked: nowLocked }) => {
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["budget-governance", companyId, budgetId] }),
        queryClient.invalidateQueries({ queryKey: ["budget", companyId, budgetId] }),
        queryClient.invalidateQueries({ queryKey: ["budgets", companyId] }),
      ]);
      toast.success(nowLocked ? "Budget locked against edits" : "Budget unlocked for editing");
      onRefresh();
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const selectedRevision = useQuery({
    queryKey: ["budget-revision", companyId, budgetId, selectedRevisionId],
    enabled: Boolean(available && selectedRevisionId),
    queryFn: () =>
      revisionFn({ data: { companyId, budgetId, revisionId: selectedRevisionId } }),
  });
  const revision = selectedRevision.data;
  const lines = revision?.snapshot.lines ?? [];
  const totalPages = Math.max(1, Math.ceil(lines.length / 50));
  const visibleLines = lines.slice(revisionPage * 50, (revisionPage + 1) * 50);

  return (
    <section className="mb-5 space-y-3 rounded-lg border p-4" aria-label="Budget governance">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {locked ? <LockKeyhole className="size-4" /> : <History className="size-4" />}
            Budget governance
          </h2>
          <p className="text-sm text-muted-foreground">
            {locked
              ? "Locked: changes, imports and deletion are blocked by the database."
              : "Draft: budget amounts and details may be edited by authorised users."}
          </p>
        </div>
        {available ? (
          <span
            className="rounded-full border px-3 py-1 text-xs font-medium"
            aria-label={locked ? "Budget locked" : "Budget draft"}
          >
            {locked ? "Locked" : "Draft"}
          </span>
        ) : null}
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">Loading governance status…</p>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>
            Could not verify budget lock status: {friendlyAuthError(error)}. Reload before editing.
          </AlertDescription>
        </Alert>
      ) : !available ? (
        <Alert>
          <AlertDescription>
            Budget governance is not installed yet. Apply the database migration
            20261106173000_budget_governance_revisions.sql before enabling locking or revision
            history.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {governance.changedAt ? (
            <p className="text-xs text-muted-foreground">
              Last lock change: {fmt.dateTime(governance.changedAt)}
              {governance.reason ? ` · Reason: ${governance.reason}` : ""}
            </p>
          ) : null}
          {canManage ? (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1 space-y-1">
                <Label htmlFor="budget-governance-reason">
                  Reason for {locked ? "unlocking" : "locking"}
                </Label>
                <Textarea
                  id="budget-governance-reason"
                  value={reason}
                  rows={2}
                  maxLength={500}
                  disabled={changeLock.isPending}
                  placeholder={
                    locked
                      ? "Why does this budget need further changes?"
                      : "E.g. Approved FY plan, no further edits permitted"
                  }
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
              <Button
                size="sm"
                variant={locked ? "outline" : "default"}
                disabled={
                  dirty ||
                  changeLock.isPending ||
                  loading ||
                  reason.trim().length < 3 ||
                  reason.trim().length > 500
                }
                title={dirty ? "Save or discard unsaved edits before changing lock status" : undefined}
                onClick={() => {
                  const action = locked ? "unlock" : "lock";
                  if (window.confirm(`Are you sure you want to ${action} this budget?`)) {
                    changeLock.mutate();
                  }
                }}
              >
                {changeLock.isPending ? (
                  <Loader2 className="mr-2 size-4 animate-spin" />
                ) : locked ? (
                  <UnlockKeyhole className="mr-2 size-4" />
                ) : (
                  <LockKeyhole className="mr-2 size-4" />
                )}
                {locked ? "Unlock budget" : "Lock budget"}
              </Button>
              {dirty ? (
                <p className="w-full text-xs text-muted-foreground">
                  Save or discard unsaved changes before changing the lock.
                </p>
              ) : null}
            </div>
          ) : null}
          <details className="rounded-md border px-3 py-2">
            <summary className="cursor-pointer font-medium">
              Revision history ({governance.revisions.length}
              {governance.revisions.length === 50 ? "+" : ""} most recent)
            </summary>
            {governance.revisions.length === 0 ? (
              <p className="py-3 text-sm text-muted-foreground">No revisions recorded yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Version</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Saved at</TableHead>
                      <TableHead className="text-right">Amount lines</TableHead>
                      <TableHead className="text-right">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {governance.revisions.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>v{entry.version}</TableCell>
                        <TableCell className="capitalize">{entry.action}</TableCell>
                        <TableCell>{fmt.dateTime(entry.recorded_at)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {entry.line_count}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`View budget revision ${entry.version}`}
                            onClick={() => {
                              setRevisionPage(0);
                              setSelectedRevisionId((current) =>
                                current === entry.id ? "" : entry.id,
                              );
                            }}
                          >
                            {selectedRevisionId === entry.id ? "Hide" : "View"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {selectedRevisionId ? (
              <div className="mt-3 space-y-2 rounded-md bg-muted/40 p-3">
                {selectedRevision.isPending ? (
                  <p className="text-sm">Loading stored revision…</p>
                ) : selectedRevision.isError ? (
                  <Alert variant="destructive">
                    <AlertDescription>{friendlyAuthError(selectedRevision.error)}</AlertDescription>
                  </Alert>
                ) : revision ? (
                  <>
                    <p className="text-sm font-semibold">
                      Version {revision.version}: {revision.snapshot.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      FY from {fmt.date(revision.snapshot.fiscal_year_start)}
                      {" · "}Status: {revision.snapshot.locked ? "Locked" : "Draft"}
                      {revision.snapshot.notes ? ` · Notes: ${revision.snapshot.notes}` : ""}
                    </p>
                    {revision.snapshot.lines.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No saved amount lines.</p>
                    ) : (
                      <>
                        <div className="max-h-72 overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Account</TableHead>
                                <TableHead>Month</TableHead>
                                <TableHead className="text-right">Saved amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {visibleLines.map((line, i) => (
                                <TableRow
                                  key={`${line.account_id}-${line.period_month}-${i}`}
                                >
                                  <TableCell>
                                    {line.account_code || line.account_id}
                                    {line.account_name ? ` · ${line.account_name}` : ""}
                                  </TableCell>
                                  <TableCell>{fmt.date(line.period_month)}</TableCell>
                                  <TableCell className="text-right tabular-nums">
                                    {fmt.amount(line.amount_minor, currency)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-muted-foreground">
                            Page {revisionPage + 1} of {totalPages}
                          </p>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={revisionPage === 0}
                              onClick={() => setRevisionPage((page) => page - 1)}
                            >
                              Previous
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={revisionPage + 1 >= totalPages}
                              onClick={() => setRevisionPage((page) => page + 1)}
                            >
                              Next
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </>
                ) : null}
              </div>
            ) : null}
          </details>
        </>
      )}
    </section>
  );
}

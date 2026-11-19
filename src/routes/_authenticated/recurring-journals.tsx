import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import {
  listRecurringJournals,
  runDueRecurringJournals,
  setRecurringJournalActive,
  updateRecurringJournalSchedule,
  type RecurringJournalRow,
} from "@/lib/create-new/recurring-journals.functions";
import { generateRecurringJournal } from "@/lib/create-new/money-documents.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState, EmptyState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/recurring-journals")({
  head: () => ({ meta: [{ title: "Recurring journals — LinkBooks" }] }),
  component: RecurringJournalsPage,
});

function everyLabel(months: number) {
  if (months === 1) return "Monthly";
  if (months === 3) return "Quarterly";
  if (months === 12) return "Yearly";
  return `Every ${months} months`;
}

function RecurringJournalsPage() {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";
  const qc = useQueryClient();
  const canEdit = useCanDo("journals.manual");
  const canPostToLedger = useCanDo("accounting.post");
  const canPost = canEdit && canPostToLedger;
  const [editing, setEditing] = useState<{
    companyId: string;
    row: RecurringJournalRow;
    trigger: HTMLButtonElement;
  }>();
  const currentEdit = canEdit && editing?.companyId === companyId ? editing : undefined;
  const list = useServerFn(listRecurringJournals);
  const runDue = useServerFn(runDueRecurringJournals);
  const postNow = useServerFn(generateRecurringJournal);
  const setActive = useServerFn(setRecurringJournalActive);

  const query = useQuery({
    queryKey: ["recurring-journals", companyId],
    enabled: Boolean(companyId),
    queryFn: () => list({ data: { companyId: companyId! } }),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["recurring-journals", companyId] });

  const runMutation = useMutation({
    mutationFn: () => runDue({ data: { companyId: companyId! } }),
    onSuccess: async (r) => {
      await refresh();
      await qc.invalidateQueries({ queryKey: ["journals", companyId] });
      if (r.failed.length > 0) {
        toast.error(`${r.posted} posted, ${r.failed.length} failed: ${r.failed[0]!.message}`);
      } else {
        toast.success(r.posted === 0 ? "Nothing is due" : `${r.posted} journal(s) posted`);
      }
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const nowMutation = useMutation({
    mutationFn: (templateId: string) => postNow({ data: { companyId: companyId!, templateId } }),
    onSuccess: async (r) => {
      await refresh();
      toast.success(`Journal posted for ${r.occurrenceDate}`);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const activeMutation = useMutation({
    mutationFn: (v: { templateId: string; active: boolean }) =>
      setActive({ data: { companyId: companyId!, ...v } }),
    onSuccess: refresh,
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  const rows = (query.data ?? []) as RecurringJournalRow[];
  const today = new Date().toISOString().slice(0, 10);
  const dueCount = rows.filter((r) => r.is_active && r.next_date <= today).length;

  return (
    <ListWorkspace
      title="Recurring journals"
      description="Manual journals that repeat on a schedule (rent, depreciation, accruals)."
      actions={
        <div className="flex gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/accounting">Accounting</Link>
          </Button>
          {canEdit ? (
            <Button size="sm" asChild>
              <Link to="/accounting/journals/new" search={{ mode: "template" }}>
                New recurring journal
              </Link>
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={!canPost || runMutation.isPending || dueCount === 0}
            onClick={() => runMutation.mutate()}
          >
            {runMutation.isPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
            Run due now{dueCount > 0 ? ` (${dueCount})` : ""}
          </Button>
        </div>
      }
    >
      <Alert className="mb-4">
        <AlertTitle>Scheduling</AlertTitle>
        <AlertDescription>
          Journals are only posted when you press “Run due now” or when a scheduler calls the
          database function <code>process_all_due_recurring_journals</code> (daily via pg_cron or
          the cron endpoint). Nothing runs on its own until a scheduler is enabled. Every occurrence
          posts through the normal posting engine and cannot post twice.
        </AlertDescription>
      </Alert>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load recurring journals" />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No recurring journals"
          description="Create a recurring journal template to schedule rent, depreciation, or accruals."
          action={
            canEdit ? (
              <Button size="sm" asChild>
                <Link to="/accounting/journals/new" search={{ mode: "template" }}>
                  New recurring journal
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Repeats</TableHead>
              <TableHead>Next date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Posted</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.name}</div>
                  {r.last_error ? (
                    <div className="text-xs text-destructive">Last run failed: {r.last_error}</div>
                  ) : null}
                </TableCell>
                <TableCell>{everyLabel(r.interval_months)}</TableCell>
                <TableCell>
                  {r.next_date}
                  {r.is_active && r.next_date <= today ? (
                    <Badge variant="outline" className="ml-2">
                      Due
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  {fromMinorUnits(BigInt(r.total_debit_minor), currency)}
                </TableCell>
                <TableCell>
                  {r.occurrences}
                  {r.max_occurrences ? ` / ${r.max_occurrences}` : ""}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{r.is_active ? "Active" : "Paused / ended"}</Badge>
                </TableCell>
                <TableCell className="space-x-2 text-right">
                  {canEdit ? (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`Edit schedule for ${r.name}`}
                      onClick={(event) =>
                        setEditing({ companyId, row: r, trigger: event.currentTarget })
                      }
                    >
                      Edit schedule
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!canPost || !r.is_active || nowMutation.isPending}
                    onClick={() => nowMutation.mutate(r.id)}
                  >
                    Post next now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!canEdit || activeMutation.isPending}
                    onClick={() =>
                      activeMutation.mutate({ templateId: r.id, active: !r.is_active })
                    }
                  >
                    {r.is_active ? "Pause" : "Resume"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {currentEdit ? (
        <EditScheduleDialog
          key={`${currentEdit.companyId}:${currentEdit.row.id}`}
          companyId={currentEdit.companyId}
          row={currentEdit.row}
          trigger={currentEdit.trigger}
          onClose={() => setEditing(undefined)}
        />
      ) : null}
    </ListWorkspace>
  );
}

function EditScheduleDialog({
  companyId,
  row,
  trigger,
  onClose,
}: {
  companyId: string;
  row: RecurringJournalRow;
  trigger: HTMLButtonElement;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const updateSchedule = useServerFn(updateRecurringJournalSchedule);
  const [name, setName] = useState(row.name);
  const [interval, setInterval] = useState(String(row.interval_months));
  const [endDate, setEndDate] = useState(row.end_date ?? "");
  const [limit, setLimit] = useState(row.max_occurrences?.toString() ?? "");
  const save = useMutation({
    mutationFn: () =>
      updateSchedule({
        data: {
          companyId,
          templateId: row.id,
          expectedUpdatedAt: row.updated_at,
          name,
          intervalMonths: Number(interval),
          endDate: endDate || null,
          maxOccurrences: limit === "" ? null : Number(limit),
        },
      }),
    onError: () => queryClient.invalidateQueries({ queryKey: ["recurring-journals", companyId] }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurring-journals", companyId] });
      toast.success("Schedule updated");
      onClose();
    },
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
    >
      <DialogContent
        closeDisabled={save.isPending}
        onCloseAutoFocus={(event) => {
          if (trigger.isConnected) {
            event.preventDefault();
            trigger.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Edit recurring journal schedule</DialogTitle>
          <DialogDescription>
            The next scheduled date is {row.next_date}. The updated interval applies after that
            occurrence. The posting limit includes occurrences already posted.
          </DialogDescription>
        </DialogHeader>
        <p role="status" className="sr-only">
          {save.isPending ? "Saving schedule…" : ""}
        </p>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!save.isPending && name.trim()) save.mutate();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="recurring-schedule-name">Name</Label>
            <Input
              id="recurring-schedule-name"
              readOnly={save.isPending}
              required
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="recurring-schedule-interval">Repeat every (months)</Label>
            <Input
              id="recurring-schedule-interval"
              readOnly={save.isPending}
              type="number"
              required
              min={1}
              max={12}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="recurring-schedule-end">End date (optional)</Label>
            <Input
              id="recurring-schedule-end"
              readOnly={save.isPending}
              type="date"
              min={row.start_date}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="recurring-schedule-limit">Total posting limit (optional)</Label>
            <Input
              id="recurring-schedule-limit"
              readOnly={save.isPending}
              type="number"
              min={1}
              max={2147483647}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
            />
          </div>
          {save.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {friendlyAuthError(save.error)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || !name.trim()}>
              {save.isPending ? "Saving…" : "Save schedule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

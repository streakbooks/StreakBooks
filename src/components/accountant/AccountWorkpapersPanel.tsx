import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";

import {
  listAccountWorkpapers,
  listWorkpaperLedger,
  saveAccountWorkpaper,
} from "@/lib/accountant/workpapers.functions";
import {
  signedWorkpaperLedger,
  workpaperReviewState,
  WORKPAPER_STATE_LABELS,
} from "@/lib/accountant/workpapers";
import { fromMinorUnits, toMinorUnits } from "@/lib/accounting/money";
import { toCsv } from "@/lib/sales/csv";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type BalanceRow = {
  account_id: string;
  code: string;
  name: string;
  account_type: string;
  debit_minor: number;
  credit_minor: number;
};

export function AccountWorkpapersPanel({
  companyId,
  currency,
}: {
  companyId: string;
  currency: string;
}) {
  const canManage = useCanDo("accounting.post");
  const fmt = useFormat();
  const qc = useQueryClient();
  const fetchTrial = useServerFn(listWorkpaperLedger);
  const fetchPapers = useServerFn(listAccountWorkpapers);
  const submit = useServerFn(saveAccountWorkpaper);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [supporting, setSupporting] = useState("");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const trial = useQuery({
    queryKey: ["account-workpapers-trial", companyId, asOf],
    queryFn: () => fetchTrial({ data: { companyId, asOf } }),
  });
  const papers = useQuery({
    queryKey: ["account-workpapers", companyId, asOf],
    queryFn: () => fetchPapers({ data: { companyId, asOf } }),
  });
  const byAccount = new Map((papers.data ?? []).map((paper) => [paper.account_id, paper]));
  const rows = ((trial.data?.rows ?? []) as BalanceRow[])
    .filter((row) => ["asset", "liability", "equity"].includes(row.account_type))
    .map((row) => {
      let live: number | null = null;
      try {
        live = signedWorkpaperLedger(row.debit_minor, row.credit_minor);
      } catch {
        // Never sign off an amount that cannot be represented exactly.
      }
      return { ...row, live, paper: byAccount.get(row.account_id) };
    });
  const visible = rows.filter((row) =>
    (row.code + " " + row.name).toLowerCase().includes(search.trim().toLowerCase()),
  );
  const selected = rows.find((row) => row.account_id === selectedId);
  const saved = selected?.paper;
  const state =
    selected?.live == null ? "stale" : workpaperReviewState(saved, selected.live);
  const mutation = useMutation({
    mutationFn: (action: "save" | "prepare" | "review" | "reopen") => {
      if (!selected || selected.live === null) {
        throw new Error("Select an account with a valid ledger balance.");
      }
      const minor =
        supporting.trim() === "" ? null : toMinorUnits(supporting, currency).toString();
      return submit({
        data: {
          companyId,
          payload: {
            action,
            accountId: selected.account_id,
            asOf,
            ledgerBalanceMinor: String(selected.live),
            ...(saved ? { id: saved.id, version: saved.version } : {}),
            ...(action === "save"
              ? { supportingBalanceMinor: minor, evidenceReference: reference, note }
              : action === "reopen"
                ? { note }
                : {}),
          },
        },
      });
    },
    onSuccess: async (_, action) => {
      await qc.invalidateQueries({ queryKey: ["account-workpapers", companyId, asOf] });
      toast.success(
        action === "save"
          ? "Workpaper saved"
          : action === "prepare"
            ? "Submitted for review"
            : action === "review"
              ? "Workpaper reviewed"
              : "Workpaper reopened",
      );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const choose = (id: string) => {
    setSelectedId(id);
    const paper = byAccount.get(id);
    setSupporting(
      paper?.supporting_balance_minor == null
        ? ""
        : fromMinorUnits(paper.supporting_balance_minor, currency),
    );
    setReference(paper?.evidence_reference ?? "");
    setNote(paper?.note ?? "");
  };

  const exportCsv = () => {
    const csv = toCsv(
      [
        "Code", "Account", "As of", "GL minor", "Evidence minor",
        "Difference minor", "Status", "Evidence reference", "Reviewer ID",
      ],
      visible.map((row) => {
        const paper = row.paper;
        return [
          row.code,
          row.name,
          asOf,
          row.live,
          paper?.supporting_balance_minor,
          row.live != null && paper?.supporting_balance_minor != null
            ? row.live - paper.supporting_balance_minor
            : null,
          row.live == null
            ? "Unsafe balance"
            : WORKPAPER_STATE_LABELS[workpaperReviewState(paper, row.live)],
          paper?.evidence_reference,
          paper?.reviewed_by,
        ];
      }),
    );
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "linkbooks-account-workpapers-" + asOf + ".csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (trial.isPending || papers.isPending) return <LoadingState />;
  if (trial.isError) {
    return <ErrorState title="Trial balance unavailable" description={friendlyAuthError(trial.error)} />;
  }
  if (papers.isError) {
    return <ErrorState title="Workpaper register unavailable" description={friendlyAuthError(papers.error)} />;
  }
  const reviewed = rows.filter(
    (row) => row.live !== null && workpaperReviewState(row.paper, row.live) === "reviewed",
  ).length;
  const ready = rows.filter(
    (row) => row.live !== null && workpaperReviewState(row.paper, row.live) === "prepared",
  ).length;

  return (
    <section className="space-y-5" aria-label="Balance-sheet account workpapers">
      <div>
        <h2 className="text-lg font-semibold">Balance-sheet workpapers</h2>
        <p className="text-sm text-muted-foreground">
          Reconcile live ledger balances to supporting evidence and obtain independent sign-off.
          Later postings automatically flag stale approvals.
        </p>
      </div>
      <Alert>
        <AlertDescription>
          Workpapers do not post journals, reconcile bank statements or file returns.
          Signed base-currency balances use positive debits and negative credits.
          Evidence references identify external schedules; they are not file attachments.
        </AlertDescription>
      </Alert>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          Review date
          <Input
            aria-label="Workpaper review date"
            type="date"
            value={asOf}
            onChange={(event) => {
              setAsOf(event.target.value);
              setSelectedId("");
            }}
          />
        </label>
        <label className="space-y-1 text-sm">
          Search accounts
          <Input
            aria-label="Search workpaper accounts"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <Button variant="outline" onClick={exportCsv}>Export CSV</Button>
        <Button variant="outline" asChild><Link to="/reports">Reports</Link></Button>
      </div>
      <p className="text-sm text-muted-foreground">
        {reviewed} independently reviewed · {ready} awaiting review ·{" "}
        {rows.length - reviewed - ready} needing attention
      </p>
      {rows.length === 0 ? (
        <EmptyState
          title="No posted balance-sheet accounts"
          description="Post balance-sheet activity to start a ledger-linked workpaper."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">GL balance</TableHead>
                <TableHead className="text-right">Difference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row) => {
                const review =
                  row.live === null ? "stale" : workpaperReviewState(row.paper, row.live);
                return (
                  <TableRow key={row.account_id}>
                    <TableCell>
                      <strong>{row.code}</strong> {row.name}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.live === null ? "Unsupported" : fmt.money(row.live)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.live !== null && row.paper?.supporting_balance_minor != null
                        ? fmt.money(row.live - row.paper.supporting_balance_minor)
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={review === "stale" || review === "difference" ? "destructive" : "secondary"}>
                        {WORKPAPER_STATE_LABELS[review]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={row.live === null}
                        onClick={() => choose(row.account_id)}
                      >
                        {selectedId === row.account_id ? "Selected" : "Open"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      {selected && selected.live !== null && (
        <div className="space-y-3 rounded-xl border p-4">
          <h3 className="font-semibold">{selected.code} — {selected.name}</h3>
          <p className="text-sm">
            Posted ledger: <strong>{fmt.money(selected.live)}</strong> ·{" "}
            {WORKPAPER_STATE_LABELS[state]}
          </p>
          {state === "stale" && (
            <p role="alert" className="text-sm text-destructive">
              The ledger changed. Reopen and reprepare before review.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Supporting balance ({currency})</Label>
              <Input
                aria-label="Supporting balance"
                value={supporting}
                disabled={!canManage || Boolean(saved && saved.status !== "draft")}
                onChange={(event) => setSupporting(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Evidence reference</Label>
              <Input
                aria-label="Evidence reference"
                value={reference}
                disabled={!canManage || Boolean(saved && saved.status !== "draft")}
                onChange={(event) => setReference(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Evidence notes / reopening reason</Label>
            <Textarea
              aria-label="Workpaper evidence note"
              value={note}
              disabled={!canManage}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          {saved?.prepared_by && (
            <p className="text-xs text-muted-foreground">
              Prepared by {saved.prepared_by.slice(0, 8)}… · Reviewed by{" "}
              {saved.reviewed_by?.slice(0, 8) ?? "pending"}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!canManage || mutation.isPending || Boolean(saved && saved.status !== "draft")}
              onClick={() => mutation.mutate("save")}
            >
              Save evidence
            </Button>
            {saved?.status === "draft" && (
              <Button
                variant="outline"
                disabled={!canManage || mutation.isPending || state !== "draft" || saved.evidence_reference.trim().length < 3}
                onClick={() => mutation.mutate("prepare")}
              >
                Submit for review
              </Button>
            )}
            {saved?.status === "prepared" && (
              <Button
                variant="outline"
                disabled={!canManage || mutation.isPending || state !== "prepared"}
                onClick={() => mutation.mutate("review")}
              >
                Independent review
              </Button>
            )}
            {(saved?.status === "prepared" || saved?.status === "reviewed") && (
              <Button
                variant="outline"
                disabled={!canManage || mutation.isPending || note.trim().length < 3}
                onClick={() => mutation.mutate("reopen")}
              >
                Reopen with reason
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronRight, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import type { ChartBrowseSearch } from "@/lib/accounting/chart-browsing";
import { ariaSortValue, nextSort } from "@/lib/sort";
import { canSelectForArchive, chartViewRows, type ChartSortKey } from "@/lib/accounting/chart-view";
import {
  archiveChartAccount,
  copyChartAccounts,
  importChartAccounts,
  listChartAccounts,
  mergeChartAccounts,
  previewMergeChartAccounts,
  saveChartAccount,
  suggestChartAccount,
  type ChartAccount,
} from "@/lib/accounting/chart.functions";
import { kindSpec, type AccountKind } from "@/lib/accounting/account-kinds";
import {
  chartRowsToCsv,
  parseChartCsv,
  type ChartImportRow,
} from "@/lib/accounting/account-import";
import { saveAccountSchema } from "@/lib/accounting/account-schema";
import { signedBalance } from "@/lib/accounting/account-rules";
import { assessMergePlan } from "@/lib/accounting/account-merge";
import { fromMinorUnits } from "@/lib/accounting/money";
import { STARTER_CHARTS } from "@/lib/accounting/starter-charts";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { AccountForm } from "@/components/accounting/AccountForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { AccountLookup, LookupSelect } from "@/components/lookup";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";

const ROW_HEIGHT = 44;

export function ChartAccountsPanel({
  companyId,
  currency,
  browsing,
  onBrowse,
}: {
  companyId: string;
  currency: string;
  browsing: ChartBrowseSearch;
  onBrowse: (patch: ChartBrowseSearch) => void;
}) {
  const queryClient = useQueryClient();
  const canManageAccounts = useCanDo("accounts.manage");
  const scrollRef = useRef<HTMLDivElement>(null);
  const { data: companies } = useActiveCompany();
  const fetchChart = useServerFn(listChartAccounts);
  const archive = useServerFn(archiveChartAccount);
  const merge = useServerFn(mergeChartAccounts);
  const previewMerge = useServerFn(previewMergeChartAccounts);
  const importRows = useServerFn(importChartAccounts);
  const copyChart = useServerFn(copyChartAccounts);
  const suggest = useServerFn(suggestChartAccount);
  const save = useServerFn(saveChartAccount);
  const chartQuery = useQuery({
    queryKey: ["chart-accounts", companyId],
    queryFn: () => fetchChart({ data: { companyId } }),
  });

  const search = browsing.chartQ ?? "";
  const classFilter = browsing.chartClass ?? "all";
  const activeFilter = browsing.chartStatus ?? "active";
  const balanceFilter = browsing.chartBalance ?? "all";
  const mode = browsing.chartLayout ?? "tree";
  const showYtd = browsing.chartActivity !== "transactions";
  const sortKey = browsing.chartSort ?? "code";
  const sortDir = browsing.chartDir ?? "asc";
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [editing, setEditing] = useState<ChartAccount | null>(null);
  const [creating, setCreating] = useState<{ kind?: AccountKind; name?: string } | null>(null);
  const [inline, setInline] = useState<{ id: string; name: string } | null>(null);
  const [mergeSource, setMergeSource] = useState<ChartAccount | null>(null);
  const [mergeTarget, setMergeTarget] = useState("");
  const [mergeLockedToday, setMergeLockedToday] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [parsedRows, setParsedRows] = useState<ChartImportRow[]>([]);
  const [parseIssues, setParseIssues] = useState<string[]>([]);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySource, setCopySource] = useState("");
  const [suggestText, setSuggestText] = useState("");
  const [suggestions, setSuggestions] = useState<
    { kind: AccountKind; label: string; reason: string }[]
  >([]);

  useEffect(() => {
    setScrollTop(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [
    search,
    classFilter,
    activeFilter,
    balanceFilter,
    mode,
    sortKey,
    sortDir,
    showYtd,
    companyId,
  ]);

  const rows = useMemo(() => {
    const accounts = (chartQuery.data?.accounts ?? []).filter((account) => {
      const haystack = `${account.code} ${account.name} ${account.description}`.toLowerCase();
      if (search && !haystack.includes(search.toLowerCase())) return false;
      if (classFilter !== "all" && account.accountType !== classFilter) return false;
      if (activeFilter === "active" && !account.isActive) return false;
      if (activeFilter === "archived" && account.isActive) return false;
      const net = account.debitMinor - account.creditMinor;
      if (balanceFilter === "nonzero" && net === 0) return false;
      if (balanceFilter === "zero" && net !== 0) return false;
      return true;
    });
    return chartViewRows(accounts, collapsed, mode, { key: sortKey, dir: sortDir }, showYtd);
  }, [
    activeFilter,
    balanceFilter,
    chartQuery.data?.accounts,
    classFilter,
    collapsed,
    mode,
    search,
    sortKey,
    sortDir,
    showYtd,
  ]);

  const start = Math.min(
    Math.max(0, rows.length - 24),
    Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 4),
  );
  const visible = rows.slice(start, start + 24);
  const otherCompanies = (companies?.companies ?? []).filter((company) => company.id !== companyId);
  const selectedAccounts = (chartQuery.data?.accounts ?? []).filter(
    (account) => selected.has(account.id) && canSelectForArchive(account),
  );
  const eligibleDisplayedIds = rows
    .filter((row) => canSelectForArchive(row.account))
    .map((row) => row.account.id);
  const allDisplayedSelected =
    eligibleDisplayedIds.length > 0 && eligibleDisplayedIds.every((id) => selected.has(id));
  const someDisplayedSelected = eligibleDisplayedIds.some((id) => selected.has(id));

  const sortHeader = (key: ChartSortKey, label: string, title?: string) => (
    <div role="columnheader" aria-sort={ariaSortValue(sortKey === key, sortDir)} title={title}>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-left hover:text-foreground focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => {
          const next = nextSort({ key: sortKey, dir: sortDir }, key);
          onBrowse({
            chartSort: next.key === "code" ? undefined : next.key,
            chartDir: next.dir === "desc" ? "desc" : undefined,
          });
        }}
        aria-label={`${label}: ${sortKey === key ? sortDir : "not sorted"}. Sort column`}
      >
        {label}
        <span aria-hidden="true">{sortKey === key ? (sortDir === "asc" ? "↑" : "↓") : "↕"}</span>
      </button>
    </div>
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["chart-accounts", companyId] });
    await queryClient.invalidateQueries({ queryKey: ["accounts", companyId] });
  };

  const archiveMutation = useMutation({
    mutationFn: (accountId: string) => archive({ data: { companyId, accountId } }),
    onSuccess: async () => {
      await refresh();
      toast.success("Account archived");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const bulkArchiveMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const failed: { id: string; reason: string }[] = [];
      let archived = 0;
      for (const accountId of ids) {
        try {
          await archive({ data: { companyId, accountId } });
          archived += 1;
        } catch (error) {
          failed.push({ id: accountId, reason: friendlyAuthError(error) });
        }
      }
      return { archived, failed };
    },
    onSuccess: async ({ archived, failed }) => {
      await refresh();
      setSelected(new Set(failed.map((entry) => entry.id)));
      if (archived) toast.success(`Archived ${archived} account(s).`);
      if (failed.length) {
        toast.error(`${failed.length} could not be archived. ${failed[0]!.reason}`);
      }
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const mergePreview = useQuery({
    queryKey: ["merge-preview", companyId, mergeSource?.id, mergeTarget],
    enabled: mergeSource !== null && mergeTarget !== "",
    retry: false,
    queryFn: () =>
      previewMerge({
        data: { companyId, sourceId: mergeSource!.id, targetId: mergeTarget },
      }),
  });
  const mergePlan = mergePreview.data && "periods" in mergePreview.data ? mergePreview.data : null;
  const mergeAssessment = mergePlan ? assessMergePlan(mergePlan, mergeLockedToday) : null;

  const mergeMutation = useMutation({
    mutationFn: () => {
      if (!mergeSource || !mergeTarget) throw new Error("Choose the account that should remain.");
      return merge({
        data: {
          companyId,
          sourceId: mergeSource.id,
          targetId: mergeTarget,
          postLockedPeriodsToday: mergeLockedToday,
        },
      });
    },
    onSuccess: async (result) => {
      await refresh();
      setMergeSource(null);
      setMergeLockedToday(false);
      toast.success(
        result.journalCount
          ? `Accounts merged: ${result.journalCount} journal${result.journalCount === 1 ? "" : "s"} posted`
          : "Accounts merged",
      );
      if (!result.archived) {
        toast.message(
          result.archiveBlockedReason ??
            "The balance moved, but the old account could not be archived yet.",
        );
      }
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const importMutation = useMutation({
    mutationFn: (commit: boolean) => importRows({ data: { companyId, commit, rows: parsedRows } }),
    onSuccess: async (result, commit) => {
      if (!commit) {
        toast.success(
          `${result.preview.length} new accounts, ${result.skipped} already on the chart`,
        );
        return;
      }
      await refresh();
      setImportOpen(false);
      toast.success(`Imported ${result.imported} accounts`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const copyMutation = useMutation({
    mutationFn: () =>
      copyChart({ data: { sourceCompanyId: copySource, targetCompanyId: companyId } }),
    onSuccess: async (result) => {
      await refresh();
      setCopyOpen(false);
      toast.success(`Copied ${result.copied} accounts`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const suggestMutation = useMutation({
    mutationFn: () => suggest({ data: { description: suggestText } }),
    onSuccess: (result) => setSuggestions(result.suggestions),
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const rename = async (account: ChartAccount, name: string) => {
    if (!canManageAccounts || !account.accountKind || name.trim() === account.name) {
      setInline(null);
      return;
    }
    const parsed = saveAccountSchema.safeParse(
      draftFrom(account, companyId, { name: name.trim() }),
    );
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the account name.");
      return;
    }
    try {
      await save({ data: parsed.data });
      await refresh();
      setInline(null);
    } catch (error) {
      toast.error(friendlyAuthError(error));
    }
  };

  const reparent = async (account: ChartAccount, parentId: string) => {
    if (!canManageAccounts || !account.accountKind || account.id === parentId) return;
    const parsed = saveAccountSchema.safeParse(draftFrom(account, companyId, { parentId }));
    if (!parsed.success) return;
    try {
      await save({ data: parsed.data });
      await refresh();
    } catch (error) {
      toast.error(friendlyAuthError(error));
    }
  };

  if (chartQuery.isPending) return <LoadingState />;
  if (chartQuery.isError) {
    return <QueryErrorState queries={[chartQuery]} title="Could not load the chart" />;
  }

  const review = chartQuery.data.review;
  const balanceLabel = chartQuery.data.balanceLabel;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[min(14rem,100%)] flex-1 space-y-1">
          <Label htmlFor="chart-account-search">Search</Label>
          <Input
            id="chart-account-search"
            value={search}
            placeholder="Code, name, or description"
            maxLength={120}
            onChange={(event) => onBrowse({ chartQ: event.target.value })}
          />
        </div>
        <Filter
          label="Class"
          value={classFilter}
          onChange={(chartClass) => onBrowse({ chartClass })}
          options={["all", "asset", "liability", "equity", "income", "expense"]}
        />
        <Filter
          label="Status"
          value={activeFilter}
          onChange={(chartStatus) => onBrowse({ chartStatus })}
          options={["active", "archived", "all"]}
        />
        {canManageAccounts ? (
          <Button type="button" onClick={() => setCreating({})}>
            New account
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline">
              Chart actions <ChevronDown className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => downloadCsv(chartQuery.data.accounts)}>
              Export all CSV
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={rows.length === 0}
              onSelect={() => downloadCsv(rows.map((row) => row.account))}
            >
              Export displayed CSV
            </DropdownMenuItem>
            {canManageAccounts ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setImportOpen(true)}>Import CSV</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setTemplateOpen(true)}>
                  Starter charts
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setCopyOpen(true)}
                  disabled={otherCompanies.length === 0}
                >
                  Copy from organisation
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <details className="group rounded-md border border-border">
        <summary className="flex min-h-8 cursor-pointer list-none items-center gap-1.5 px-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          <ChevronRight aria-hidden="true" className="size-4 group-open:rotate-90" />
          Advanced chart options
        </summary>
        <div className="space-y-2 border-t border-border px-3 py-2">
          <div className="flex flex-wrap items-end gap-2">
            <Filter
              label="Balance"
              value={balanceFilter}
              onChange={(chartBalance) => onBrowse({ chartBalance })}
              options={["all", "nonzero", "zero"]}
            />
            <Filter
              label="Layout"
              value={mode}
              onChange={(chartLayout) => onBrowse({ chartLayout })}
              options={["tree", "flat"]}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => onBrowse({ chartActivity: showYtd ? "transactions" : undefined })}
            >
              {showYtd ? "Hide year to date" : "Show year to date"}
            </Button>
          </div>
          {canManageAccounts ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                className="max-w-md"
                value={suggestText}
                aria-label="Account description for suggestion"
                placeholder="Describe the account"
                onChange={(event) => setSuggestText(event.target.value)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={suggestMutation.isPending || !suggestText.trim()}
                onClick={() => suggestMutation.mutate()}
              >
                Suggest type
              </Button>
              {suggestions.map((item) => (
                <Button
                  key={item.kind}
                  type="button"
                  variant="secondary"
                  onClick={() => setCreating({ kind: item.kind, name: suggestText })}
                >
                  Use {item.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </details>
      {selectedAccounts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={
              !canManageAccounts || selectedAccounts.length === 0 || bulkArchiveMutation.isPending
            }
            onClick={() => {
              const accepted = window.confirm(
                `Archive ${selectedAccounts.length} selected active accounts? Accounts with balances, activity or dependencies may be blocked.`,
              );
              if (!accepted) return;
              bulkArchiveMutation.mutate(selectedAccounts.map((account) => account.id));
            }}
          >
            {bulkArchiveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Archive selected ({selectedAccounts.length})
          </Button>
          <Button size="sm" type="button" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground" role="status">
        Showing {rows.length} of {chartQuery.data.accounts.length} accounts.
        {selectedAccounts.length ? " " + selectedAccounts.length + " eligible selected." : ""}
        {mode === "tree" ? " Sorting applies within each account hierarchy." : ""}
      </p>
      {review.misclassified.length > 0 || review.duplicates.length > 0 ? (
        <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {review.misclassified.map((flag) => (
            <p key={flag.accountId}>{flag.message}</p>
          ))}
          {review.duplicates.map((pair) => (
            <p key={`${pair.leftId}-${pair.rightId}`}>{pair.message}</p>
          ))}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState
          title="No accounts match"
          description="Change the filters or create an account."
        />
      ) : (
        <div
          ref={scrollRef}
          role="region"
          aria-label="Chart of accounts"
          tabIndex={0}
          className="max-h-[32rem] overflow-auto rounded-lg border border-border"
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <div role="table" aria-label="Ledger accounts" aria-rowcount={rows.length + 1}>
            <div
              role="row"
              aria-rowindex={1}
              className="sticky top-0 z-10 grid min-w-[840px] grid-cols-[2rem_7rem_1fr_10rem_8rem_8rem_2rem] gap-2 border-b border-border bg-card px-3 py-2 text-xs font-medium text-muted-foreground"
            >
              <div role="columnheader" aria-label="Selection">
                <input
                  type="checkbox"
                  aria-label="Select all eligible displayed accounts"
                  title="Select all eligible displayed accounts"
                  disabled={
                    !canManageAccounts ||
                    eligibleDisplayedIds.length === 0 ||
                    bulkArchiveMutation.isPending
                  }
                  checked={allDisplayedSelected}
                  ref={(node) => {
                    if (node) node.indeterminate = someDisplayedSelected && !allDisplayedSelected;
                  }}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setSelected((current) => {
                      const next = new Set(current);
                      for (const id of eligibleDisplayedIds) {
                        if (checked) next.add(id);
                        else next.delete(id);
                      }
                      return next;
                    });
                  }}
                />
              </div>
              {sortHeader("code", "Code")}
              {sortHeader("name", "Name")}
              {sortHeader("type", "Type")}
              {sortHeader("balance", "Balance")}
              {sortHeader(
                "activity",
                showYtd ? "Year to date" : "Transactions",
                showYtd ? balanceLabel : undefined,
              )}
              <span role="columnheader" aria-label="Actions" />
            </div>
            <div
              role="rowgroup"
              className="relative min-w-[840px]"
              style={{ height: rows.length * ROW_HEIGHT }}
            >
              {visible.map((row, index) => {
                const account = row.account;
                const kind = account.accountKind
                  ? kindSpec(account.accountKind).label
                  : account.accountType;
                return (
                  <div
                    key={account.id}
                    role="row"
                    aria-rowindex={start + index + 2}
                    draggable={canManageAccounts && !!account.accountKind}
                    onDragStart={(event) => event.dataTransfer.setData("text/plain", account.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const sourceId = event.dataTransfer.getData("text/plain");
                      const source = chartQuery.data.accounts.find((item) => item.id === sourceId);
                      if (source) void reparent(source, account.id);
                    }}
                    className="absolute grid w-full grid-cols-[2rem_7rem_1fr_10rem_8rem_8rem_2rem] items-center gap-2 border-b border-border/50 px-3 text-sm hover:bg-muted/40 focus-within:bg-muted/40"
                    style={{ top: (start + index) * ROW_HEIGHT, height: ROW_HEIGHT }}
                  >
                    <div role="cell">
                      <input
                        type="checkbox"
                        aria-label={"Select " + account.code + " " + account.name}
                        checked={selected.has(account.id) && canSelectForArchive(account)}
                        disabled={
                          !canManageAccounts ||
                          !canSelectForArchive(account) ||
                          bulkArchiveMutation.isPending
                        }
                        onChange={(event) => {
                          const checked = event.target.checked;
                          setSelected((current) => {
                            const next = new Set(current);
                            if (checked) next.add(account.id);
                            else next.delete(account.id);
                            return next;
                          });
                        }}
                      />
                    </div>
                    <div role="cell">
                      {row.hasChildren ? (
                        <button
                          type="button"
                          className="flex items-center gap-1 text-left font-mono text-xs"
                          aria-label={`${account.code} ${account.name} subaccounts`}
                          aria-expanded={!collapsed.has(account.id)}
                          onClick={() => {
                            setCollapsed((current) => {
                              const next = new Set(current);
                              if (next.has(account.id)) next.delete(account.id);
                              else next.add(account.id);
                              return next;
                            });
                          }}
                        >
                          {collapsed.has(account.id) ? (
                            <ChevronRight aria-hidden="true" className="size-4" />
                          ) : (
                            <ChevronDown aria-hidden="true" className="size-4" />
                          )}
                          {account.code}
                        </button>
                      ) : (
                        <span className="truncate pl-5 font-mono text-xs">{account.code}</span>
                      )}
                    </div>
                    <div
                      role="cell"
                      className="flex min-w-0 items-center gap-1"
                      style={{ paddingLeft: row.depth * 16 }}
                    >
                      {inline?.id === account.id ? (
                        <Input
                          autoFocus
                          value={inline.name}
                          onChange={(event) =>
                            setInline({ id: account.id, name: event.target.value })
                          }
                          aria-label={`Rename ${account.name}`}
                          onBlur={() => void rename(account, inline.name)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur();
                            if (event.key === "Escape") setInline(null);
                          }}
                        />
                      ) : (
                        <span
                          className="truncate"
                          title={account.name}
                          onDoubleClick={() => {
                            if (canManageAccounts && account.accountKind && !account.isLocked) {
                              setInline({ id: account.id, name: account.name });
                            }
                          }}
                        >
                          {account.name}
                        </span>
                      )}
                      {!account.isActive ? <Badge variant="secondary">Archived</Badge> : null}
                      {account.isSystem ? <Badge variant="outline">System</Badge> : null}
                    </div>
                    <span role="cell" className="truncate text-muted-foreground">
                      {kind}
                    </span>
                    <div role="cell">
                      <Link
                        to="/reports/$reportId"
                        params={{ reportId: "general-ledger" }}
                        search={{ account: account.id }}
                        className="font-mono text-xs hover:underline"
                        title="Open account transactions"
                      >
                        {money(account, currency, "balance")}
                      </Link>
                    </div>
                    <span role="cell" className="font-mono text-xs">
                      {showYtd ? money(account, currency, "ytd") : account.transactionCount}
                    </span>
                    <div role="cell">
                      {canManageAccounts ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`Actions for ${account.name}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(account)}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={!account.accountKind || account.isLocked}
                              onSelect={() => setInline({ id: account.id, name: account.name })}
                            >
                              Rename inline
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                setCreating({
                                  kind: account.accountKind ?? "expense",
                                  name: `Copy of ${account.name}`,
                                })
                              }
                            >
                              Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={
                                !canManageAccounts ||
                                !canSelectForArchive(account) ||
                                archiveMutation.isPending
                              }
                              onClick={() => archiveMutation.mutate(account.id)}
                            >
                              Archive
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              disabled={account.isSystem || account.isLocked}
                              onClick={() => {
                                setMergeSource(account);
                                setMergeTarget("");
                              }}
                            >
                              Merge
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <Sheet
        open={creating !== null || editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(null);
            setEditing(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editing ? "Edit account" : "New account"}</SheetTitle>
          </SheetHeader>
          {creating || editing ? (
            <div className="mt-4">
              <AccountForm
                companyId={companyId}
                currency={currency}
                account={editing}
                {...(creating?.kind ? { initialKind: creating.kind } : {})}
                {...(creating?.name ? { initialName: creating.name } : {})}
                onSaved={(another) => {
                  if (!another) {
                    setCreating(null);
                    setEditing(null);
                  }
                }}
                onCancel={() => {
                  setCreating(null);
                  setEditing(null);
                }}
              />
            </div>
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={mergeSource !== null}
        onOpenChange={(open) => {
          if (!open) setMergeSource(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Merge {mergeSource?.code} {mergeSource?.name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            The balance moves period by period, with a journal dated inside each period, so earlier
            years keep their figures. Posted history stays on the original lines. Then this account
            is archived where the rules allow it.
          </p>
          <AccountLookup
            ariaLabel="Account to keep"
            accounts={(chartQuery.data.accounts ?? [])
              .filter(
                (account) =>
                  account.id !== mergeSource?.id &&
                  account.accountType === mergeSource?.accountType &&
                  account.isActive,
              )
              .map((account) => ({
                id: account.id,
                code: account.code,
                name: account.name,
                account_type: account.accountType,
                is_active: account.isActive,
                is_postable: account.isPostable,
              }))}
            value={mergeTarget}
            onChange={(value) => {
              setMergeTarget(value);
              setMergeLockedToday(false);
            }}
            companyId={companyId}
            purpose="parent"
            placeholder="Account to keep"
            allowClear={false}
          />
          {mergeTarget && mergePreview.isPending ? (
            <p className="text-sm text-muted-foreground">Checking what will be posted…</p>
          ) : null}
          {mergePreview.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {friendlyAuthError(mergePreview.error)}
            </p>
          ) : null}
          {mergePreview.data && "unavailable" in mergePreview.data ? (
            <p className="text-sm text-muted-foreground">{mergePreview.data.unavailable}</p>
          ) : null}
          {mergePlan && mergeAssessment ? (
            <div className="space-y-2 text-sm">
              {mergePlan.periods.length === 0 ? (
                <p>No balance to move. The account will just be archived.</p>
              ) : (
                <ul className="space-y-1">
                  {mergePlan.periods.map((p) => (
                    <li key={p.period_id} className="flex justify-between gap-2">
                      <span>
                        {p.period_name}: journal dated {p.journal_date}
                        {p.locked ? ` (locked: ${p.lock_reason ?? "locked"})` : ""}
                      </span>
                      <span className="tabular-nums">{fromMinorUnits(p.net_minor, currency)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {mergeAssessment.lockedPeriods.length > 0 ? (
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={mergeLockedToday}
                    onChange={(e) => setMergeLockedToday(e.target.checked)}
                  />
                  <span>
                    Post the locked periods&apos; share in one journal dated {mergePlan.today} (this
                    puts their amounts in today&apos;s period).
                  </span>
                </label>
              ) : null}
              {mergeAssessment.blockedReason ? (
                <p className="text-destructive">{mergeAssessment.blockedReason}</p>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              disabled={
                !mergeTarget ||
                mergeMutation.isPending ||
                (mergeAssessment !== null && !mergeAssessment.canMerge)
              }
              onClick={() => mergeMutation.mutate()}
            >
              {mergeMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import accounts</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            CSV columns: Code, Name, Account type, Description. Nothing is saved until you confirm
            the preview.
          </p>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const parsed = parseChartCsv(await file.text());
              setParsedRows(parsed.rows);
              setParseIssues(parsed.issues.map((issue) => `Row ${issue.row}: ${issue.message}`));
            }}
          />
          {parseIssues.map((issue) => (
            <p key={issue} className="text-sm text-destructive">
              {issue}
            </p>
          ))}
          {parsedRows.length > 0 && parseIssues.length === 0 ? (
            <p className="text-sm">
              {parsedRows.length} rows ready to check against this organisation.
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={
                parsedRows.length === 0 || parseIssues.length > 0 || importMutation.isPending
              }
              onClick={() => importMutation.mutate(false)}
            >
              Preview
            </Button>
            <Button
              type="button"
              disabled={
                parsedRows.length === 0 || parseIssues.length > 0 || importMutation.isPending
              }
              onClick={() => importMutation.mutate(true)}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Starter charts</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {STARTER_CHARTS.map((chart) => (
              <div key={chart.id} className="rounded-md border border-border p-3">
                <p className="font-medium">{chart.label}</p>
                <p className="text-sm text-muted-foreground">{chart.detail}</p>
                <Button
                  type="button"
                  className="mt-2"
                  variant="outline"
                  onClick={() => {
                    setParsedRows(
                      chart.accounts.map((account) => ({
                        code: account.code,
                        name: account.name,
                        accountKind: account.accountKind,
                        description: account.description,
                        parentCode: "",
                        detailType: "",
                        isHeader: false,
                        currencyCode: "",
                      })),
                    );
                    setParseIssues([]);
                    setTemplateOpen(false);
                    setImportOpen(true);
                  }}
                >
                  Review {chart.accounts.length} accounts
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy a chart</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Copies accounts you can manage. System accounts and matching codes or names are left as
            they are.
          </p>
          <LookupSelect
            ariaLabel="Source organisation"
            allowClear={false}
            value={copySource}
            onChange={setCopySource}
            placeholder="Source organisation"
            searchPlaceholder="Search organisation"
            options={otherCompanies.map((company) => ({
              id: company.id,
              name: company.name,
              label: company.name,
              keywords: company.name,
            }))}
          />
          <DialogFooter>
            <Button
              type="button"
              disabled={!copySource || copyMutation.isPending}
              onClick={() => copyMutation.mutate()}
            >
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Filter<const Option extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: Option;
  onChange: (value: Option) => void;
  options: readonly Option[];
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={`chart-filter-${label.toLowerCase()}`}>{label}</Label>
      <Select
        value={value}
        onValueChange={(value) => {
          const option = options.find((item) => item === value);
          if (option !== undefined) onChange(option);
        }}
      >
        {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

        <SelectTrigger id={`chart-filter-${label.toLowerCase()}`} className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function money(account: ChartAccount, currency: string, which: "balance" | "ytd"): string {
  const debit = which === "balance" ? account.debitMinor : account.ytdDebitMinor;
  const credit = which === "balance" ? account.creditMinor : account.ytdCreditMinor;
  const kind = account.accountKind;
  const signed = kind
    ? signedBalance(kind, debit, credit)
    : account.normalBalance === "debit"
      ? debit - credit
      : credit - debit;
  // Totals are converted to the company base currency by the ledger aggregates.
  return fromMinorUnits(signed, currency);
}

function draftFrom(
  account: ChartAccount,
  companyId: string,
  patch: { name?: string; parentId?: string },
) {
  return {
    companyId,
    id: account.id,
    code: account.code,
    name: patch.name ?? account.name,
    accountKind: account.accountKind ?? "expense",
    description: account.description,
    detailType: account.detailType,
    parentId: patch.parentId ?? account.parentId,
    defaultTaxCodeId: account.defaultTaxCodeId,
    currencyCode: account.currencyCode,
    isHeader: account.isHeader,
    isPaymentEnabled: account.isPaymentEnabled,
    showOnDashboardWatchlist: account.showOnDashboardWatchlist,
    showInExpenseClaims: account.showInExpenseClaims,
    bankName: account.bankName,
    accountNumberMasked: account.accountNumberMasked,
  };
}

function downloadCsv(accounts: ChartAccount[]) {
  const csv = chartRowsToCsv(
    accounts.map((account) => ({
      code: account.code,
      name: account.name,
      accountKind: account.accountKind ?? account.accountType,
      description: account.description,
    })),
  );
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "chart-of-accounts.csv";
  link.click();
  URL.revokeObjectURL(url);
}

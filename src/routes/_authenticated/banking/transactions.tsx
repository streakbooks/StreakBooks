import { CodingMemoryPanel } from "@/components/banking/CodingMemoryPanel";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { ProjectTagControl } from "@/components/projects/ProjectTagControl";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Eye, MoreHorizontal, Rows3, Table2 } from "lucide-react";
import { createFileRoute, Link, useRouteContext } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { useTablePrefs } from "@/hooks/use-table-prefs";
import { useIsMobile } from "@/hooks/use-mobile";
import { BankTransactionMobileCards } from "@/components/banking/BankTransactionMobileCards";
import { bankingReviewShortcut } from "@/lib/banking/review-shortcuts";
import { TableAppearanceControls } from "@/components/common/TableAppearanceControls";
import { TableCard } from "@/components/common/table-card";
import { StatusBadge } from "@/components/common/stat-card";
import {
  bulkCategoriseTransactions,
  excludeBankTransaction,
  listBankAccounts,
  listBankTransactions,
  restoreBankTransaction,
  suggestBankCoding,
  type BankTxnListRow,
} from "@/lib/banking/banking.functions";
import { bulkCodeByFilter, listCodingOptions } from "@/lib/banking/coding.functions";
import { unmatchBankTransaction } from "@/lib/banking/matching.functions";
import { cn } from "@/lib/utils";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { BankCodingPanel } from "@/components/banking/BankCodingPanel";
import { BankMatchPanel } from "@/components/banking/BankMatchPanel";
import { BankTransactionQuickPreview } from "@/components/banking/BankTransactionQuickPreview";
import { SelectionActionBar } from "@/components/common/SelectionActionBar";
import { ConfirmButton } from "@/components/banking/ConfirmButton";
import { ConfirmDialog } from "@/components/common/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AccountLookup, LookupSelect, type LookupCreateContext } from "@/components/lookup";
import { BankAccountCreateForm, TaxCodeCreateForm } from "@/components/lookup/create-forms";
import { toContactLookupOption } from "@/lib/lookup/eligibility";
import { ListSkeleton, ErrorState, EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SavedFilterViews } from "@/components/common/SavedFilterViews";
import type { ViewSchema, ViewSnapshot } from "@/lib/workspaces/saved-filter-views";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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

type Search = {
  status?: string;
  statusGroup?: string;
  q?: string;
  bankAccountId?: string;
  transactionId?: string;
  dateFrom?: string;
  dateTo?: string;
  direction?: string;
  page?: number;
  pageSize?: number;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ALL = "all";
const NONE = "none";

export const Route = createFileRoute("/_authenticated/banking/transactions")({
  validateSearch: (s: Record<string, unknown>): Search => {
    const out: Search = {};
    const str = (k: keyof Search) =>
      typeof s[k] === "string" && s[k] !== "" ? (s[k] as string) : undefined;
    const status = str("status");
    if (status) out.status = status;
    const statusGroup = str("statusGroup");
    if (statusGroup) out.statusGroup = statusGroup;
    const q = str("q");
    if (q) out.q = q;
    const bankAccountId = str("bankAccountId");
    if (bankAccountId) out.bankAccountId = bankAccountId;
    const transactionId = str("transactionId");
    if (
      transactionId &&
      /^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(transactionId)
    )
      out.transactionId = transactionId;
    const dateFrom = str("dateFrom");
    if (dateFrom && ISO.test(dateFrom)) out.dateFrom = dateFrom;
    const dateTo = str("dateTo");
    if (dateTo && ISO.test(dateTo)) out.dateTo = dateTo;
    const direction = str("direction");
    if (direction === "in" || direction === "out") out.direction = direction;
    const page = Number(s["page"]);
    if (Number.isInteger(page) && page > 0) out.page = page;
    const pageSize = Number(s["pageSize"]);
    if ([25, 50, 100, 200].includes(pageSize) && pageSize !== 50) out.pageSize = pageSize;
    return out;
  },
  head: () => ({ meta: [{ title: "Bank transactions — LinkBooks" }] }),
  component: BankTransactions,
});

const BANK_TXN_VIEW_SCHEMA = {
  status: {
    type: "choice",
    choices: ["", "uncategorised", "matched", "reconciled", "excluded", "all"],
  },
  statusGroup: { type: "choice", choices: ["", "unreconciled", "posted", "all"] },
  q: { type: "text", maxLength: 120 },
  bankAccountId: { type: "uuid" },
  dateFrom: { type: "date" },
  dateTo: { type: "date" },
  direction: { type: "choice", choices: ["", "in", "out"] },
  pageSize: { type: "choice", choices: ["25", "50", "100", "200"] },
} satisfies ViewSchema;

const DEFAULT_BANK_TXN_VIEW: ViewSnapshot = {
  status: "uncategorised",
  statusGroup: "",
  q: "",
  bankAccountId: "",
  dateFrom: "",
  dateTo: "",
  direction: "",
  pageSize: "50",
};

const BANK_OPTIONAL_COLUMNS = [
  { id: "account", label: "Bank account" },
  { id: "status", label: "Transaction status" },
  { id: "journal", label: "Linked journals" },
] as const;
const BANK_OPTIONAL_IDS = BANK_OPTIONAL_COLUMNS.map((column) => column.id);

type Expanded = { id: string; mode: "code" | "match"; initialAccountId?: string } | null;
type BankRowAction = { id: string; kind: "exclude" | "restore" | "unmatch" | "redo" } | null;

function BankTransactions() {
  const { user } = useRouteContext({ from: "/_authenticated" });
  const { company } = useActiveCompany();
  const fmt = useFormat();
  const companyId = company?.id;
  const currency = company?.base_currency ?? "GBP";
  const { can } = useCan();
  const canTax = can("tax.settings");
  const canBank = can("banking.feeds.manage");
  const canCategorise = can("banking.categorise");
  const canMatch = canCategorise || can("banking.reconcile");
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const qc = useQueryClient();

  const fetchTxns = useServerFn(listBankTransactions);
  const fetchAccounts = useServerFn(listBankAccounts);
  const fetchOptions = useServerFn(listCodingOptions);
  const fetchSuggest = useServerFn(suggestBankCoding);
  const doExclude = useServerFn(excludeBankTransaction);
  const doRestore = useServerFn(restoreBankTransaction);
  const doUnmatch = useServerFn(unmatchBankTransaction);
  const doBulk = useServerFn(bulkCategoriseTransactions);
  const doBulkFilter = useServerFn(bulkCodeByFilter);

  const status = search.statusGroup ? "" : (search.status ?? "uncategorised");
  const statusGroup = search.statusGroup ?? "";
  const page = search.page ?? 0;
  const pageSize = search.pageSize ?? 50;
  const tablePrefs = useTablePrefs(
    `${user.id}:${companyId ?? "none"}:bank-transactions`,
    BANK_OPTIONAL_IDS,
  );
  const showAccountColumn = !search.bankAccountId && tablePrefs.isVisible("account");
  const showStatusColumn = tablePrefs.isVisible("status");
  const showJournalColumn = tablePrefs.isVisible("journal");
  const tableColumnCount =
    5 + Number(showAccountColumn) + Number(showStatusColumn) + Number(showJournalColumn);

  const setSearch = (patch: { [K in keyof Search]?: Search[K] | undefined }, keepPage = false) =>
    void navigate({
      search: ((prev: Search) => {
        const next: Record<string, unknown> = { ...prev, ...patch };
        if (!("transactionId" in patch)) delete next["transactionId"];
        if (!keepPage && !("page" in patch)) delete next["page"];
        for (const k of Object.keys(next))
          if (next[k] === undefined || next[k] === "") delete next[k];
        return next;
      }) as never,
    });

  const isMobile = useIsMobile();
  const [mobileTableView, setMobileTableView] = useState(false);
  const [mobileFocusId, setMobileFocusId] = useState<string | null>(null);
  const focusRowRef = useRef<HTMLTableRowElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [qText, setQText] = useState(search.q ?? "");
  useEffect(() => setQText(search.q ?? ""), [search.q]);
  const [expanded, setExpanded] = useState<Expanded>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<BankRowAction>(null);
  const [bulkAccountId, setBulkAccountId] = useState("");
  const [bulkTaxCodeId, setBulkTaxCodeId] = useState(NONE);
  const [bulkProgress, setBulkProgress] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        Boolean(
          target.closest("input, textarea, select, [contenteditable='true'], [role='combobox']"),
        );
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      if (
        bankingReviewShortcut({
          key: event.key,
          modified: event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
          editing,
        }) === "search" &&
        searchInputRef.current
      ) {
        event.preventDefault();
        searchInputRef.current.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!isMobile || !mobileTableView || !mobileFocusId) return;
    focusRowRef.current?.scrollIntoView({ block: "center" });
  }, [isMobile, mobileTableView, mobileFocusId]);

  const filterKey = [
    companyId,
    search.bankAccountId,
    search.transactionId,
    status,
    statusGroup,
    search.q,
    search.dateFrom,
    search.dateTo,
    search.direction,
    page,
    pageSize,
  ];
  useEffect(() => {
    setSelected(new Set());
    setExpanded(null);
    setPreviewId(null);
    setPendingAction(null);
    setMobileFocusId(null);
  }, [filterKey.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  const accountsQ = useQuery({
    queryKey: ["bank-accounts", companyId, "all"],
    enabled: Boolean(companyId),
    queryFn: () => fetchAccounts({ data: { companyId: companyId!, includeInactive: true } }),
  });
  const currencyByAccount = useMemo(
    () => new Map((accountsQ.data ?? []).map((a) => [a.id, a.currency_code])),
    [accountsQ.data],
  );
  const nameByAccount = useMemo(
    () => new Map((accountsQ.data ?? []).map((a) => [a.id, a.name])),
    [accountsQ.data],
  );

  const txnsQ = useQuery({
    queryKey: ["bank-transactions", companyId, ...filterKey],
    enabled: Boolean(companyId),
    placeholderData: (prev) => prev,
    queryFn: () =>
      fetchTxns({
        data: {
          companyId: companyId!,
          ...(search.bankAccountId ? { bankAccountId: search.bankAccountId } : {}),
          ...(search.transactionId ? { transactionId: search.transactionId } : {}),
          ...(statusGroup ? { statusGroup } : status && status !== ALL ? { status } : {}),
          ...(search.q ? { q: search.q } : {}),
          ...(search.dateFrom ? { dateFrom: search.dateFrom } : {}),
          ...(search.dateTo ? { dateTo: search.dateTo } : {}),
          ...(search.direction ? { direction: search.direction } : {}),
          page,
          pageSize,
        },
      }),
  });

  const optionsQ = useQuery({
    queryKey: ["bank-coding-options", companyId],
    enabled: Boolean(companyId),
    staleTime: 60_000,
    queryFn: () => fetchOptions({ data: { companyId: companyId! } }),
  });

  const suggestQ = useQuery({
    queryKey: ["bank-suggest", companyId, expanded?.id],
    enabled: Boolean(companyId && expanded?.mode === "code"),
    queryFn: () =>
      fetchSuggest({ data: { companyId: companyId!, bankTransactionId: expanded!.id } }),
  });

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ["bank-transactions", companyId] });
    await qc.invalidateQueries({ queryKey: ["banking-counts", companyId] });
    await qc.invalidateQueries({ queryKey: ["bank-account-summaries", companyId] });
  };

  const excludeM = useMutation({
    mutationFn: (txnId: string) =>
      doExclude({ data: { companyId: companyId!, bankTransactionId: txnId } }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Excluded. No journal was created.");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const restoreM = useMutation({
    mutationFn: (txnId: string) =>
      doRestore({ data: { companyId: companyId!, bankTransactionId: txnId } }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Restored to For review");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const unmatchM = useMutation({
    mutationFn: (vars: { txnId: string; redo: boolean }) =>
      doUnmatch({ data: { companyId: companyId!, bankTransactionId: vars.txnId } }).then((r) => ({
        ...r,
        ...vars,
      })),
    onSuccess: async (r) => {
      await invalidate();
      toast.success(
        r.reversedJournalCount > 0
          ? `Undone. ${r.reversedJournalCount} reversing journal(s) posted; the line is back in For review.`
          : "Unmatched. The line is back in For review.",
      );
      if (r.redo) setExpanded({ id: r.txnId, mode: "code" });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const bulkSelectedM = useMutation({
    mutationFn: () =>
      doBulk({
        data: {
          companyId: companyId!,
          bankTransactionIds: [...selected],
          offsetAccountId: bulkAccountId,
          taxCodeId: bulkTaxCodeId === NONE ? null : bulkTaxCodeId,
        },
      }),
    onSuccess: async (r) => {
      await invalidate();
      setSelected(new Set());
      if (r.failed > 0) {
        const first = r.results.find((x) => !x.ok);
        toast.warning(`${r.succeeded} coded, ${r.failed} failed. ${first?.error ?? ""}`);
      } else toast.success(`${r.succeeded} transactions coded`);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const bulkAllM = useMutation({
    mutationFn: async () => {
      let coded = 0;
      let failed = 0;
      let lastErrors: string[] = [];
      for (let guard = 0; guard < 200; guard++) {
        const r = await doBulkFilter({
          data: {
            companyId: companyId!,
            ...(search.bankAccountId ? { bankAccountId: search.bankAccountId } : {}),
            ...(search.q ? { q: search.q } : {}),
            ...(search.dateFrom ? { dateFrom: search.dateFrom } : {}),
            ...(search.dateTo ? { dateTo: search.dateTo } : {}),
            ...(search.direction ? { direction: search.direction } : {}),
            accountId: bulkAccountId,
            taxCodeId: bulkTaxCodeId === NONE ? null : bulkTaxCodeId,
          },
        });
        coded += r.coded;
        failed += r.failed;
        lastErrors = r.errors;
        setBulkProgress(`${coded} coded… ${r.remaining} remaining`);
        if (r.remaining === 0 || r.stuck || r.coded === 0) break;
      }
      return { coded, failed, errors: lastErrors };
    },
    onSuccess: async (r) => {
      setBulkProgress(null);
      await invalidate();
      if (r.failed > 0)
        toast.warning(`${r.coded} coded, ${r.failed} could not be coded. ${r.errors[0] ?? ""}`);
      else toast.success(`${r.coded} transactions coded`);
    },
    onError: async (e) => {
      setBulkProgress(null);
      await invalidate();
      toast.error(friendlyAuthError(e));
    },
  });

  const requiredQueries = [accountsQ];
  if (requiredQueries.some((query) => query.isError && query.data === undefined))
    return <QueryErrorState queries={requiredQueries} title="Could not load bank accounts" />;

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  const rows = (txnsQ.data?.rows ?? []) as BankTxnListRow[];
  const showMobileCards = isMobile && !mobileTableView;
  const previewIndex = rows.findIndex((transaction) => transaction.id === previewId);
  const previewTransaction = previewIndex >= 0 ? (rows[previewIndex] ?? null) : null;
  const actionRow = rows.find((txn) => txn.id === pendingAction?.id);
  const actionHasPostedCoding = Boolean(
    actionRow?.links.some((link) => link.sourceType === "bank_transaction" && !link.reversed),
  );
  const total = txnsQ.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const reviewing = status === "uncategorised";
  const uncategorisedRows = rows.filter((r) => r.status === "uncategorised");
  const allPageSelected =
    uncategorisedRows.length > 0 && uncategorisedRows.every((r) => selected.has(r.id));

  const title =
    statusGroup === "unreconciled"
      ? "Unreconciled"
      : statusGroup === "posted"
        ? "Posted / categorised"
        : status === "excluded"
          ? "Excluded"
          : status === "reconciled"
            ? "Reconciled"
            : status === "matched"
              ? "Matched"
              : status === ALL
                ? "All bank transactions"
                : "For review";

  const bulkReady = Boolean(bulkAccountId);
  const taxChoices = (optionsQ.data?.taxCodes ?? []).filter(
    (t) => t.rateActive && t.treatment !== "reverse_charge",
  );

  return (
    <ListWorkspace
      title={title}
      description="Code a line (one balanced journal), match it to existing ledger activity, or exclude it. Unmatch undoes a coding by posting a reversing journal."
      actions={
        <>
          <Button size="sm" variant="outline" asChild>
            <Link to="/banking/rules" search={{ review: "1" } as never}>
              Review rule suggestions
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/banking/cash-coding">Open cash coding</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/banking/receive-money">Receive money</Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link to="/banking/spend-money">Spend money</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/banking/transfers/new">New transfer</Link>
          </Button>
        </>
      }
    >
      {search.transactionId ? (
        <div className="mb-3 flex items-center gap-3 text-sm text-muted-foreground" role="status">
          <span>Showing the bank transaction selected from global search.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSearch({ transactionId: undefined, statusGroup: "all" })}
          >
            Show all transactions
          </Button>
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <LookupSelect
          className="w-48"
          ariaLabel="Bank account"
          allowClear={false}
          value={search.bankAccountId ?? ALL}
          onChange={(v) => setSearch({ bankAccountId: v === ALL ? undefined : v })}
          searchPlaceholder="Search bank account"
          options={[
            { id: ALL, label: "All accounts" },
            ...(accountsQ.data ?? []).map((a) => ({
              id: a.id,
              name: a.name,
              label: a.name,
              meta: a.currency_code,
              group: a.currency_code,
              status: a.is_active ? null : "Archived",
              keywords: `${a.name} ${a.currency_code}`,
            })),
          ]}
          {...(companyId && canBank
            ? {
                companyId,
                createTitle: "New bank account",
                renderCreate: (ctx: LookupCreateContext) => (
                  <BankAccountCreateForm companyId={companyId} currency={currency} ctx={ctx} />
                ),
              }
            : {})}
        />
        <Select
          value={statusGroup || status || ALL}
          onValueChange={(v) =>
            v === "unreconciled" || v === "posted"
              ? setSearch({ statusGroup: v, status: undefined })
              : setSearch({ statusGroup: undefined, status: v })
          }
        >
          <SelectTrigger className="w-48" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="uncategorised">For review</SelectItem>
            <SelectItem value="matched">Matched (posted)</SelectItem>
            <SelectItem value="reconciled">Reconciled</SelectItem>
            <SelectItem value="unreconciled">Unreconciled</SelectItem>
            <SelectItem value="posted">Posted (matched + reconciled)</SelectItem>
            <SelectItem value="excluded">Excluded</SelectItem>
            <SelectItem value={ALL}>All</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={search.direction ?? ALL}
          onValueChange={(v) => setSearch({ direction: v === ALL ? undefined : v })}
        >
          <SelectTrigger className="w-36" aria-label="Money in or out">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>In and out</SelectItem>
            <SelectItem value="in">Money in</SelectItem>
            <SelectItem value="out">Money out</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          From
          <Input
            type="date"
            className="h-9 w-40"
            value={search.dateFrom ?? ""}
            onChange={(e) => setSearch({ dateFrom: e.target.value || undefined })}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          To
          <Input
            type="date"
            className="h-9 w-40"
            value={search.dateTo ?? ""}
            onChange={(e) => setSearch({ dateTo: e.target.value || undefined })}
          />
        </label>
        <Input
          ref={searchInputRef}
          className="max-w-xs"
          aria-label="Search bank transactions"
          placeholder="Search description, reference, payee…"
          value={qText}
          onChange={(e) => setQText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setSearch({ q: qText.trim() || undefined });
          }}
        />
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setSearch({ q: qText.trim() || undefined })}
        >
          Search
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-card/80 p-3 print:hidden">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Quick views
        </span>
        <Button
          size="sm"
          variant={status === "uncategorised" && !statusGroup ? "secondary" : "outline"}
          onClick={() =>
            setSearch({ status: "uncategorised", statusGroup: undefined, transactionId: undefined })
          }
        >
          For review
        </Button>
        <Button
          size="sm"
          variant={statusGroup === "unreconciled" ? "secondary" : "outline"}
          onClick={() =>
            setSearch({ status: undefined, statusGroup: "unreconciled", transactionId: undefined })
          }
        >
          Unreconciled
        </Button>
        <Button
          size="sm"
          variant={search.direction === "out" ? "secondary" : "outline"}
          onClick={() =>
            setSearch({
              direction: search.direction === "out" ? undefined : "out",
              transactionId: undefined,
            })
          }
        >
          Money out
        </Button>
        <div className="ml-auto">
          <SavedFilterViews
            scope={user.id + ":" + companyId + ":bank-transactions"}
            schema={BANK_TXN_VIEW_SCHEMA}
            defaults={DEFAULT_BANK_TXN_VIEW}
            current={{
              status: search.status ?? "",
              statusGroup: search.statusGroup ?? "",
              q: search.q ?? "",
              bankAccountId: search.bankAccountId ?? "",
              dateFrom: search.dateFrom ?? "",
              dateTo: search.dateTo ?? "",
              direction: search.direction ?? "",
              pageSize: String(pageSize),
            }}
            onApply={(view) => {
              const term = String(view["q"] ?? "");
              setQText(term);
              setSearch({
                status: String(view["status"] ?? "") || undefined,
                statusGroup: String(view["statusGroup"] ?? "") || undefined,
                q: term || undefined,
                bankAccountId: String(view["bankAccountId"] ?? "") || undefined,
                transactionId: undefined,
                dateFrom: String(view["dateFrom"] ?? "") || undefined,
                dateTo: String(view["dateTo"] ?? "") || undefined,
                direction: String(view["direction"] ?? "") || undefined,
                page: undefined,
                pageSize:
                  Number(view["pageSize"] ?? "50") === 50 ? undefined : Number(view["pageSize"]),
              });
            }}
            onReset={() => {
              setQText("");
              setSearch({
                status: "uncategorised",
                statusGroup: undefined,
                q: undefined,
                bankAccountId: undefined,
                transactionId: undefined,
                dateFrom: undefined,
                dateTo: undefined,
                direction: undefined,
                page: undefined,
                pageSize: undefined,
              });
            }}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="md:hidden"
          aria-label={
            mobileTableView ? "Switch to transaction cards" : "Switch to transaction table"
          }
          aria-pressed={mobileTableView}
          onClick={() => {
            setExpanded(null);
            setMobileFocusId(null);
            setMobileTableView((value) => !value);
          }}
        >
          {mobileTableView ? (
            <Rows3 className="size-4" aria-hidden />
          ) : (
            <Table2 className="size-4" aria-hidden />
          )}
          {mobileTableView ? "Cards" : "Table"}
        </Button>
        <span className="hidden text-xs text-muted-foreground lg:inline">Press / to search</span>
        <TableAppearanceControls
          columns={BANK_OPTIONAL_COLUMNS}
          hidden={tablePrefs.hidden}
          density={tablePrefs.density}
          onToggleColumn={tablePrefs.toggle}
          onDensityChange={tablePrefs.setDensity}
          onReset={tablePrefs.reset}
        />
      </div>

      {canCategorise ? (
        <SelectionActionBar
          count={selected.size}
          onClear={() => setSelected(new Set())}
          description="Selection applies to visible transactions on this page. Choose a coding account below."
        />
      ) : null}
      {canCategorise && reviewing && uncategorisedRows.length > 0 ? (
        <div className="mb-3 space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {selected.size > 0 ? `${selected.size} selected` : "Bulk coding"}
            </span>
            <AccountLookup
              className="w-56"
              ariaLabel="Account for bulk coding"
              accounts={optionsQ.data?.accounts ?? []}
              value={bulkAccountId}
              onChange={setBulkAccountId}
              companyId={companyId}
              placeholder="Account"
              allowClear={false}
            />
            <LookupSelect
              className="w-40"
              ariaLabel="Tax code for bulk coding"
              allowClear={false}
              value={bulkTaxCodeId}
              onChange={setBulkTaxCodeId}
              searchPlaceholder="Search tax code"
              options={[
                { id: NONE, label: "No tax" },
                ...taxChoices.map((t) => ({
                  id: t.id,
                  code: t.code,
                  name: t.name,
                  label: t.name,
                  meta: t.code,
                  keywords: `${t.code} ${t.name}`,
                })),
              ]}
              {...(companyId && canTax
                ? {
                    companyId,
                    createTitle: "New tax code",
                    renderCreate: (ctx: LookupCreateContext) => (
                      <TaxCodeCreateForm companyId={companyId} appliesTo="both" ctx={ctx} />
                    ),
                  }
                : {})}
            />
            <Button
              size="sm"
              disabled={selected.size === 0 || !bulkReady || bulkSelectedM.isPending}
              onClick={() => bulkSelectedM.mutate()}
            >
              Code selected
            </Button>
          </div>
          {allPageSelected && total > uncategorisedRows.length ? (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span>
                All {uncategorisedRows.length} on this page are selected. {total} lines match this
                filter.
              </span>
              <ConfirmButton
                title={`Code all ${total} matching lines?`}
                description={`Every uncategorised line matching the current filters will be coded to the chosen account${
                  bulkTaxCodeId === NONE ? "" : " and tax code"
                }, one journal each. Lines that cannot be coded are skipped and reported.`}
                confirmLabel={`Code all ${total}`}
                disabled={!bulkReady || bulkAllM.isPending}
                onConfirm={() => bulkAllM.mutate()}
              >
                Code all {total} matching
              </ConfirmButton>
              {!bulkReady ? (
                <span className="text-muted-foreground">Choose an account first.</span>
              ) : null}
            </div>
          ) : null}
          {bulkProgress ? <p className="text-xs text-muted-foreground">{bulkProgress}</p> : null}
        </div>
      ) : null}

      {txnsQ.isPending ? (
        <ListSkeleton />
      ) : txnsQ.isError ? (
        <ErrorState
          onRetry={() => void txnsQ.refetch()}
          title="Could not load"
          description={friendlyAuthError(txnsQ.error)}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="No transactions"
          description="Import a CSV or change filters."
          action={
            <Button size="sm" asChild>
              <Link to="/banking/import">Import statement</Link>
            </Button>
          }
        />
      ) : showMobileCards ? (
        <BankTransactionMobileCards
          canCategorise={canCategorise}
          canMatch={canMatch}
          rows={rows}
          selected={selected}
          density={tablePrefs.density}
          formatDate={(date) => fmt.date(date)}
          formatMoney={(amount, code) => fmt.money(amount, code)}
          accountName={(id) => nameByAccount.get(id) ?? "Bank account"}
          accountCurrency={(id) => currencyByAccount.get(id) ?? currency}
          onSelect={(id, checked) =>
            setSelected((previous) => {
              const next = new Set(previous);
              if (checked) next.add(id);
              else next.delete(id);
              return next;
            })
          }
          onPreview={setPreviewId}
          onReview={(id, mode) => {
            setMobileFocusId(id);
            setExpanded({ id, mode });
            setMobileTableView(true);
          }}
          onManage={(id) => {
            setMobileFocusId(id);
            setExpanded(null);
            setMobileTableView(true);
          }}
        />
      ) : (
        <TableCard>
          <Table
            className={
              tablePrefs.density === "compact"
                ? "[&_th]:h-8 [&_td]:py-1.5 [&_td]:text-xs"
                : undefined
            }
          >
            <TableHeader>
              <TableRow>
                <TableHead className="w-8">
                  {reviewing && canCategorise ? (
                    <Checkbox
                      aria-label="Select all on this page"
                      checked={allPageSelected}
                      onCheckedChange={(v) =>
                        setSelected(
                          v === true ? new Set(uncategorisedRows.map((r) => r.id)) : new Set(),
                        )
                      }
                    />
                  ) : null}
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="min-w-[180px]">Description</TableHead>
                {showAccountColumn ? (
                  <TableHead className="hidden lg:table-cell">Account</TableHead>
                ) : null}
                <TableHead className="whitespace-nowrap text-right">Amount</TableHead>
                {showStatusColumn ? <TableHead>Status</TableHead> : null}
                {showJournalColumn ? (
                  <TableHead className="hidden lg:table-cell">Journal</TableHead>
                ) : null}
                <TableHead className="sticky right-0 z-10 min-w-[100px] bg-muted/95 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => {
                const currency =
                  currencyByAccount.get(t.bank_account_id) ?? company?.base_currency ?? "GBP";
                const bankJournals = t.links.filter(
                  (l) => l.sourceType === "bank_transaction" && !l.reversed,
                );
                const canRedo = t.status === "matched" && bankJournals.length > 0;
                const open =
                  expanded?.id === t.id && (expanded.mode === "code" ? canCategorise : canMatch)
                    ? expanded
                    : null;
                return (
                  <Fragment key={t.id}>
                    <TableRow ref={mobileFocusId === t.id ? focusRowRef : undefined}>
                      <TableCell>
                        {canCategorise && t.status === "uncategorised" ? (
                          <Checkbox
                            aria-label={`Select ${t.description ?? "transaction"}`}
                            checked={selected.has(t.id)}
                            onCheckedChange={(v) =>
                              setSelected((s) => {
                                const next = new Set(s);
                                if (v === true) next.add(t.id);
                                else next.delete(t.id);
                                return next;
                              })
                            }
                          />
                        ) : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <Link
                          to="/banking/transactions"
                          search={{ transactionId: t.id, statusGroup: "all" }}
                          className="rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          {fmt.date(t.txn_date)}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/banking/transactions"
                          search={{ transactionId: t.id, statusGroup: "all" }}
                          className="rounded-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                        >
                          {t.description ?? "—"}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {[t.payee, t.reference ? `Ref ${t.reference}` : null, t.contact_name]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                        {t.exclude_reason ? (
                          <div className="text-xs text-muted-foreground">
                            Excluded: {t.exclude_reason}
                          </div>
                        ) : null}
                      </TableCell>
                      {showAccountColumn ? (
                        <TableCell className="hidden whitespace-nowrap text-sm lg:table-cell">
                          <Link
                            to="/banking"
                            className="rounded-sm underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                          >
                            {nameByAccount.get(t.bank_account_id) ?? "—"}
                          </Link>
                        </TableCell>
                      ) : null}
                      <TableCell
                        className={cn(
                          "money whitespace-nowrap font-medium",
                          t.amount_minor > 0 && "text-money-in",
                          t.amount_minor < 0 && "text-money-out",
                        )}
                      >
                        {fmt.money(t.amount_minor, currency)}
                      </TableCell>
                      {showStatusColumn ? (
                        <TableCell>
                          <StatusBadge status={t.status} />
                        </TableCell>
                      ) : null}
                      {showJournalColumn ? (
                        <TableCell className="hidden lg:table-cell">
                          {t.links.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-col">
                              {t.links.map((l) =>
                                l.journalId ? (
                                  <Link
                                    key={l.journalLineId}
                                    to="/banking/journal/$journalId"
                                    params={{ journalId: l.journalId }}
                                    className="text-sm underline-offset-4 hover:underline"
                                  >
                                    Journal #{l.journalNumber}
                                    {l.reversed ? " (reversed)" : ""}
                                  </Link>
                                ) : null,
                              )}
                            </div>
                          )}
                        </TableCell>
                      ) : null}
                      <TableCell className="sticky right-0 z-10 border-l bg-card text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="size-8 p-0"
                            title="Preview transaction"
                            aria-label={
                              "Preview transaction " + (t.description ?? fmt.date(t.txn_date))
                            }
                            onClick={() => setPreviewId(t.id)}
                          >
                            <Eye className="size-4" aria-hidden />
                          </Button>
                          {t.status === "uncategorised" ? (
                            <>
                              {canCategorise ? (
                                <Button
                                  size="sm"
                                  variant={open?.mode === "code" ? "secondary" : "default"}
                                  onClick={() =>
                                    setExpanded(
                                      open?.mode === "code" ? null : { id: t.id, mode: "code" },
                                    )
                                  }
                                >
                                  Code
                                </Button>
                              ) : null}
                              {canMatch ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="hidden sm:inline-flex"
                                  onClick={() =>
                                    setExpanded(
                                      open?.mode === "match" ? null : { id: t.id, mode: "match" },
                                    )
                                  }
                                >
                                  Match
                                </Button>
                              ) : null}
                            </>
                          ) : null}
                          {t.status === "matched" ? (
                            <ProjectTagControl lazy kind="bank_transaction" documentId={t.id} />
                          ) : null}
                          {t.status === "reconciled" ? (
                            <span className="text-xs text-muted-foreground">Reconciled</span>
                          ) : null}
                          {["uncategorised", "matched", "excluded"].includes(t.status) &&
                          (canCategorise || (canMatch && t.status === "uncategorised")) ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="size-8 p-0"
                                  aria-label={
                                    "More actions for transaction " +
                                    (t.description ?? fmt.date(t.txn_date))
                                  }
                                >
                                  <MoreHorizontal className="size-4" aria-hidden />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="min-w-48">
                                {t.status === "uncategorised" ? (
                                  <>
                                    {canMatch ? (
                                      <DropdownMenuItem
                                        className="sm:hidden"
                                        onSelect={() =>
                                          setExpanded(
                                            open?.mode === "match"
                                              ? null
                                              : { id: t.id, mode: "match" },
                                          )
                                        }
                                      >
                                        Match transaction
                                      </DropdownMenuItem>
                                    ) : null}
                                    {canCategorise ? (
                                      <DropdownMenuItem
                                        disabled={excludeM.isPending}
                                        onSelect={() =>
                                          setPendingAction({ id: t.id, kind: "exclude" })
                                        }
                                      >
                                        Exclude from review…
                                      </DropdownMenuItem>
                                    ) : null}
                                  </>
                                ) : null}
                                {t.status === "matched" ? (
                                  <>
                                    {canRedo ? (
                                      <DropdownMenuItem
                                        disabled={unmatchM.isPending}
                                        onSelect={() =>
                                          setPendingAction({ id: t.id, kind: "redo" })
                                        }
                                      >
                                        Remove & redo coding…
                                      </DropdownMenuItem>
                                    ) : null}
                                    {canRedo ? <DropdownMenuSeparator /> : null}
                                    <DropdownMenuItem
                                      disabled={unmatchM.isPending}
                                      onSelect={() =>
                                        setPendingAction({ id: t.id, kind: "unmatch" })
                                      }
                                    >
                                      Unmatch transaction…
                                    </DropdownMenuItem>
                                  </>
                                ) : null}
                                {t.status === "excluded" ? (
                                  <DropdownMenuItem
                                    disabled={restoreM.isPending}
                                    onSelect={() => setPendingAction({ id: t.id, kind: "restore" })}
                                  >
                                    Restore transaction…
                                  </DropdownMenuItem>
                                ) : null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow>
                        <TableCell colSpan={tableColumnCount} className="bg-muted/10">
                          {open.mode === "code" ? (
                            <div className="space-y-2">
                              {suggestQ.data ? (
                                <CodingMemoryPanel
                                  key={`${companyId}:${t.id}`}
                                  companyId={companyId!}
                                  transactionId={t.id}
                                  preferences={suggestQ.data.memoryPreferences}
                                  suggestions={suggestQ.data.suggestions}
                                  available={suggestQ.data.memoryAvailable}
                                  onSelect={(accountId) =>
                                    setExpanded({
                                      id: t.id,
                                      mode: "code",
                                      initialAccountId: accountId,
                                    })
                                  }
                                />
                              ) : null}
                              {suggestQ.data?.historyCoverage.limited ? (
                                <p role="status" className="text-xs text-muted-foreground">
                                  History coverage is limited to 100 matching preferences. Other
                                  classifications may exist; review the account before coding.
                                </p>
                              ) : null}
                              {suggestQ.isError ? (
                                <Alert variant="destructive">
                                  <AlertDescription>
                                    Coding suggestions could not be loaded.
                                    <Button
                                      variant="link"
                                      size="sm"
                                      onClick={() => void suggestQ.refetch()}
                                    >
                                      Retry
                                    </Button>
                                  </AlertDescription>
                                </Alert>
                              ) : suggestQ.isPending ? (
                                <p role="status" className="text-xs text-muted-foreground">
                                  Loading coding suggestions…
                                </p>
                              ) : suggestQ.data &&
                                suggestQ.data.suggestions.some((s) => s.source === "rule") ? (
                                <div className="flex flex-wrap items-center gap-1 text-xs">
                                  <span className="text-muted-foreground">Bank rules:</span>
                                  {suggestQ.data.suggestions
                                    .filter((s) => s.source === "rule")
                                    .slice(0, 4)
                                    .map((s) => (
                                      <Button
                                        key={`${s.offsetAccountId}-${s.reason}`}
                                        size="sm"
                                        variant="outline"
                                        className="h-6 px-2 text-xs"
                                        title={s.reason}
                                        onClick={() =>
                                          setExpanded({
                                            id: t.id,
                                            mode: "code",
                                            initialAccountId: s.offsetAccountId,
                                          })
                                        }
                                      >
                                        {[s.accountCode, s.accountName].filter(Boolean).join(" ") ||
                                          "Account"}{" "}
                                        · {s.matchStrength}
                                        {s.conflictingHistory
                                          ? " · conflicting history: review"
                                          : ""}
                                      </Button>
                                    ))}
                                </div>
                              ) : suggestQ.data && suggestQ.data.suggestions.length === 0 ? (
                                <Alert>
                                  <AlertDescription>
                                    {suggestQ.data.externalResearchNote}
                                  </AlertDescription>
                                </Alert>
                              ) : null}
                              {optionsQ.data ? (
                                <BankCodingPanel
                                  key={`${t.id}-${open.initialAccountId ?? ""}`}
                                  companyId={companyId}
                                  txn={{
                                    id: t.id,
                                    amountMinor: t.amount_minor,
                                    description: t.description,
                                  }}
                                  currency={currency}
                                  options={optionsQ.data}
                                  {...(open.initialAccountId
                                    ? { initialAccountId: open.initialAccountId }
                                    : {})}
                                  onCancel={() => setExpanded(null)}
                                  onDone={() => {
                                    setExpanded(null);
                                    void invalidate();
                                  }}
                                />
                              ) : optionsQ.isError ? (
                                <p className="text-sm text-destructive">
                                  {friendlyAuthError(optionsQ.error)}
                                </p>
                              ) : (
                                <ListSkeleton rows={2} />
                              )}
                            </div>
                          ) : (
                            <BankMatchPanel
                              companyId={companyId}
                              txn={{
                                id: t.id,
                                amountMinor: t.amount_minor,
                                description: t.description,
                                bankAccountId: t.bank_account_id,
                              }}
                              currency={currency}
                              onCancel={() => setExpanded(null)}
                              onDone={() => {
                                setExpanded(null);
                                void invalidate();
                              }}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </TableCard>
      )}

      <ConfirmDialog
        open={canCategorise && Boolean(pendingAction)}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={
          pendingAction?.kind === "exclude"
            ? "Exclude this transaction?"
            : pendingAction?.kind === "restore"
              ? "Restore this transaction?"
              : pendingAction?.kind === "redo"
                ? "Remove and redo this coding?"
                : "Unmatch this transaction?"
        }
        description={
          pendingAction?.kind === "exclude"
            ? "This transaction will be excluded from the review list. It is not deleted and can be restored."
            : pendingAction?.kind === "restore"
              ? "Return this excluded transaction to the review list."
              : pendingAction?.kind === "redo"
                ? "A reversing journal is posted for the coding, the link is removed, and this line returns to For review. Nothing is deleted."
                : actionHasPostedCoding
                  ? "A reversing journal is posted and this line returns to For review."
                  : "The link to the ledger line is removed. The journal it was matched to is not changed."
        }
        confirmLabel={
          pendingAction?.kind === "exclude"
            ? "Exclude"
            : pendingAction?.kind === "restore"
              ? "Restore"
              : pendingAction?.kind === "redo"
                ? "Remove & redo"
                : "Unmatch"
        }
        pending={excludeM.isPending || restoreM.isPending || unmatchM.isPending}
        onConfirm={() => {
          if (!canCategorise || !pendingAction || !actionRow) {
            setPendingAction(null);
            return;
          }
          const { kind, id } = pendingAction;
          if (kind === "exclude" && actionRow.status === "uncategorised") excludeM.mutate(id);
          else if (kind === "restore" && actionRow.status === "excluded") restoreM.mutate(id);
          else if ((kind === "unmatch" || kind === "redo") && actionRow.status === "matched") {
            unmatchM.mutate({ txnId: id, redo: kind === "redo" });
          }
          setPendingAction(null);
        }}
      />

      <BankTransactionQuickPreview
        transaction={previewTransaction}
        accountName={
          previewTransaction
            ? (nameByAccount.get(previewTransaction.bank_account_id) ?? "Bank account")
            : "Bank account"
        }
        currency={
          previewTransaction
            ? (currencyByAccount.get(previewTransaction.bank_account_id) ?? currency)
            : currency
        }
        pagePosition={previewIndex + 1}
        pageTotal={rows.length}
        formatDate={(value) => fmt.date(value)}
        formatMoney={(amount, code) => fmt.money(amount, code)}
        onClose={() => setPreviewId(null)}
        onPrevious={() => {
          const previous = rows[previewIndex - 1];
          if (previous) setPreviewId(previous.id);
        }}
        onNext={() => {
          const next = rows[previewIndex + 1];
          if (next) setPreviewId(next.id);
        }}
      />

      {txnsQ.data ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Showing {total === 0 ? 0 : page * pageSize + 1}–{page * pageSize + rows.length} of{" "}
            {total}
          </span>
          <div className="flex items-center gap-2">
            <Select
              value={String(pageSize)}
              onValueChange={(v) =>
                setSearch({ pageSize: Number(v) === 50 ? undefined : Number(v) })
              }
            >
              {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

              <SelectTrigger className="h-8 w-28" aria-label="Rows per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 200].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} / page
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0}
              onClick={() => setSearch({ page: page - 1 || undefined }, true)}
            >
              Previous
            </Button>
            <span>
              Page {page + 1} of {pageCount}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page + 1 >= pageCount}
              onClick={() => setSearch({ page: page + 1 }, true)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </ListWorkspace>
  );
}

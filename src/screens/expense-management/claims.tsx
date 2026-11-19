import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EditableLineItemGrid } from "@/components/common/EditableLineItemGrid";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { TotalsSummary } from "@/components/common/TotalsSummary";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { TransactionWorkspace } from "@/components/workspace/TransactionWorkspace";
import { FormControlShell, FormGrid } from "@/components/common/form-layout";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AccountLookup } from "@/components/lookup";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  emptyDraftLine,
  splitDraftLine,
  toClaimLineInputs,
  type ExpenseDraftLineForm,
} from "@/lib/expenses/draft-lines";
import { createEmptyDocumentLines } from "@/lib/ui/document-line-defaults";
import { interpretLineGridKey } from "@/lib/ui/line-grid-keyboard";
import { parseLineGridClipboard } from "@/lib/ui/line-grid-paste";
import { minorOrZero } from "@/lib/purchases/money-input";
import {
  deleteExpenseClaimDraft,
  duplicateExpenseClaim,
  EXPENSE_CLAIM_MIGRATION,
  linkExpenseClaimCashAdvance,
  linkExpenseClaimCorporateCard,
  linkExpenseClaimPettyCashFloat,
  listExpenseCashAdvances,
  listExpenseClaimTemplates,
  listExpenseClaims,
  listExpenseCorporateCards,
  listExpensePettyCashFloats,
  saveExpenseClaim,
  saveExpenseClaimTemplate,
  submitExpenseClaim,
  withdrawExpenseClaim,
} from "@/lib/expenses/expenses.functions";
import type { ExpensePaymentSource } from "@/lib/expenses/types";
import {
  enqueueOfflineExpenseClaimDraft,
  isBrowserOffline,
  listOfflineExpenseClaimDrafts,
  removeOfflineExpenseClaimDraft,
  type OfflineExpenseClaimDraft,
} from "@/lib/expenses/offline-claim-queue";
import { expenseQueryOptions } from "@/lib/expenses/query-options";
import type { ExpenseManagementSectionKey } from "@/lib/expenses/sections";
import { ExpenseManagementLoadingShell } from "@/components/expenses/ExpenseManagementLoadingShell";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import type { Permission } from "@/lib/permissions";

function parseMinorNumber(value: string, label: string): number {
  return Number(parseMinorOrThrow(value, label));
}

export function ExpenseManagementClaimsPage({
  mode,
  forceCreate = false,
}: {
  mode: "my-expenses" | "claims";
  forceCreate?: boolean;
}) {
  const sectionKey: ExpenseManagementSectionKey = mode;
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const queryClient = useQueryClient();
  const currency = company?.base_currency ?? "USD";
  const today = new Date().toISOString().slice(0, 10);
  const canSubmit = can("expenses.submit" as Permission);
  const canViewAll =
    can("expenses.view" as Permission) ||
    can("expenses.approve" as Permission) ||
    can("expenses.audit" as Permission) ||
    can("expenses.admin" as Permission);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [paymentSource, setPaymentSource] = useState<ExpensePaymentSource>("employee_paid");
  const [cashAdvanceId, setCashAdvanceId] = useState("");
  const [pettyCashFloatId, setPettyCashFloatId] = useState("");
  const [corporateCardId, setCorporateCardId] = useState("");
  const [lines, setLines] = useState<ExpenseDraftLineForm[]>(() =>
    createEmptyDocumentLines(() => emptyDraftLine(today)),
  );

  useEffect(() => {
    if (!forceCreate || mode !== "my-expenses") return;
    const node = document.getElementById("expense-claim-create");
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
    node?.querySelector<HTMLInputElement>("input, textarea, select")?.focus();
  }, [forceCreate, mode]);
  const [splitLineKey, setSplitLineKey] = useState<string | null>(null);
  const [splitAccountA, setSplitAccountA] = useState("");
  const [splitAccountB, setSplitAccountB] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [offlineDrafts, setOfflineDrafts] = useState<OfflineExpenseClaimDraft[]>([]);
  const [isOffline, setIsOffline] = useState(false);

  const fetchClaims = useServerFn(listExpenseClaims);
  const fetchAccounts = useServerFn(listAccounts);
  const fetchTemplates = useServerFn(listExpenseClaimTemplates);
  const fetchAdvances = useServerFn(listExpenseCashAdvances);
  const fetchPettyFloats = useServerFn(listExpensePettyCashFloats);
  const fetchCards = useServerFn(listExpenseCorporateCards);
  const saveClaim = useServerFn(saveExpenseClaim);
  const linkAdvance = useServerFn(linkExpenseClaimCashAdvance);
  const linkPettyFloat = useServerFn(linkExpenseClaimPettyCashFloat);
  const linkCard = useServerFn(linkExpenseClaimCorporateCard);
  const submitClaim = useServerFn(submitExpenseClaim);
  const withdrawClaim = useServerFn(withdrawExpenseClaim);
  const deleteClaim = useServerFn(deleteExpenseClaimDraft);
  const duplicateClaim = useServerFn(duplicateExpenseClaim);
  const saveTemplate = useServerFn(saveExpenseClaimTemplate);

  const allowed = mode === "my-expenses" ? canSubmit || canViewAll : canViewAll;

  useEffect(() => {
    if (!company?.id || mode !== "my-expenses") return;
    const refresh = () => {
      setIsOffline(isBrowserOffline());
      setOfflineDrafts(listOfflineExpenseClaimDrafts(company.id));
    };
    refresh();
    window.addEventListener("online", refresh);
    window.addEventListener("offline", refresh);
    return () => {
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", refresh);
    };
  }, [company?.id, mode]);

  const claimsQ = useQuery({
    queryKey: ["expense-claims", company?.id, mode],
    queryFn: () =>
      fetchClaims({
        data: { companyId: company!.id, scope: mode === "claims" ? "all" : "own" },
      }),
    enabled: Boolean(company?.id) && allowed,
    ...expenseQueryOptions,
  });

  const accountsQ = useQuery({
    queryKey: ["accounts", company?.id, "expense-claims"],
    queryFn: () => fetchAccounts({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canSubmit && mode === "my-expenses",
    ...expenseQueryOptions,
  });

  const templatesQ = useQuery({
    queryKey: ["expense-claim-templates", company?.id],
    queryFn: () => fetchTemplates({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canSubmit && mode === "my-expenses",
    ...expenseQueryOptions,
  });

  const advancesQ = useQuery({
    queryKey: ["expense-cash-advances", company?.id, "claim-link"],
    queryFn: () => fetchAdvances({ data: { companyId: company!.id, scope: "own" } }),
    enabled:
      Boolean(company?.id) &&
      canSubmit &&
      mode === "my-expenses" &&
      paymentSource === "cash_advance",
  });

  const pettyFloatsQ = useQuery({
    queryKey: ["expense-petty-cash-floats", company?.id, "claim-link"],
    queryFn: () => fetchPettyFloats({ data: { companyId: company!.id } }),
    enabled:
      Boolean(company?.id) &&
      canSubmit &&
      mode === "my-expenses" &&
      paymentSource === "company_paid",
  });

  const cardsQ = useQuery({
    queryKey: ["expense-corporate-cards", company?.id, "claim-link"],
    queryFn: () => fetchCards({ data: { companyId: company!.id } }),
    enabled:
      Boolean(company?.id) &&
      canSubmit &&
      mode === "my-expenses" &&
      paymentSource === "corporate_card",
  });

  const openAdvances = useMemo(
    () =>
      (advancesQ.data ?? []).filter(
        (adv) =>
          (adv.status === "issued" || adv.status === "partially_settled") &&
          adv.remainingMinor > 0 &&
          adv.currencyCode === currency,
      ),
    [advancesQ.data, currency],
  );

  const openPettyFloats = useMemo(
    () =>
      (pettyFloatsQ.data ?? []).filter(
        (float) =>
          float.status === "active" && float.balanceMinor > 0 && float.currencyCode === currency,
      ),
    [pettyFloatsQ.data, currency],
  );

  const openCards = useMemo(
    () =>
      (cardsQ.data ?? []).filter(
        (card) => card.status === "active" && card.currencyCode === currency,
      ),
    [cardsQ.data, currency],
  );

  const expenseAccounts = useMemo(
    () =>
      (accountsQ.data ?? []).filter(
        (account) => account.is_active && account.is_postable && account.account_type === "expense",
      ),
    [accountsQ.data],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["expense-claims", company?.id] });
    void queryClient.invalidateQueries({ queryKey: ["expense-claim-templates", company?.id] });
    void queryClient.invalidateQueries({ queryKey: ["expense-management-overview", company?.id] });
  };

  const updateLine = (key: string, patch: Partial<ExpenseDraftLineForm>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const CLAIM_GRID_COLS = 5; // date, merchant, description, net, tax

  const onClaimLineKeyDown = (
    event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>,
    rowIndex: number,
    colIndex: number,
  ) => {
    const action = interpretLineGridKey(event.key, {
      shiftKey: event.shiftKey,
      atLastRow: rowIndex === lines.length - 1,
      atLastCol: colIndex === CLAIM_GRID_COLS - 1,
    });
    if (action.type === "none") return;
    if (action.type === "add-row") {
      event.preventDefault();
      setLines((current) => [...current, emptyDraftLine(today)]);
      queueMicrotask(() => {
        document
          .querySelector<HTMLElement>(`[data-claim-cell="${rowIndex + 1}-${colIndex}"]`)
          ?.focus();
      });
      return;
    }
    if (
      action.type === "move" &&
      (event.key === "Enter" || event.key === "ArrowDown" || event.key === "ArrowUp")
    ) {
      event.preventDefault();
      const nextRow = Math.max(0, Math.min(lines.length - 1, rowIndex + action.rowDelta));
      document.querySelector<HTMLElement>(`[data-claim-cell="${nextRow}-${colIndex}"]`)?.focus();
    }
  };

  const onClaimMoneyPaste = (
    event: ClipboardEvent<HTMLInputElement>,
    rowIndex: number,
    field: "netInput" | "taxInput",
  ) => {
    const grid = parseLineGridClipboard(event.clipboardData.getData("text"));
    if (grid.length <= 1 && (grid[0]?.length ?? 0) <= 1) return;
    event.preventDefault();
    setLines((current) => {
      const next = current.map((line) => ({ ...line }));
      for (let r = 0; r < grid.length; r++) {
        const targetRow = rowIndex + r;
        while (next.length <= targetRow) next.push(emptyDraftLine(today));
        const cells = grid[r] ?? [];
        const row = next[targetRow]!;
        if (field === "netInput") {
          next[targetRow] = {
            ...row,
            netInput: cells[0] ?? row.netInput,
            taxInput: cells[1] ?? row.taxInput,
          };
        } else {
          next[targetRow] = {
            ...row,
            taxInput: cells[0] ?? row.taxInput,
          };
        }
      }
      return next;
    });
  };

  const draftTotals = useMemo(() => {
    let net = 0n;
    let tax = 0n;
    for (const line of lines) {
      net += minorOrZero(line.netInput, currency);
      tax += minorOrZero(line.taxInput, currency);
    }
    return { net, tax, total: net + tax };
  }, [lines, currency]);

  const create = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Select a company first.");
      const claimLines = toClaimLineInputs(lines, currency, parseMinorNumber);
      for (const line of claimLines) {
        if (!line.description.trim()) throw new Error("Each line needs a description.");
        if (!line.accountId) throw new Error("Each line needs an expense account.");
      }
      if (paymentSource === "cash_advance" && !cashAdvanceId) {
        throw new Error("Select an issued cash advance to settle.");
      }
      if (paymentSource === "company_paid" && !pettyCashFloatId) {
        throw new Error("Select a petty cash float with enough balance.");
      }
      if (paymentSource === "corporate_card" && !corporateCardId) {
        throw new Error("Select a corporate card.");
      }
      const draft = {
        title: title.trim() || "Expense claim",
        description: description.trim() || undefined,
        claimDate: today,
        claimCurrency: currency,
        paymentSource,
        lines: claimLines,
      };
      if (isBrowserOffline()) {
        if (
          paymentSource === "cash_advance" ||
          paymentSource === "company_paid" ||
          paymentSource === "corporate_card"
        ) {
          throw new Error(
            "Cash-advance, petty-cash and corporate-card claims cannot be saved offline yet.",
          );
        }
        enqueueOfflineExpenseClaimDraft(company.id, draft);
        return { offline: true as const };
      }
      const saved = await saveClaim({
        data: {
          companyId: company.id,
          draft,
        },
      });
      if (paymentSource === "cash_advance" && cashAdvanceId) {
        return linkAdvance({
          data: {
            companyId: company.id,
            claimId: saved.id,
            version: saved.version,
            advanceId: cashAdvanceId,
          },
        });
      }
      if (paymentSource === "company_paid" && pettyCashFloatId) {
        return linkPettyFloat({
          data: {
            companyId: company.id,
            claimId: saved.id,
            version: saved.version,
            floatId: pettyCashFloatId,
          },
        });
      }
      if (paymentSource === "corporate_card" && corporateCardId) {
        return linkCard({
          data: {
            companyId: company.id,
            claimId: saved.id,
            version: saved.version,
            cardId: corporateCardId,
          },
        });
      }
      return saved;
    },
    onSuccess: (result) => {
      setTitle("");
      setDescription("");
      setPaymentSource("employee_paid");
      setCashAdvanceId("");
      setPettyCashFloatId("");
      setCorporateCardId("");
      setLines(Array.from({ length: 5 }, () => emptyDraftLine(today)));
      setTemplateName("");
      if (company?.id) setOfflineDrafts(listOfflineExpenseClaimDrafts(company.id));
      if (result && typeof result === "object" && "offline" in result && result.offline) {
        toast.success("Saved offline. It will sync when you are back online.");
        return;
      }
      invalidate();
      toast.success("Draft claim saved.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const syncOffline = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Select a company first.");
      if (isBrowserOffline()) throw new Error("Still offline.");
      const pending = listOfflineExpenseClaimDrafts(company.id);
      for (const item of pending) {
        await saveClaim({ data: { companyId: company.id, draft: item.draft } });
        removeOfflineExpenseClaimDraft(company.id, item.id);
      }
      return pending.length;
    },
    onSuccess: (count) => {
      if (company?.id) setOfflineDrafts(listOfflineExpenseClaimDrafts(company.id));
      invalidate();
      toast.success(
        count === 0 ? "No offline drafts to sync." : `Synced ${count} offline draft(s).`,
      );
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const saveAsTemplate = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Select a company first.");
      const claimLines = toClaimLineInputs(lines, currency, parseMinorNumber);
      return saveTemplate({
        data: {
          companyId: company.id,
          draft: {
            name: templateName.trim(),
            titleTemplate: title.trim() || "Expense claim",
            descriptionTemplate: description.trim() || null,
            claimCurrency: currency,
            paymentSource: "employee_paid",
            defaultLines: claimLines,
          },
        },
      });
    },
    onSuccess: () => {
      setTemplateName("");
      invalidate();
      toast.success("Template saved.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const submit = useMutation({
    mutationFn: (claim: { id: string; version: number }) =>
      submitClaim({
        data: { companyId: company!.id, claimId: claim.id, version: claim.version },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Claim submitted.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const withdraw = useMutation({
    mutationFn: (claim: { id: string; version: number }) =>
      withdrawClaim({
        data: { companyId: company!.id, claimId: claim.id, version: claim.version },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Claim withdrawn.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const remove = useMutation({
    mutationFn: (claim: { id: string; version: number }) =>
      deleteClaim({
        data: { companyId: company!.id, claimId: claim.id, version: claim.version },
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Draft deleted.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const duplicate = useMutation({
    mutationFn: (claimId: string) => duplicateClaim({ data: { companyId: company!.id, claimId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Claim duplicated as a new draft.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const applySplit = () => {
    const line = lines.find((row) => row.key === splitLineKey);
    if (!line) return;
    if (!splitAccountA || !splitAccountB) {
      toast.error("Choose two accounts for the equal split.");
      return;
    }
    const result = splitDraftLine(
      line,
      "equal",
      [
        { accountId: splitAccountA, label: "Split A" },
        { accountId: splitAccountB, label: "Split B" },
      ],
      currency,
      parseMinorNumber,
      (minor, code) => fromMinorUnits(minor, code),
    );
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setLines((current) => current.flatMap((row) => (row.key === line.key ? result.lines : [row])));
    setSplitLineKey(null);
    setSplitAccountA("");
    setSplitAccountB("");
    toast.success("Line split equally across two accounts.");
  };

  const applyTemplate = (templateId: string) => {
    const template = (templatesQ.data ?? []).find((row) => row.id === templateId);
    if (!template) return;
    setTitle(template.titleTemplate || template.name);
    setDescription(template.descriptionTemplate ?? "");
    setLines(
      template.defaultLines.length > 0
        ? template.defaultLines.map((line) => {
            const blank = emptyDraftLine(line.expenseDate || today);
            return {
              ...blank,
              merchantName: line.merchantName ?? "",
              description: line.description,
              accountId: line.accountId,
              netInput: fromMinorUnits(line.netMinor, currency),
              taxInput: fromMinorUnits(line.taxMinor, currency),
              reimbursable: (line.reimbursableMinor ?? line.grossMinor) > 0,
              isBillable: Boolean(line.isBillable),
            };
          })
        : Array.from({ length: 5 }, () => emptyDraftLine(today)),
    );
    toast.success(`Loaded template “${template.name}”.`);
  };

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!allowed) {
    return (
      <ListWorkspace
        title={mode === "my-expenses" ? "My Expenses" : "All Claims"}
        subnav={<ExpenseManagementSubnav current={sectionKey} />}
      >
        <EmptyState
          title="No access"
          description={
            mode === "my-expenses"
              ? "Ask an administrator for expenses.submit."
              : "Ask an administrator for expenses.view or expenses.approve."
          }
        />
      </ListWorkspace>
    );
  }
  if (claimsQ.isLoading) {
    return (
      <ExpenseManagementLoadingShell
        title={mode === "my-expenses" ? "My Expenses" : "All Claims"}
        current={sectionKey}
      />
    );
  }
  if (claimsQ.isError) {
    const message = friendlyAuthError(claimsQ.error);
    return (
      <ListWorkspace
        title={mode === "my-expenses" ? "My Expenses" : "All Claims"}
        subnav={<ExpenseManagementSubnav current={sectionKey} />}
      >
        {message.includes("202611071") ? (
          <Alert>
            <AlertTitle>Database update required</AlertTitle>
            <AlertDescription>
              {EXPENSE_CLAIM_MIGRATION} My Expenses will stay empty until migrations
              `20261107120000` and `20261107123000` (and later EM slices you need) are applied to
              this Supabase project.
            </AlertDescription>
          </Alert>
        ) : (
          <QueryErrorState queries={[claimsQ]} title="Could not load claims" />
        )}
      </ListWorkspace>
    );
  }

  const claims = claimsQ.data ?? [];

  // List is list-only. Create opens only via ?create=true → TransactionWorkspace.
  const createForm =
    mode === "my-expenses" && canSubmit && forceCreate ? (
      <form
        id="expense-claim-create"
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-base font-semibold">New multi-line draft</h2>
          {isOffline ? (
            <Alert className="mb-2">
              <AlertTitle>You are offline</AlertTitle>
              <AlertDescription>
                Saving stores this draft on this device until you sync.
              </AlertDescription>
            </Alert>
          ) : null}
          {offlineDrafts.length > 0 ? (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
              <span>{offlineDrafts.length} offline draft(s) waiting to sync.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={syncOffline.isPending || isOffline}
                onClick={() => syncOffline.mutate()}
              >
                {syncOffline.isPending ? "Syncing…" : "Sync now"}
              </Button>
            </div>
          ) : null}
          {(templatesQ.data?.length ?? 0) > 0 ? (
            <div className="grid gap-1">
              <Label htmlFor="em-template">Load template</Label>
              <RecordLookupSelect
                id="em-template"
                className="flex h-[var(--lb-control-height)] rounded-md border border-input bg-background px-3 text-sm"
                defaultValue=""
                onValueChange={(event) => {
                  if (event) applyTemplate(event);
                  event = "";
                }}
              >
                <option value="">Select template</option>
                {(templatesQ.data ?? []).map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </RecordLookupSelect>
            </div>
          ) : null}
        </div>

        <FormGrid columns={4}>
          <FormControlShell className="sm:col-span-2">
            <Label htmlFor="em-claim-title">Title</Label>
            <Input
              id="em-claim-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
            />
          </FormControlShell>
          <FormControlShell className="sm:col-span-2">
            <Label htmlFor="em-claim-desc">Description</Label>
            <Input
              id="em-claim-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </FormControlShell>
          <FormControlShell width="contact">
            <Label htmlFor="em-claim-source">Payment source</Label>
            <select
              id="em-claim-source"
              className="flex h-[var(--lb-control-height)] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={paymentSource}
              onChange={(event) => {
                const next = event.target.value as ExpensePaymentSource;
                setPaymentSource(next);
                if (next !== "cash_advance") setCashAdvanceId("");
                if (next !== "company_paid") setPettyCashFloatId("");
                if (next !== "corporate_card") setCorporateCardId("");
              }}
            >
              <option value="employee_paid">Employee paid (reimburse)</option>
              <option value="cash_advance">Cash advance (settle float)</option>
              <option value="company_paid">Petty cash (company paid)</option>
              <option value="corporate_card">Corporate card</option>
            </select>
          </FormControlShell>
          {paymentSource === "cash_advance" ? (
            <FormControlShell width="contact">
              <Label htmlFor="em-claim-advance">Cash advance</Label>
              <RecordLookupSelect
                id="em-claim-advance"
                className="flex h-[var(--lb-control-height)] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={cashAdvanceId}
                onValueChange={(event) => setCashAdvanceId(event)}
              >
                <option value="">Select issued advance</option>
                {openAdvances.map((adv) => (
                  <option key={adv.id} value={adv.id}>
                    {adv.advanceNumber} — remaining{" "}
                    {fromMinorUnits(adv.remainingMinor, adv.currencyCode)}
                  </option>
                ))}
              </RecordLookupSelect>
            </FormControlShell>
          ) : null}
          {paymentSource === "company_paid" ? (
            <FormControlShell width="contact">
              <Label htmlFor="em-claim-petty">Petty cash float</Label>
              <RecordLookupSelect
                id="em-claim-petty"
                className="flex h-[var(--lb-control-height)] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={pettyCashFloatId}
                onValueChange={(event) => setPettyCashFloatId(event)}
              >
                <option value="">Select float with balance</option>
                {openPettyFloats.map((float) => (
                  <option key={float.id} value={float.id}>
                    {float.floatNumber} — {float.name} (
                    {fromMinorUnits(float.balanceMinor, float.currencyCode)})
                  </option>
                ))}
              </RecordLookupSelect>
            </FormControlShell>
          ) : null}
          {paymentSource === "corporate_card" ? (
            <FormControlShell width="contact">
              <Label htmlFor="em-claim-card">Corporate card</Label>
              <RecordLookupSelect
                id="em-claim-card"
                className="flex h-[var(--lb-control-height)] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={corporateCardId}
                onValueChange={(event) => setCorporateCardId(event)}
              >
                <option value="">Select card</option>
                {openCards.map((card) => (
                  <option key={card.id} value={card.id}>
                    {card.label} ****{card.last4}
                  </option>
                ))}
              </RecordLookupSelect>
            </FormControlShell>
          ) : null}
        </FormGrid>

        <EditableLineItemGrid
          aria-label="Expense claim lines"
          columns={[
            { id: "date", header: "Date", widthPx: 132, minWidthPx: 112 },
            { id: "merchant", header: "Merchant", widthPx: 140, minWidthPx: 100 },
            {
              id: "description",
              header: "Description",
              widthPx: 220,
              minWidthPx: 160,
              fluid: true,
            },
            { id: "account", header: "Account", widthPx: 180, minWidthPx: 140 },
            {
              id: "net",
              header: `Net (${currency})`,
              align: "right",
              widthPx: 112,
              minWidthPx: 88,
            },
            { id: "tax", header: "Tax", align: "right", widthPx: 96, minWidthPx: 72 },
            { id: "actions", header: "", widthPx: 96, minWidthPx: 80, resizable: false },
          ]}
          onAddRow={() => setLines((current) => [...current, emptyDraftLine(today)])}
          addRowLabel="Add line"
          footerStart={
            <Button type="submit" size="sm" disabled={create.isPending}>
              {create.isPending ? "Saving…" : "Save draft"}
            </Button>
          }
          footer={
            <TotalsSummary
              aria-label="Expense claim draft totals"
              lines={[
                {
                  id: "net",
                  label: "Net",
                  value: fromMinorUnits(Number(draftTotals.net), currency),
                },
                {
                  id: "tax",
                  label: "Tax",
                  value: fromMinorUnits(Number(draftTotals.tax), currency),
                  emphasis: "muted",
                },
                {
                  id: "total",
                  label: "Total",
                  value: fromMinorUnits(Number(draftTotals.total), currency),
                  emphasis: "total",
                },
              ]}
            />
          }
        >
          {lines.map((line, index) => (
            <TableRow key={line.key}>
              <TableCell className="align-top p-0">
                <Input
                  type="date"
                  data-claim-cell={`${index}-0`}
                  aria-label={`Line ${index + 1} date`}
                  value={line.expenseDate}
                  onChange={(event) => updateLine(line.key, { expenseDate: event.target.value })}
                  onKeyDown={(event) => onClaimLineKeyDown(event, index, 0)}
                />
              </TableCell>
              <TableCell className="align-top p-0">
                <Input
                  data-claim-cell={`${index}-1`}
                  aria-label={`Line ${index + 1} merchant`}
                  value={line.merchantName}
                  onChange={(event) => updateLine(line.key, { merchantName: event.target.value })}
                  onKeyDown={(event) => onClaimLineKeyDown(event, index, 1)}
                  placeholder="Merchant"
                />
              </TableCell>
              <TableCell className="align-top p-0">
                <Textarea
                  data-claim-cell={`${index}-2`}
                  aria-label={`Line ${index + 1} description`}
                  value={line.description}
                  rows={1}
                  className="lb-spreadsheet-wrap min-h-8"
                  onChange={(event) => updateLine(line.key, { description: event.target.value })}
                  onKeyDown={(event) => onClaimLineKeyDown(event, index, 2)}
                  required
                />
              </TableCell>
              <TableCell className="align-middle p-0">
                <AccountLookup
                  ariaLabel={`Expense account for line ${index + 1}`}
                  purpose="expense"
                  accounts={expenseAccounts}
                  value={line.accountId}
                  onChange={(value) => updateLine(line.key, { accountId: value })}
                  companyId={company.id}
                  placeholder="Select expense account"
                  allowClear={false}
                />
              </TableCell>
              <TableCell className="align-top p-0">
                <Input
                  data-claim-cell={`${index}-3`}
                  aria-label={`Line ${index + 1} net`}
                  className="text-right"
                  inputMode="decimal"
                  value={line.netInput}
                  onChange={(event) => updateLine(line.key, { netInput: event.target.value })}
                  onKeyDown={(event) => onClaimLineKeyDown(event, index, 3)}
                  onPaste={(event) => onClaimMoneyPaste(event, index, "netInput")}
                  required
                />
              </TableCell>
              <TableCell className="align-top p-0">
                <Input
                  data-claim-cell={`${index}-4`}
                  aria-label={`Line ${index + 1} tax`}
                  className="text-right"
                  inputMode="decimal"
                  value={line.taxInput}
                  onChange={(event) => updateLine(line.key, { taxInput: event.target.value })}
                  onKeyDown={(event) => onClaimLineKeyDown(event, index, 4)}
                  onPaste={(event) => onClaimMoneyPaste(event, index, "taxInput")}
                />
              </TableCell>
              <TableCell className="align-top">
                <div className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setSplitLineKey(line.key)}
                  >
                    Split
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    disabled={lines.length === 1}
                    aria-label={`Remove line ${index + 1}`}
                    onClick={() =>
                      setLines((current) => current.filter((row) => row.key !== line.key))
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </EditableLineItemGrid>

        {splitLineKey ? (
          <div className="grid gap-3 rounded-md border border-dashed p-3">
            <p className="text-sm font-medium">Equal split across two accounts</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label>Account A</Label>
                <AccountLookup
                  ariaLabel="Split account A"
                  purpose="expense"
                  accounts={expenseAccounts}
                  value={splitAccountA}
                  onChange={setSplitAccountA}
                  companyId={company.id}
                  placeholder="Select account A"
                  allowClear={false}
                />
              </div>
              <div className="grid gap-2">
                <Label>Account B</Label>
                <AccountLookup
                  ariaLabel="Split account B"
                  purpose="expense"
                  accounts={expenseAccounts}
                  value={splitAccountB}
                  onChange={setSplitAccountB}
                  companyId={company.id}
                  placeholder="Select account B"
                  allowClear={false}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={applySplit}>
                Apply split
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setSplitLineKey(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 border-t pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-2">
            <Label htmlFor="em-template-name">Save current lines as template</Label>
            <Input
              id="em-template-name"
              value={templateName}
              onChange={(event) => setTemplateName(event.target.value)}
              placeholder="Template name"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={saveAsTemplate.isPending || !templateName.trim()}
            onClick={() => saveAsTemplate.mutate()}
          >
            {saveAsTemplate.isPending ? "Saving…" : "Save template"}
          </Button>
        </div>
      </form>
    ) : null;

  if (forceCreate && createForm) {
    return (
      <TransactionWorkspace
        title="New expense claim"
        description="Multi-line draft with equal splits and templates. Saving does not post until you submit and an approver acts."
        breadcrumbs={[
          { label: "Expenses", to: "/expense-management" },
          { label: "My Expenses" },
          { label: "New" },
        ]}
        meta={<StatusBadge status="draft" label="Draft" />}
        stickyActions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link
                to="/expense-management/$section"
                params={{ section: "my-expenses" }}
                search={{}}
              >
                Cancel
              </Link>
            </Button>
            <Button size="sm" disabled={create.isPending} onClick={() => create.mutate()}>
              {create.isPending ? "Saving…" : "Save draft"}
            </Button>
          </div>
        }
      >
        {createForm}
      </TransactionWorkspace>
    );
  }

  return (
    <ListWorkspace
      title={mode === "my-expenses" ? "My Expenses" : "All Claims"}
      description={
        mode === "my-expenses"
          ? "Multi-line drafts, equal splits, templates, submit and withdraw."
          : "Organisation-wide expense claims visible to finance and approvers."
      }
      subnav={<ExpenseManagementSubnav current={sectionKey} />}
      actions={
        mode === "my-expenses" && canSubmit ? (
          <Button size="sm" asChild>
            <Link
              to="/expense-management/$section"
              params={{ section: "my-expenses" }}
              search={{ create: true }}
            >
              New expense claim
            </Link>
          </Button>
        ) : undefined
      }
    >
      {claims.length === 0 ? (
        <EmptyState
          title="No claims yet"
          description={
            mode === "my-expenses"
              ? "Use New expense claim to start a multi-line draft."
              : "No organisation claims are visible yet."
          }
          action={
            mode === "my-expenses" && canSubmit ? (
              <Button size="sm" asChild>
                <Link
                  to="/expense-management/$section"
                  params={{ section: "my-expenses" }}
                  search={{ create: true }}
                >
                  New expense claim
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Number</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {claims.map((claim) => (
              <TableRow key={claim.id}>
                <TableCell className="font-medium">
                  <Link
                    to="/expense-management/claims/$claimId"
                    params={{ claimId: claim.id }}
                    className="underline-offset-2 hover:underline"
                  >
                    {claim.claimNumber}
                  </Link>
                </TableCell>
                <TableCell>{claim.title}</TableCell>
                <TableCell>{claim.claimDate}</TableCell>
                <TableCell>
                  <StatusBadge status={claim.approvalStatus} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {fromMinorUnits(claim.totalMinor, claim.claimCurrency)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {canSubmit ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={duplicate.isPending}
                        onClick={() => duplicate.mutate(claim.id)}
                      >
                        Duplicate
                      </Button>
                    ) : null}
                    {mode === "my-expenses" && claim.approvalStatus === "draft" ? (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={submit.isPending}
                          onClick={() => submit.mutate(claim)}
                        >
                          Submit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(claim)}
                        >
                          Delete
                        </Button>
                      </>
                    ) : null}
                    {mode === "my-expenses" &&
                    (claim.approvalStatus === "submitted" ||
                      claim.approvalStatus === "in_review") ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={withdraw.isPending}
                        onClick={() => withdraw.mutate(claim)}
                      >
                        Withdraw
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </ListWorkspace>
  );
}

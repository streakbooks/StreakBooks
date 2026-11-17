import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { AccountLookup } from "@/components/lookup";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  EXPENSE_MANAGEMENT_MIGRATION,
  EXPENSE_NOTIFICATIONS_MIGRATION,
  getExpenseManagementSettings,
  importLegacyEmployeeExpenseClaims,
  previewLegacyEmployeeExpenseMigration,
  saveExpenseManagementSettings,
} from "@/lib/expenses/expenses.functions";
import { formatLegacyImportSummary } from "@/lib/expenses/legacy-migration";
import type { ExpenseDistanceUnit, ExpenseManagementSettings } from "@/lib/expenses/types";
import type { Permission } from "@/lib/permissions";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fromMinorUnits } from "@/lib/accounting/money";

type Draft = {
  version: number;
  enabled: boolean;
  claimNumberPrefix: string;
  defaultClaimCurrency: string;
  employeePayableAccountId: string;
  employeeAdvanceAccountId: string;
  pettyCashAccountId: string;
  rebillingIncomeAccountId: string;
  requireReceiptAboveMinor: string;
  requireSpendingRequestAboveMinor: string;
  allowMultiCurrencyClaims: boolean;
  preventSelfApproval: boolean;
  defaultDistanceUnit: ExpenseDistanceUnit;
};

function toDraft(settings: ExpenseManagementSettings): Draft {
  return {
    version: settings.version,
    enabled: settings.enabled,
    claimNumberPrefix: settings.claimNumberPrefix,
    defaultClaimCurrency: settings.defaultClaimCurrency ?? "",
    employeePayableAccountId: settings.employeePayableAccountId ?? "",
    employeeAdvanceAccountId: settings.employeeAdvanceAccountId ?? "",
    pettyCashAccountId: settings.pettyCashAccountId ?? "",
    rebillingIncomeAccountId: settings.rebillingIncomeAccountId ?? "",
    requireReceiptAboveMinor: String(settings.requireReceiptAboveMinor),
    requireSpendingRequestAboveMinor: String(settings.requireSpendingRequestAboveMinor),
    allowMultiCurrencyClaims: settings.allowMultiCurrencyClaims,
    preventSelfApproval: settings.preventSelfApproval,
    defaultDistanceUnit: settings.defaultDistanceUnit,
  };
}

export function ExpenseManagementSettingsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canEdit =
    can("expenses.manage_policies" as Permission) || can("expenses.admin" as Permission);
  const canMigrate =
    can("expenses.admin" as Permission) || can("expenses.manage_policies" as Permission);
  const canView =
    canEdit || can("expenses.view" as Permission) || can("expenses.submit" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getExpenseManagementSettings);
  const saveSettings = useServerFn(saveExpenseManagementSettings);
  const fetchAccounts = useServerFn(listAccounts);
  const fetchLegacyPreview = useServerFn(previewLegacyEmployeeExpenseMigration);
  const runLegacyImport = useServerFn(importLegacyEmployeeExpenseClaims);
  const [draft, setDraft] = useState<Draft | null>(null);

  const settingsQ = useQuery({
    queryKey: ["expense-management-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
  });

  const accountsQ = useQuery({
    queryKey: ["accounts", company?.id, "expense-settings"],
    queryFn: () => fetchAccounts({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
  });

  const legacyQ = useQuery({
    queryKey: ["legacy-employee-expense-migration", company?.id],
    queryFn: () => fetchLegacyPreview({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canMigrate,
    retry: false,
  });

  const importMut = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Select a company first.");
      return runLegacyImport({ data: { companyId: company.id, limit: 50 } });
    },
    onSuccess: (result) => {
      toast.success(formatLegacyImportSummary(result));
      void queryClient.invalidateQueries({
        queryKey: ["legacy-employee-expense-migration", company?.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["expense-claims"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const liabilityAccounts = useMemo(
    () =>
      (accountsQ.data ?? []).filter(
        (account) =>
          account.is_active && account.is_postable && account.account_type === "liability",
      ),
    [accountsQ.data],
  );

  const assetAccounts = useMemo(
    () =>
      (accountsQ.data ?? []).filter(
        (account) => account.is_active && account.is_postable && account.account_type === "asset",
      ),
    [accountsQ.data],
  );

  const incomeAccounts = useMemo(
    () =>
      (accountsQ.data ?? []).filter(
        (account) => account.is_active && account.is_postable && account.account_type === "income",
      ),
    [accountsQ.data],
  );

  useEffect(() => {
    if (settingsQ.data) setDraft(toDraft(settingsQ.data));
  }, [settingsQ.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!company || !draft) throw new Error("Nothing to save.");
      const threshold = Number(draft.requireReceiptAboveMinor);
      if (!Number.isSafeInteger(threshold) || threshold < 0) {
        throw new Error("Receipt threshold must be a whole number of minor units ≥ 0.");
      }
      const spendThreshold = Number(draft.requireSpendingRequestAboveMinor);
      if (!Number.isSafeInteger(spendThreshold) || spendThreshold < 0) {
        throw new Error("Spending-request threshold must be a whole number of minor units ≥ 0.");
      }
      return saveSettings({
        data: {
          companyId: company.id,
          draft: {
            version: draft.version,
            enabled: draft.enabled,
            claimNumberPrefix: draft.claimNumberPrefix.trim(),
            defaultClaimCurrency: draft.defaultClaimCurrency.trim()
              ? draft.defaultClaimCurrency.trim().toUpperCase()
              : null,
            requireReceiptAboveMinor: threshold,
            requireSpendingRequestAboveMinor: spendThreshold,
            employeePayableAccountId: draft.employeePayableAccountId || null,
            employeeAdvanceAccountId: draft.employeeAdvanceAccountId || null,
            pettyCashAccountId: draft.pettyCashAccountId || null,
            rebillingIncomeAccountId: draft.rebillingIncomeAccountId || null,
            allowMultiCurrencyClaims: draft.allowMultiCurrencyClaims,
            preventSelfApproval: draft.preventSelfApproval,
            defaultDistanceUnit: draft.defaultDistanceUnit,
          },
        },
      });
    },
    onSuccess: (saved) => {
      setDraft(toDraft(saved));
      void queryClient.invalidateQueries({
        queryKey: ["expense-management-settings", company?.id],
      });
      toast.success("Expense settings saved.");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Expense settings">
        <EmptyState
          title="No access"
          description="Ask an administrator for expenses.manage_policies."
        />
      </ListWorkspace>
    );
  }
  if (settingsQ.isPending || !draft) return <LoadingState />;
  if (settingsQ.isError) {
    const message = friendlyAuthError(settingsQ.error);
    const migrationPending = message.includes("20261107120000");
    return (
      <ListWorkspace
        title="Expense settings"
        description="Policies, numbering and account defaults."
        subnav={<ExpenseManagementSubnav current="settings" />}
      >
        {migrationPending ? (
          <Alert>
            <AlertTitle>Migration required</AlertTitle>
            <AlertDescription>{EXPENSE_MANAGEMENT_MIGRATION}</AlertDescription>
          </Alert>
        ) : (
          <ErrorState
            title="Could not load expense settings"
            description={message}
            onRetry={() => settingsQ.refetch()}
          />
        )}
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Expense settings"
      description="Organisation defaults for Expenses."
      actions={
        canEdit ? (
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save settings"}
          </Button>
        ) : null
      }
      subnav={<ExpenseManagementSubnav current="settings" />}
    >
      {!settingsQ.data.exists ? (
        <Alert className="mb-6">
          <AlertTitle>Using defaults</AlertTitle>
          <AlertDescription>
            No saved settings row yet. Saving creates one for this organisation.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid max-w-2xl gap-6">
        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <Label htmlFor="em-enabled">Enable Expenses</Label>
            <p className="text-sm text-muted-foreground">
              Turns on the module for this organisation once workflows are ready.
            </p>
          </div>
          <Switch
            id="em-enabled"
            checked={draft.enabled}
            disabled={!canEdit || save.isPending}
            onCheckedChange={(checked) => setDraft({ ...draft, enabled: checked })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="em-prefix">Claim number prefix</Label>
          <Input
            id="em-prefix"
            value={draft.claimNumberPrefix}
            disabled={!canEdit || save.isPending}
            maxLength={12}
            onChange={(event) => setDraft({ ...draft, claimNumberPrefix: event.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="em-currency">Default claim currency</Label>
          <Input
            id="em-currency"
            value={draft.defaultClaimCurrency}
            disabled={!canEdit || save.isPending}
            placeholder={company.base_currency ?? "USD"}
            maxLength={3}
            onChange={(event) =>
              setDraft({ ...draft, defaultClaimCurrency: event.target.value.toUpperCase() })
            }
          />
        </div>

        <div className="grid gap-2">
          <Label>Employee payable account</Label>
          <AccountLookup
            companyId={company.id}
            accounts={liabilityAccounts}
            value={draft.employeePayableAccountId}
            onChange={(next) => setDraft({ ...draft, employeePayableAccountId: next ?? "" })}
            allowClear
            disabled={!canEdit || save.isPending}
            ariaLabel="Employee payable account"
            purpose="posting"
          />
          <p className="text-sm text-muted-foreground">
            Required before posting approved employee-paid claims (EM-06 accrual).
          </p>
        </div>

        <div className="grid gap-2">
          <Label>Employee advance account</Label>
          <AccountLookup
            companyId={company.id}
            accounts={assetAccounts}
            value={draft.employeeAdvanceAccountId}
            onChange={(next) => setDraft({ ...draft, employeeAdvanceAccountId: next ?? "" })}
            allowClear
            disabled={!canEdit || save.isPending}
            ariaLabel="Employee advance account"
            purpose="posting"
          />
          <p className="text-sm text-muted-foreground">
            Asset cleared when cash-advance claims are posted (EM-08b). Required before issuing
            advances.
          </p>
        </div>

        <div className="grid gap-2">
          <Label>Petty cash account</Label>
          <AccountLookup
            companyId={company.id}
            accounts={assetAccounts}
            value={draft.pettyCashAccountId}
            onChange={(next) => setDraft({ ...draft, pettyCashAccountId: next ?? "" })}
            allowClear
            disabled={!canEdit || save.isPending}
            ariaLabel="Petty cash account"
            purpose="posting"
          />
          <p className="text-sm text-muted-foreground">
            Asset funded from bank and credited when company-paid petty cash claims post (EM-08c).
          </p>
        </div>

        <div className="grid gap-2">
          <Label>Rebilling income account</Label>
          <AccountLookup
            companyId={company.id}
            accounts={incomeAccounts}
            value={draft.rebillingIncomeAccountId}
            onChange={(next) => setDraft({ ...draft, rebillingIncomeAccountId: next ?? "" })}
            allowClear
            disabled={!canEdit || save.isPending}
            ariaLabel="Rebilling income account"
            purpose="posting"
          />
          <p className="text-sm text-muted-foreground">
            Income account used when creating a customer invoice from a billable claim (EM-09b).
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="em-receipt">Require receipt above (minor units)</Label>
          <Input
            id="em-receipt"
            inputMode="numeric"
            value={draft.requireReceiptAboveMinor}
            disabled={!canEdit || save.isPending}
            onChange={(event) =>
              setDraft({ ...draft, requireReceiptAboveMinor: event.target.value })
            }
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="em-spend-req">
            Require approved spending request above (minor units)
          </Label>
          <Input
            id="em-spend-req"
            inputMode="numeric"
            value={draft.requireSpendingRequestAboveMinor}
            disabled={!canEdit || save.isPending}
            onChange={(event) =>
              setDraft({ ...draft, requireSpendingRequestAboveMinor: event.target.value })
            }
          />
          <p className="text-sm text-muted-foreground">
            Set to 0 to disable. Claims at or above this amount must link an approved spending
            request before submit.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="em-distance">Default distance unit</Label>
          <select
            id="em-distance"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={draft.defaultDistanceUnit}
            disabled={!canEdit || save.isPending}
            onChange={(event) =>
              setDraft({
                ...draft,
                defaultDistanceUnit: event.target.value as ExpenseDistanceUnit,
              })
            }
          >
            <option value="km">Kilometres</option>
            <option value="mi">Miles</option>
          </select>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <Label htmlFor="em-fx">Allow multi-currency claims</Label>
            <p className="text-sm text-muted-foreground">
              When disabled, claim lines must match the claim currency.
            </p>
          </div>
          <Switch
            id="em-fx"
            checked={draft.allowMultiCurrencyClaims}
            disabled={!canEdit || save.isPending}
            onCheckedChange={(checked) => setDraft({ ...draft, allowMultiCurrencyClaims: checked })}
          />
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
          <div>
            <Label htmlFor="em-self">Prevent self-approval</Label>
            <p className="text-sm text-muted-foreground">
              Claimants cannot approve their own claims when enabled.
            </p>
          </div>
          <Switch
            id="em-self"
            checked={draft.preventSelfApproval}
            disabled={!canEdit || save.isPending}
            onCheckedChange={(checked) => setDraft({ ...draft, preventSelfApproval: checked })}
          />
        </div>
      </div>

      {canMigrate ? (
        <section className="mt-10 space-y-4 border-t pt-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Legacy employee claim import</h2>
              <p className="text-sm text-muted-foreground">
                Copy unmigrated Purchases employee expense claims into Expenses as drafts. Journals
                and payments are not re-posted.
              </p>
            </div>
            <Button
              size="sm"
              disabled={
                importMut.isPending || legacyQ.isLoading || (legacyQ.data?.pendingCount ?? 0) === 0
              }
              onClick={() => importMut.mutate()}
            >
              {importMut.isPending ? "Importing…" : "Import next 50 drafts"}
            </Button>
          </div>

          {legacyQ.isLoading ? (
            <LoadingState />
          ) : legacyQ.isError ? (
            friendlyAuthError(legacyQ.error).includes("20261107148000") ? (
              <Alert>
                <AlertTitle>Database update required</AlertTitle>
                <AlertDescription>{EXPENSE_NOTIFICATIONS_MIGRATION}</AlertDescription>
              </Alert>
            ) : (
              <ErrorState
                title="Could not preview legacy claims"
                description={friendlyAuthError(legacyQ.error)}
                onRetry={() => legacyQ.refetch()}
              />
            )
          ) : (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <span>{legacyQ.data?.pendingCount ?? 0} pending</span>
                <span className="text-muted-foreground">·</span>
                <span>{legacyQ.data?.alreadyImportedCount ?? 0} already imported</span>
              </div>
              {(legacyQ.data?.sample.length ?? 0) === 0 ? (
                <EmptyState
                  title="Nothing left to import"
                  description="All legacy employee expense claims are already linked, or none exist."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(legacyQ.data?.sample ?? []).map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.claimDate}</TableCell>
                        <TableCell>{row.description}</TableCell>
                        <TableCell>{row.status}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fromMinorUnits(row.amountMinor, row.currencyCode || "USD")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </section>
      ) : null}
    </ListWorkspace>
  );
}

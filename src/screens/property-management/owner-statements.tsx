import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PmSubnav } from "@/components/property-management/PmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getPmSettings, listPmOwners, listPmProperties } from "@/lib/property-management/pm.functions";
import {
  approvePmOwnerStatement,
  generatePmOwnerStatement,
  getPmOwnerStatement,
  listPmOwnerStatements,
  publishPmOwnerStatement,
} from "@/lib/property-management/pm-ops.functions";
import { statementTotalsBalance } from "@/lib/property-management/ops-types";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

function monthStartEnd(isoMonth: string): { start: string; end: string } {
  const parts = isoMonth.split("-").map(Number);
  const y = parts[0] ?? new Date().getUTCFullYear();
  const m = parts[1] ?? 1;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function formatMinor(amount: number, currency: string): string {
  return `${(amount / 100).toFixed(2)} ${currency}`;
}

export function PmOwnerStatementsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("property.statements.view" as Permission);
  const canGenerate = can("property.statements.generate" as Permission);
  const canApprove = can("property.statements.approve" as Permission);
  const canPublish = can("property.statements.publish" as Permission);
  const queryClient = useQueryClient();

  const fetchSettings = useServerFn(getPmSettings);
  const fetchOwners = useServerFn(listPmOwners);
  const fetchProperties = useServerFn(listPmProperties);
  const fetchStatements = useServerFn(listPmOwnerStatements);
  const fetchStatement = useServerFn(getPmOwnerStatement);
  const generateStatement = useServerFn(generatePmOwnerStatement);
  const approveStatement = useServerFn(approvePmOwnerStatement);
  const publishStatement = useServerFn(publishPmOwnerStatement);

  const [ownerId, setOwnerId] = useState("");
  const [propertyId, setPropertyId] = useState("all");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [selectedId, setSelectedId] = useState("");
  const [showForm, setShowForm] = useState(false);

  const settings = useQuery({
    queryKey: ["pm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const owners = useQuery({
    queryKey: ["pm-owners", company?.id, ""],
    queryFn: () => fetchOwners({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });
  const properties = useQuery({
    queryKey: ["pm-properties", company?.id, ""],
    queryFn: () => fetchProperties({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canGenerate && showForm,
    retry: false,
  });
  const statements = useQuery({
    queryKey: ["pm-owner-statements", company?.id],
    queryFn: () => fetchStatements({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["pm-owner-statement", company?.id, selectedId],
    queryFn: () =>
      fetchStatement({ data: { companyId: company!.id, statementId: selectedId } }),
    enabled: Boolean(company?.id) && Boolean(selectedId),
    retry: false,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!company || !ownerId) throw new Error("Select an owner");
      const { start, end } = monthStartEnd(month);
      return generateStatement({
        data: {
          companyId: company.id,
          ownerId,
          propertyId: propertyId === "all" ? null : propertyId,
          periodStart: start,
          periodEnd: end,
          basis: "accrual",
        },
      });
    },
    onSuccess: async (statement) => {
      toast.success(`Statement ${statement.statementNumber} calculated`);
      setSelectedId(statement.id);
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["pm-owner-statements", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!company || !selectedId) throw new Error("Select a statement");
      return approveStatement({ data: { companyId: company.id, statementId: selectedId } });
    },
    onSuccess: async () => {
      toast.success("Statement approved and snapshot locked");
      await queryClient.invalidateQueries({ queryKey: ["pm-owner-statements", company?.id] });
      await queryClient.invalidateQueries({
        queryKey: ["pm-owner-statement", company?.id, selectedId],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!company || !selectedId) throw new Error("Select a statement");
      return publishStatement({ data: { companyId: company.id, statementId: selectedId } });
    },
    onSuccess: async () => {
      toast.success("Statement published");
      await queryClient.invalidateQueries({ queryKey: ["pm-owner-statements", company?.id] });
      await queryClient.invalidateQueries({
        queryKey: ["pm-owner-statement", company?.id, selectedId],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Owner Statements" description="Owner settlement statements."
      subnav={<PmSubnav current="owner-statements" />}
    >
        <EmptyState
          title="No access"
          description="Ask an administrator for property.statements.view."
        />
      </ListWorkspace>
    );
  }

  const statement = detail.data?.statement;
  const balanced = statement ? statementTotalsBalance(statement) : false;

  return (
    <ListWorkspace
      title="Owner Statements"
      description="Native owner settlement — not a filtered P&L. Approval freezes an immutable snapshot."
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: "Owner Statements" },
      ]}
      actions={
        canGenerate ? (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "Generate statement"}
          </Button>
        ) : null
      }
      subnav={<PmSubnav current="owner-statements" />}
    >
      <Alert className="mb-4">
        <AlertTitle>Accounting boundary</AlertTitle>
        <AlertDescription>
          Statement generation allocates operational amounts for review. Ledger posting of rent,
          commissions and payouts remains gated to authorised accounting batches — this workspace
          will not silently invent journals.
        </AlertDescription>
      </Alert>
      {!settings.data?.enabled ? (
        <EmptyState title="Module disabled" description="Enable Property Management in Settings." />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="min-w-0 space-y-4">
            {showForm && canGenerate ? (
              <Card>
                <CardHeader>
                  <CardTitle>Generate</CardTitle>
                  <CardDescription>
                    Pulls rent charges and reservation owner shares for the period.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label>Owner</Label>
                    <Select value={ownerId || undefined} onValueChange={setOwnerId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select owner" />
                      </SelectTrigger>
                      <SelectContent>
                        {(owners.data ?? []).map((owner) => (
                          <SelectItem key={owner.id} value={owner.id}>
                            {owner.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label>Property scope</Label>
                    <Select value={propertyId} onValueChange={setPropertyId}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All owned properties</SelectItem>
                        {(properties.data ?? []).map((property) => (
                          <SelectItem key={property.id} value={property.id}>
                            {property.code} — {property.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="pm-stmt-month">Period</Label>
                    <Input
                      id="pm-stmt-month"
                      type="month"
                      value={month}
                      onChange={(e) => setMonth(e.target.value)}
                    />
                  </div>
                  <Button
                    type="button"
                    disabled={!ownerId || generateMutation.isPending}
                    onClick={() => generateMutation.mutate()}
                  >
                    {generateMutation.isPending ? "Calculating…" : "Calculate statement"}
                  </Button>
                </CardContent>
              </Card>
            ) : null}

            {statements.isLoading ? <LoadingState /> : null}
            {statements.isError ? (
              <ErrorState
                title="Could not load statements"
                description={friendlyAuthError(statements.error)}
                onRetry={() => statements.refetch()}
              />
            ) : null}
            {statements.data?.length === 0 ? (
              <EmptyState
                title="No statements yet"
                description="Generate a statement for an owner and period."
              />
            ) : null}
            {statements.data && statements.data.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Number</th>
                      <th className="px-3 py-2 font-medium">Period</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Closing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statements.data.map((row) => (
                      <tr
                        key={row.id}
                        className={
                          selectedId === row.id
                            ? "border-t border-border/70 bg-primary/5"
                            : "border-t border-border/70"
                        }
                      >
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            className="font-medium text-primary underline-offset-2 hover:underline"
                            onClick={() => setSelectedId(row.id)}
                          >
                            {row.statementNumber}
                          </button>
                        </td>
                        <td className="px-3 py-2 tabular-nums">
                          {row.periodStart} → {row.periodEnd}
                        </td>
                        <td className="px-3 py-2">{row.status.replaceAll("_", " ")}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {formatMinor(row.closingBalanceMinor, row.currencyCode)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="min-w-0">
            {!selectedId ? (
              <EmptyState
                title="Select a statement"
                description="Choose a statement on the left to inspect lines, totals and approvals."
              />
            ) : detail.isLoading ? (
              <LoadingState />
            ) : detail.isError ? (
              <ErrorState
                title="Could not load statement"
                description={friendlyAuthError(detail.error)}
                onRetry={() => detail.refetch()}
              />
            ) : statement ? (
              <Card>
                <CardHeader>
                  <CardTitle>{statement.statementNumber}</CardTitle>
                  <CardDescription>
                    {statement.periodStart} → {statement.periodEnd} · {statement.basis} ·{" "}
                    {statement.status.replaceAll("_", " ")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <p className="text-sm">
                      Opening:{" "}
                      <span className="tabular-nums font-medium">
                        {formatMinor(statement.openingBalanceMinor, statement.currencyCode)}
                      </span>
                    </p>
                    <p className="text-sm">
                      Income:{" "}
                      <span className="tabular-nums font-medium">
                        {formatMinor(statement.incomeMinor, statement.currencyCode)}
                      </span>
                    </p>
                    <p className="text-sm">
                      Expenses:{" "}
                      <span className="tabular-nums font-medium">
                        {formatMinor(statement.expensesMinor, statement.currencyCode)}
                      </span>
                    </p>
                    <p className="text-sm">
                      Fees:{" "}
                      <span className="tabular-nums font-medium">
                        {formatMinor(statement.feesMinor, statement.currencyCode)}
                      </span>
                    </p>
                    <p className="text-sm">
                      Closing:{" "}
                      <span className="tabular-nums font-medium">
                        {formatMinor(statement.closingBalanceMinor, statement.currencyCode)}
                      </span>
                    </p>
                    <p className="text-sm">
                      Available:{" "}
                      <span className="tabular-nums font-medium">
                        {formatMinor(
                          statement.availableForDistributionMinor,
                          statement.currencyCode,
                        )}
                      </span>
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Totals {balanced ? "reconcile" : "do not reconcile"} opening → closing.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {canApprove ? (
                      <Button
                        type="button"
                        disabled={
                          !balanced ||
                          approveMutation.isPending ||
                          ["approved", "published", "paid", "closed"].includes(statement.status)
                        }
                        onClick={() => approveMutation.mutate()}
                      >
                        {approveMutation.isPending ? "Approving…" : "Approve & lock snapshot"}
                      </Button>
                    ) : null}
                    {canPublish ? (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={
                          statement.status !== "approved" || publishMutation.isPending
                        }
                        onClick={() => publishMutation.mutate()}
                      >
                        {publishMutation.isPending ? "Publishing…" : "Publish"}
                      </Button>
                    ) : null}
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-muted/50 text-left">
                        <tr>
                          <th className="px-3 py-2 font-medium">Section</th>
                          <th className="px-3 py-2 font-medium">Description</th>
                          <th className="px-3 py-2 font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(detail.data?.lines ?? []).map((line) => (
                          <tr key={line.id} className="border-t border-border/70">
                            <td className="px-3 py-2">{line.section}</td>
                            <td className="px-3 py-2">{line.description}</td>
                            <td className="px-3 py-2 tabular-nums">
                              {formatMinor(line.amountMinor, statement.currencyCode)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </div>
      )}
    </ListWorkspace>
  );
}

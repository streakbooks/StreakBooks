import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PmSubnav } from "@/components/property-management/PmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getPmSettings, listPmOwners } from "@/lib/property-management/pm.functions";
import {
  approvePmOwnerDistribution,
  listPmOwnerDistributions,
  postPmOwnerDistribution,
  upsertPmOwnerDistribution,
} from "@/lib/property-management/pm-posting.functions";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function PmOwnerPayoutsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("property.view" as Permission) ||
    can("property.payouts.prepare" as Permission) ||
    can("property.payouts.approve" as Permission) ||
    can("property.payouts.record" as Permission);
  const canPrepare = can("property.payouts.prepare" as Permission);
  const canApprove = can("property.payouts.approve" as Permission);
  const canRecord = can("property.payouts.record" as Permission);
  const queryClient = useQueryClient();

  const fetchSettings = useServerFn(getPmSettings);
  const fetchOwners = useServerFn(listPmOwners);
  const fetchDistributions = useServerFn(listPmOwnerDistributions);
  const createDistribution = useServerFn(upsertPmOwnerDistribution);
  const approveDistribution = useServerFn(approvePmOwnerDistribution);
  const postDistribution = useServerFn(postPmOwnerDistribution);

  const [showForm, setShowForm] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [memo, setMemo] = useState("");

  const settings = useQuery({
    queryKey: ["pm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const owners = useQuery({
    queryKey: ["pm-owners", company?.id],
    queryFn: () => fetchOwners({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });
  const distributions = useQuery({
    queryKey: ["pm-owner-distributions", company?.id],
    queryFn: () => fetchDistributions({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["pm-owner-distributions", company?.id] });
    await queryClient.invalidateQueries({ queryKey: ["pm-trust-summary", company?.id] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!company || !ownerId) throw new Error("Select an owner");
      const amountMinor = Math.round(Number(amount) * 100);
      if (!Number.isFinite(amountMinor) || amountMinor <= 0) {
        throw new Error("Enter a positive payout amount");
      }
      return createDistribution({
        data: {
          companyId: company.id,
          ownerId,
          amountMinor,
          currencyCode: currency || "USD",
          memo: memo || null,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Owner payout draft created");
      setShowForm(false);
      setOwnerId("");
      setAmount("");
      setMemo("");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const approveMutation = useMutation({
    mutationFn: async (distributionId: string) => {
      if (!company) throw new Error("No company");
      return approveDistribution({ data: { companyId: company.id, distributionId } });
    },
    onSuccess: async () => {
      toast.success("Payout approved");
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const postMutation = useMutation({
    mutationFn: async (distributionId: string) => {
      if (!company) throw new Error("No company");
      return postDistribution({ data: { companyId: company.id, distributionId } });
    },
    onSuccess: async (row) => {
      toast.success(
        row.journalId ? `Payout posted to ledger (${row.journalId.slice(0, 8)}…)` : "Payout posted",
      );
      await invalidate();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace
        title="Owner Payouts"
        description="Owner distributions and ledger payouts."
        subnav={<PmSubnav current="owner-payouts" />}
      >
        <EmptyState title="No access" description="Ask an administrator for payout permissions." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Owner Payouts"
      description="Draft → approve → post. Posting debits owner payable and credits trust or operating bank via post_journal."
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: "Owner Payouts" },
      ]}
      actions={
        canPrepare ? (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "New payout"}
          </Button>
        ) : null
      }
      subnav={<PmSubnav current="owner-payouts" />}
    >
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load Property Management settings" />
      ) : settings.isLoading ? (
        <LoadingState />
      ) : !settings.data?.enabled ? (
        <EmptyState title="Module disabled" description="Enable Property Management in Settings." />
      ) : (
        <>
          {showForm && canPrepare ? (
            owners.isError && owners.data === undefined ? (
              <QueryErrorState queries={[owners]} title="Could not load owners" />
            ) : (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>New owner payout</CardTitle>
                <CardDescription>
                  Creates a draft distribution. Map COA accounts in Settings before posting.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Owner</Label>
                  <RecordLookupSelect value={ownerId} onValueChange={setOwnerId}>
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
                  </RecordLookupSelect>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-payout-amount">Amount</Label>
                  <Input
                    id="pm-payout-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-payout-currency">Currency</Label>
                  <Input
                    id="pm-payout-currency"
                    value={currency}
                    maxLength={3}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-payout-memo">Memo</Label>
                  <Input
                    id="pm-payout-memo"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    disabled={!ownerId || !amount || createMutation.isPending}
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending ? "Saving…" : "Create draft"}
                  </Button>
                </div>
              </CardContent>
            </Card>
            )
          ) : null}
          {distributions.isLoading ? <LoadingState /> : null}
          {distributions.isError ? (
            <QueryErrorState queries={[distributions]} title="Could not load payouts" />
          ) : null}
          {distributions.data?.length === 0 ? (
            <EmptyState
              title="No owner payouts"
              description="Create a draft payout after approving an owner statement."
              action={
                canPrepare ? (
                  <Button size="sm" type="button" onClick={() => setShowForm(true)}>
                    New owner payout
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {distributions.data && distributions.data.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Number</th>
                    <th className="px-3 py-2 font-medium">Owner</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Journal</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {distributions.data.map((row) => {
                    const ownerName =
                      (owners.data ?? []).find((o) => o.id === row.ownerId)?.displayName ??
                      row.ownerId.slice(0, 8);
                    return (
                      <tr key={row.id} className="border-t border-border/70">
                        <td className="px-3 py-2 tabular-nums">{row.distributionNumber}</td>
                        <td className="px-3 py-2">{ownerName}</td>
                        <td className="px-3 py-2 tabular-nums">
                          {(row.amountMinor / 100).toFixed(2)} {row.currencyCode}
                        </td>
                        <td className="px-3 py-2">{row.status}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {row.journalId ? row.journalId.slice(0, 8) : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-2">
                            {row.status === "draft" && canApprove ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={approveMutation.isPending}
                                onClick={() => approveMutation.mutate(row.id)}
                              >
                                Approve
                              </Button>
                            ) : null}
                            {row.status === "approved" && canRecord ? (
                              <Button
                                type="button"
                                size="sm"
                                disabled={postMutation.isPending}
                                onClick={() => postMutation.mutate(row.id)}
                              >
                                Post to ledger
                              </Button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </ListWorkspace>
  );
}

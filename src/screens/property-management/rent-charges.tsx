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
import { getPmSettings } from "@/lib/property-management/pm.functions";
import {
  generatePmRentCharge,
  listPmLeases,
  listPmRentCharges,
} from "@/lib/property-management/pm-ops.functions";
import { postPmRentCharge } from "@/lib/property-management/pm-posting.functions";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

function monthBounds(isoMonth: string): { start: string; end: string; due: string } {
  const parts = isoMonth.split("-").map(Number);
  const y = parts[0] ?? new Date().getUTCFullYear();
  const m = parts[1] ?? 1;
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(y, m, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end, due: start };
}

export function PmRentChargesPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("property.view" as Permission);
  const canManage = can("property.rent.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPmSettings);
  const fetchLeases = useServerFn(listPmLeases);
  const fetchCharges = useServerFn(listPmRentCharges);
  const generateCharge = useServerFn(generatePmRentCharge);
  const postCharge = useServerFn(postPmRentCharge);

  const [leaseId, setLeaseId] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showForm, setShowForm] = useState(false);

  const settings = useQuery({
    queryKey: ["pm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const leases = useQuery({
    queryKey: ["pm-leases", company?.id],
    queryFn: () => fetchLeases({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });
  const charges = useQuery({
    queryKey: ["pm-rent-charges", company?.id],
    queryFn: () => fetchCharges({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!company || !leaseId) throw new Error("Select a lease");
      const bounds = monthBounds(month);
      return generateCharge({
        data: {
          companyId: company.id,
          leaseId,
          periodStart: bounds.start,
          periodEnd: bounds.end,
          dueDate: bounds.due,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Rent charge generated as draft");
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["pm-rent-charges", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const postMutation = useMutation({
    mutationFn: async (chargeId: string) => {
      if (!company) throw new Error("No company");
      return postCharge({ data: { companyId: company.id, chargeId } });
    },
    onSuccess: async (result) => {
      toast.success(
        result.journalId
          ? `Rent charge posted (${result.journalId.slice(0, 8)}…)`
          : "Rent charge posted",
      );
      await queryClient.invalidateQueries({ queryKey: ["pm-rent-charges", company?.id] });
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
        title="Rent & Charges"
        description="Scheduled rent charges."
        subnav={<PmSubnav current="rent-charges" />}
      >
        <EmptyState title="No access" description="Ask an administrator for property.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Rent & Charges"
      description="Generate draft period charges, then post to the ledger once COA mappings are configured."
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: "Rent & Charges" },
      ]}
      actions={
        canManage ? (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "Generate charge"}
          </Button>
        ) : null
      }
      subnav={<PmSubnav current="rent-charges" />}
    >
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load Property Management settings" />
      ) : settings.isLoading ? (
        <LoadingState />
      ) : !settings.data?.enabled ? (
        <EmptyState title="Module disabled" description="Enable Property Management in Settings." />
      ) : (
        <>
          {showForm && canManage ? (
            leases.isError && leases.data === undefined ? (
              <QueryErrorState queries={[leases]} title="Could not load leases" />
            ) : (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Generate rent charge</CardTitle>
                <CardDescription>
                  Duplicate periods for the same lease are rejected by the backend.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Lease</Label>
                  <RecordLookupSelect value={leaseId} onValueChange={setLeaseId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select lease" />
                    </SelectTrigger>
                    <SelectContent>
                      {(leases.data ?? [])
                        .filter((lease) => lease.status === "active" || lease.status === "draft")
                        .map((lease) => (
                          <SelectItem key={lease.id} value={lease.id}>
                            {lease.leaseNumber}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </RecordLookupSelect>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-rent-month">Period month</Label>
                  <Input
                    id="pm-rent-month"
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    disabled={!leaseId || mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? "Generating…" : "Generate"}
                  </Button>
                </div>
              </CardContent>
            </Card>
            )
          ) : null}
          {charges.isLoading ? <LoadingState /> : null}
          {charges.isError ? (
            <QueryErrorState queries={[charges]} title="Could not load rent charges" />
          ) : null}
          {charges.data?.length === 0 ? (
            <EmptyState
              title="No rent charges"
              description="Generate a charge for an active lease period."
              action={
                canManage ? (
                  <Button size="sm" type="button" onClick={() => setShowForm(true)}>
                    Generate charge
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {charges.data && charges.data.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Charge</th>
                    <th className="px-3 py-2 font-medium">Period</th>
                    <th className="px-3 py-2 font-medium">Due</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {charges.data.map((charge) => (
                    <tr key={charge.id} className="border-t border-border/70">
                      <td className="px-3 py-2 tabular-nums">{charge.chargeNumber}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {charge.periodStart} → {charge.periodEnd}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{charge.dueDate}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {(charge.amountMinor / 100).toFixed(2)} {charge.currencyCode}
                      </td>
                      <td className="px-3 py-2">{charge.status}</td>
                      <td className="px-3 py-2">
                        {charge.status === "draft" && canManage ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={postMutation.isPending}
                            onClick={() => postMutation.mutate(charge.id)}
                          >
                            Post to ledger
                          </Button>
                        ) : charge.journalId ? (
                          <span className="text-muted-foreground tabular-nums">
                            {charge.journalId.slice(0, 8)}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </ListWorkspace>
  );
}

import { RecordLookupSelect } from "@/components/lookup";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { PmSubnav } from "@/components/property-management/PmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
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
import { getPmSettings, listPmProperties } from "@/lib/property-management/pm.functions";
import {
  listPmLeases,
  listPmTenants,
  upsertPmLease,
} from "@/lib/property-management/pm-ops.functions";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function majorToMinor(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function PmLeasesPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("property.view" as Permission);
  const canManage = can("property.lease.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPmSettings);
  const fetchProperties = useServerFn(listPmProperties);
  const fetchTenants = useServerFn(listPmTenants);
  const fetchLeases = useServerFn(listPmLeases);
  const saveLease = useServerFn(upsertPmLease);

  const [showForm, setShowForm] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [rentMajor, setRentMajor] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [status, setStatus] = useState<"draft" | "active">("draft");

  const settings = useQuery({
    queryKey: ["pm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const properties = useQuery({
    queryKey: ["pm-properties", company?.id, ""],
    queryFn: () => fetchProperties({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });
  const tenants = useQuery({
    queryKey: ["pm-tenants", company?.id, ""],
    queryFn: () => fetchTenants({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canManage && showForm,
    retry: false,
  });
  const leases = useQuery({
    queryKey: ["pm-leases", company?.id],
    queryFn: () => fetchLeases({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!company || !propertyId || !tenantId) throw new Error("Property and tenant required");
      return saveLease({
        data: {
          companyId: company.id,
          draft: {
            propertyId,
            tenantId,
            status,
            startDate,
            rentAmountMinor: majorToMinor(rentMajor),
            currencyCode: company.base_currency || "USD",
            rentFrequency: "monthly",
            securityDepositMinor: 0,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Lease saved");
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["pm-leases", company?.id] });
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
        title="Leases"
        description="Long-term lease register."
        subnav={<PmSubnav current="leases" />}
      >
        <EmptyState title="No access" description="Ask an administrator for property.view." />
      </ListWorkspace>
    );
  }

  const propertyLabel = new Map(
    (properties.data ?? []).map((p) => [p.id, `${p.code} — ${p.name}`]),
  );

  return (
    <ListWorkspace
      title="Leases"
      description="Long-term rental agreements. Rent charges are generated separately without duplicating periods."
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: "Leases" },
      ]}
      actions={
        canManage ? (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "New lease"}
          </Button>
        ) : null
      }
      subnav={<PmSubnav current="leases" />}
    >
      {!settings.data?.enabled ? (
        <EmptyState title="Module disabled" description="Enable Property Management in Settings." />
      ) : (
        <>
          {showForm && canManage ? (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>New lease</CardTitle>
                <CardDescription>Amounts are entered in major currency units.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Property</Label>
                  <RecordLookupSelect value={propertyId} onValueChange={setPropertyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select property" />
                    </SelectTrigger>
                    <SelectContent>
                      {(properties.data ?? []).map((property) => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.code} — {property.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RecordLookupSelect>
                </div>
                <div className="grid gap-2">
                  <Label>Tenant</Label>
                  <RecordLookupSelect value={tenantId} onValueChange={setTenantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {(tenants.data ?? []).map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.id}>
                          {tenant.displayName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RecordLookupSelect>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-rent">Monthly rent</Label>
                  <Input
                    id="pm-rent"
                    type="number"
                    min={0}
                    step="0.01"
                    value={rentMajor}
                    onChange={(e) => setRentMajor(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-lease-start">Start date</Label>
                  <Input
                    id="pm-lease-start"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as "draft" | "active")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    disabled={!propertyId || !tenantId || mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? "Saving…" : "Save lease"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {leases.isLoading ? <LoadingState /> : null}
          {leases.isError ? (
            <ErrorState
              title="Could not load leases"
              description={friendlyAuthError(leases.error)}
              onRetry={() => leases.refetch()}
            />
          ) : null}
          {leases.data?.length === 0 ? (
            <EmptyState title="No leases yet" description="Create a lease for an active tenant." />
          ) : null}
          {leases.data && leases.data.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Number</th>
                    <th className="px-3 py-2 font-medium">Property</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Start</th>
                    <th className="px-3 py-2 font-medium">Rent</th>
                  </tr>
                </thead>
                <tbody>
                  {leases.data.map((lease) => (
                    <tr key={lease.id} className="border-t border-border/70">
                      <td className="px-3 py-2 tabular-nums">{lease.leaseNumber}</td>
                      <td className="px-3 py-2">
                        {propertyLabel.get(lease.propertyId) ?? lease.propertyId}
                      </td>
                      <td className="px-3 py-2">{lease.status}</td>
                      <td className="px-3 py-2 tabular-nums">{lease.startDate}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {(lease.rentAmountMinor / 100).toFixed(2)} {lease.currencyCode}
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

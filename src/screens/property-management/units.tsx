import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
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
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  getPmSettings,
  listPmProperties,
  listPmUnits,
  upsertPmUnit,
} from "@/lib/property-management/pm.functions";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function PmUnitsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("property.view" as Permission);
  const canManage = can("property.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPmSettings);
  const fetchProperties = useServerFn(listPmProperties);
  const fetchUnits = useServerFn(listPmUnits);
  const saveUnit = useServerFn(upsertPmUnit);

  const [propertyId, setPropertyId] = useState<string>("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [showForm, setShowForm] = useState(false);

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

  const units = useQuery({
    queryKey: ["pm-units", company?.id, propertyId || "all"],
    queryFn: () =>
      fetchUnits({
        data: {
          companyId: company!.id,
          propertyId: propertyId || null,
        },
      }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!company || !propertyId) throw new Error("Select a property");
      return saveUnit({
        data: {
          companyId: company.id,
          draft: {
            propertyId,
            code: code.trim(),
            name: name.trim(),
            status: "active",
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Unit saved");
      setCode("");
      setName("");
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["pm-units", company?.id] });
      await queryClient.invalidateQueries({ queryKey: ["pm-dashboard-kpis", company?.id] });
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
        title="Units"
        description="Unit register."
        subnav={<PmSubnav current="units" />}
      >
        <EmptyState title="No access" description="Ask an administrator for property.view." />
      </ListWorkspace>
    );
  }

  const propertyNameById = new Map((properties.data ?? []).map((p) => [p.id, p.name]));

  return (
    <ListWorkspace
      title="Units"
      description="Unit-level records under a single property. History is retained when units are archived."
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: "Units" },
      ]}
      actions={
        canManage ? (
          <Button type="button" onClick={() => setShowForm((value) => !value)}>
            {showForm ? "Close form" : "New unit"}
          </Button>
        ) : null
      }
      subnav={<PmSubnav current="units" />}
    >
      {settings.data && !settings.data.enabled ? (
        <EmptyState
          title="Module disabled"
          description="Enable Property Management in Settings first."
        />
      ) : null}
      {settings.data?.enabled ? (
        <>
          <div className="mb-4 max-w-sm">
            <Label className="mb-2 block">Filter by property</Label>
            <RecordLookupSelect
              value={propertyId || "all"}
              onValueChange={(value) => setPropertyId(value === "all" ? "" : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All properties" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All properties</SelectItem>
                {(properties.data ?? []).map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.code} — {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </RecordLookupSelect>
          </div>
          {showForm && canManage ? (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>New unit</CardTitle>
                <CardDescription>A unit belongs to exactly one property at a time.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
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
                  <Label htmlFor="pm-unit-code">Code</Label>
                  <Input id="pm-unit-code" value={code} onChange={(e) => setCode(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-unit-name">Name</Label>
                  <Input id="pm-unit-name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    disabled={!propertyId || !code.trim() || !name.trim() || mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? "Saving…" : "Save unit"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {units.isLoading ? <LoadingState /> : null}
          {units.isError ? (
            <ErrorState
              title="Could not load units"
              description={friendlyAuthError(units.error)}
              onRetry={() => units.refetch()}
            />
          ) : null}
          {units.data?.length === 0 ? (
            <EmptyState
              title="No units yet"
              description="Create a unit under a property."
              action={
                canManage ? (
                  <Button size="sm" type="button" onClick={() => setShowForm(true)}>
                    New unit
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {units.data && units.data.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Property</th>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {units.data.map((unit) => (
                    <tr key={unit.id} className="border-t border-border/70">
                      <td className="px-3 py-2">
                        {propertyNameById.get(unit.propertyId) ?? unit.propertyId}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{unit.code}</td>
                      <td className="px-3 py-2">{unit.name}</td>
                      <td className="px-3 py-2">{unit.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      ) : null}
    </ListWorkspace>
  );
}

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
import {
  getPmSettings,
  listPmProperties,
  upsertPmProperty,
} from "@/lib/property-management/pm.functions";
import type { PmRentalMode } from "@/lib/property-management/types";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function PmPropertiesPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("property.view" as Permission);
  const canManage = can("property.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPmSettings);
  const fetchProperties = useServerFn(listPmProperties);
  const saveProperty = useServerFn(upsertPmProperty);

  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rentalMode, setRentalMode] = useState<PmRentalMode>("hybrid");
  const [showForm, setShowForm] = useState(false);

  const settings = useQuery({
    queryKey: ["pm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const properties = useQuery({
    queryKey: ["pm-properties", company?.id, search],
    queryFn: () =>
      fetchProperties({
        data: { companyId: company!.id, search: search || null },
      }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No company");
      return saveProperty({
        data: {
          companyId: company.id,
          draft: {
            name: name.trim(),
            code: code.trim() || null,
            rentalMode,
            status: "active",
            currencyCode: company.base_currency || "USD",
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Property saved");
      setName("");
      setCode("");
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["pm-properties", company?.id] });
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
      <ListWorkspace title="Properties" description="Property register.">
        <PmSubnav current="properties" />
        <EmptyState title="No access" description="Ask an administrator for property.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Properties"
      description="Buildings, houses and property profiles. Currency is set per property."
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: "Properties" },
      ]}
      actions={
        canManage ? (
          <Button type="button" onClick={() => setShowForm((value) => !value)}>
            {showForm ? "Close form" : "New property"}
          </Button>
        ) : null
      }
    >
      <PmSubnav current="properties" />
      {settings.isLoading ? <LoadingState /> : null}
      {settings.isError ? (
        <ErrorState title="Settings error" description={friendlyAuthError(settings.error)} onRetry={() => settings.refetch()}
        />
      ) : null}
      {settings.data && !settings.data.enabled ? (
        <EmptyState
          title="Module disabled"
          description="Enable Property Management in Settings before creating properties."
        />
      ) : null}
      {settings.data?.enabled ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search code or name"
              className="max-w-sm"
              aria-label="Search properties"
            />
          </div>
          {showForm && canManage ? (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>New property</CardTitle>
                <CardDescription>
                  Leave code blank to allocate the next {settings.data.propertyNumberPrefix} number.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="pm-prop-name">Name</Label>
                  <Input
                    id="pm-prop-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-prop-code">Code (optional)</Label>
                  <Input
                    id="pm-prop-code"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Rental mode</Label>
                  <Select
                    value={rentalMode}
                    onValueChange={(value) => setRentalMode(value as PmRentalMode)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="short_term">Short-term</SelectItem>
                      <SelectItem value="long_term">Long-term</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    disabled={!name.trim() || mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? "Saving…" : "Save property"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {properties.isLoading ? <LoadingState /> : null}
          {properties.isError ? (
            <ErrorState
              title="Could not load properties"
              description={friendlyAuthError(properties.error)}
            onRetry={() => properties.refetch()}
        />
          ) : null}
          {properties.data?.length === 0 ? (
            <EmptyState
              title="No properties yet"
              description="Create the first property to begin the portfolio register."
            />
          ) : null}
          {properties.data && properties.data.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Code</th>
                    <th className="px-3 py-2 font-medium">Name</th>
                    <th className="px-3 py-2 font-medium">Mode</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Currency</th>
                  </tr>
                </thead>
                <tbody>
                  {properties.data.map((property) => (
                    <tr key={property.id} className="border-t border-border/70">
                      <td className="px-3 py-2 tabular-nums">{property.code}</td>
                      <td className="px-3 py-2">{property.name}</td>
                      <td className="px-3 py-2">{property.rentalMode.replaceAll("_", " ")}</td>
                      <td className="px-3 py-2">{property.status}</td>
                      <td className="px-3 py-2">{property.currencyCode}</td>
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

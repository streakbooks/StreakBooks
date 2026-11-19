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
  listPmManagementAgreements,
  listPmProperties,
  upsertPmManagementAgreement,
} from "@/lib/property-management/pm.functions";
import type { PmBusinessModel, PmFeeType } from "@/lib/property-management/types";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PmAgreementsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("property.view" as Permission);
  const canManage = can("property.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPmSettings);
  const fetchProperties = useServerFn(listPmProperties);
  const fetchAgreements = useServerFn(listPmManagementAgreements);
  const saveAgreement = useServerFn(upsertPmManagementAgreement);

  const [propertyId, setPropertyId] = useState("");
  const [businessModel, setBusinessModel] = useState<PmBusinessModel>("agency");
  const [feeType, setFeeType] = useState<PmFeeType>("percent_gross");
  const [feeRatePct, setFeeRatePct] = useState("10");
  const [startDate, setStartDate] = useState(todayIso());
  const [activate, setActivate] = useState(false);
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

  const agreements = useQuery({
    queryKey: ["pm-agreements", company?.id],
    queryFn: () => fetchAgreements({ data: { companyId: company!.id, propertyId: null } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!company || !propertyId) throw new Error("Select a property");
      return saveAgreement({
        data: {
          companyId: company.id,
          draft: {
            propertyId,
            businessModel,
            feeType,
            feeRatePct: Number(feeRatePct),
            startDate,
            activate,
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success(activate ? "Agreement activated" : "Agreement draft saved");
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["pm-agreements", company?.id] });
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
        title="Agreements"
        description="Management agreements."
        subnav={<PmSubnav current="agreements" />}
      >
        <EmptyState title="No access" description="Ask an administrator for property.view." />
      </ListWorkspace>
    );
  }

  const propertyNameById = new Map(
    (properties.data ?? []).map((p) => [p.id, `${p.code} — ${p.name}`]),
  );

  return (
    <ListWorkspace
      title="Agreements"
      description="Versioned management agreements. Active fee terms are never silently rewritten — create a new version instead."
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: "Agreements" },
      ]}
      actions={
        canManage ? (
          <Button type="button" onClick={() => setShowForm((value) => !value)}>
            {showForm ? "Close form" : "New agreement"}
          </Button>
        ) : null
      }
      subnav={<PmSubnav current="agreements" />}
    >
      {settings.data && !settings.data.enabled ? (
        <EmptyState
          title="Module disabled"
          description="Enable Property Management in Settings first."
        />
      ) : null}
      {settings.data?.enabled ? (
        <>
          {showForm && canManage ? (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Management agreement</CardTitle>
                <CardDescription>
                  Commission calculation engines land in PM-06. This record stores effective-dated
                  terms only.
                </CardDescription>
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
                  <Label>Business model</Label>
                  <Select
                    value={businessModel}
                    onValueChange={(value) => setBusinessModel(value as PmBusinessModel)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="agency">Agency</SelectItem>
                      <SelectItem value="principal">Principal</SelectItem>
                      <SelectItem value="owner_direct">Owner-direct</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Fee type</Label>
                  <Select value={feeType} onValueChange={(value) => setFeeType(value as PmFeeType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent_gross">Percent of gross</SelectItem>
                      <SelectItem value="percent_net">Percent of net</SelectItem>
                      <SelectItem value="percent_accommodation">
                        Percent of accommodation
                      </SelectItem>
                      <SelectItem value="percent_collected">Percent of collected</SelectItem>
                      <SelectItem value="fixed_monthly">Fixed monthly</SelectItem>
                      <SelectItem value="fixed_per_booking">Fixed per booking</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-fee-rate">Fee rate %</Label>
                  <Input
                    id="pm-fee-rate"
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={feeRatePct}
                    onChange={(event) => setFeeRatePct(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-start">Start date</Label>
                  <Input
                    id="pm-start"
                    type="date"
                    value={startDate}
                    onChange={(event) => setStartDate(event.target.value)}
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                  <input
                    id="pm-activate"
                    type="checkbox"
                    checked={activate}
                    onChange={(event) => setActivate(event.target.checked)}
                    className="size-4"
                  />
                  <Label htmlFor="pm-activate">
                    Activate now (supersedes prior active agreement)
                  </Label>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    disabled={!propertyId || !startDate || mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? "Saving…" : "Save agreement"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {agreements.isLoading ? <LoadingState /> : null}
          {agreements.isError ? (
            <QueryErrorState queries={[agreements]} title="Could not load agreements" />
          ) : null}
          {agreements.data?.length === 0 ? (
            <EmptyState
              title="No agreements yet"
              description="Create a draft or active management agreement for a property."
              action={
                canManage ? (
                  <Button size="sm" type="button" onClick={() => setShowForm(true)}>
                    New agreement
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {agreements.data && agreements.data.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Property</th>
                    <th className="px-3 py-2 font-medium">Version</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Model</th>
                    <th className="px-3 py-2 font-medium">Fee</th>
                    <th className="px-3 py-2 font-medium">Start</th>
                  </tr>
                </thead>
                <tbody>
                  {agreements.data.map((row) => (
                    <tr key={row.id} className="border-t border-border/70">
                      <td className="px-3 py-2">
                        {propertyNameById.get(row.propertyId) ?? row.propertyId}
                      </td>
                      <td className="px-3 py-2 tabular-nums">v{row.versionNo}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">{row.businessModel.replaceAll("_", " ")}</td>
                      <td className="px-3 py-2">
                        {row.feeType.replaceAll("_", " ")}
                        {row.feeRatePct != null ? ` · ${row.feeRatePct}%` : ""}
                      </td>
                      <td className="px-3 py-2 tabular-nums">{row.startDate}</td>
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

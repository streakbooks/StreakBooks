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
  listPmReservations,
  upsertPmReservation,
} from "@/lib/property-management/pm-ops.functions";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

function majorToMinor(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function PmReservationsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("property.view" as Permission);
  const canManage = can("property.reservation.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPmSettings);
  const fetchProperties = useServerFn(listPmProperties);
  const fetchReservations = useServerFn(listPmReservations);
  const saveReservation = useServerFn(upsertPmReservation);

  const [showForm, setShowForm] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const [guestName, setGuestName] = useState("");
  const [source, setSource] = useState("manual");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [baseMajor, setBaseMajor] = useState("");
  const [cleaningMajor, setCleaningMajor] = useState("0");
  const [channelMajor, setChannelMajor] = useState("0");

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
  const reservations = useQuery({
    queryKey: ["pm-reservations", company?.id],
    queryFn: () => fetchReservations({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!company || !propertyId || !guestName || !checkIn || !checkOut) {
        throw new Error("Property, guest, check-in and check-out are required");
      }
      const base = majorToMinor(baseMajor);
      const cleaning = majorToMinor(cleaningMajor);
      const channel = majorToMinor(channelMajor);
      return saveReservation({
        data: {
          companyId: company.id,
          draft: {
            propertyId,
            guestName: guestName.trim(),
            source,
            status: "confirmed",
            checkIn,
            checkOut,
            currencyCode: company.base_currency || "USD",
            baseAmountMinor: base,
            cleaningFeeMinor: cleaning,
            channelFeeMinor: channel,
            hostPayoutMinor: Math.max(0, base + cleaning - channel),
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Reservation saved");
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["pm-reservations", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Reservations" description="Short-term bookings."
      subnav={<PmSubnav current="reservations" />}
    >
        <EmptyState title="No access" description="Ask an administrator for property.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Reservations"
      description="STR booking register. Channel labels are source categories — live OTA APIs are not claimed until connected."
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: "Reservations" },
      ]}
      actions={
        canManage ? (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "New reservation"}
          </Button>
        ) : null
      }
      subnav={<PmSubnav current="reservations" />}
    >
      {!settings.data?.enabled ? (
        <EmptyState title="Module disabled" description="Enable Property Management in Settings." />
      ) : (
        <>
          {showForm && canManage ? (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>New reservation</CardTitle>
                <CardDescription>Enter amounts in major currency units.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Property</Label>
                  <Select value={propertyId || undefined} onValueChange={setPropertyId}>
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
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Source</Label>
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[
                        "manual",
                        "direct",
                        "airbnb",
                        "vrbo",
                        "booking_com",
                        "hostaway",
                        "guesty",
                        "ownerrez",
                        "hostfully",
                        "lodgify",
                      ].map((value) => (
                        <SelectItem key={value} value={value}>
                          {value.replaceAll("_", " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor="pm-guest">Guest name</Label>
                  <Input
                    id="pm-guest"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-check-in">Check-in</Label>
                  <Input
                    id="pm-check-in"
                    type="date"
                    value={checkIn}
                    onChange={(e) => setCheckIn(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-check-out">Check-out</Label>
                  <Input
                    id="pm-check-out"
                    type="date"
                    value={checkOut}
                    onChange={(e) => setCheckOut(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-base">Base accommodation</Label>
                  <Input
                    id="pm-base"
                    type="number"
                    min={0}
                    step="0.01"
                    value={baseMajor}
                    onChange={(e) => setBaseMajor(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-cleaning">Cleaning fee</Label>
                  <Input
                    id="pm-cleaning"
                    type="number"
                    min={0}
                    step="0.01"
                    value={cleaningMajor}
                    onChange={(e) => setCleaningMajor(e.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-channel">Channel fee</Label>
                  <Input
                    id="pm-channel"
                    type="number"
                    min={0}
                    step="0.01"
                    value={channelMajor}
                    onChange={(e) => setChannelMajor(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    disabled={!propertyId || !guestName || !checkIn || !checkOut || mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? "Saving…" : "Save reservation"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {reservations.isLoading ? <LoadingState /> : null}
          {reservations.isError ? (
            <ErrorState
              title="Could not load reservations"
              description={friendlyAuthError(reservations.error)}
              onRetry={() => reservations.refetch()}
            />
          ) : null}
          {reservations.data?.length === 0 ? (
            <EmptyState
              title="No reservations"
              description="Create a booking or import later."
              action={
                canManage ? (
                  <Button size="sm" type="button" onClick={() => setShowForm(true)}>
                    New reservation
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {reservations.data && reservations.data.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Guest</th>
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Stay</th>
                    <th className="px-3 py-2 font-medium">Base</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.data.map((row) => (
                    <tr key={row.id} className="border-t border-border/70">
                      <td className="px-3 py-2">{row.guestName}</td>
                      <td className="px-3 py-2">{row.source.replaceAll("_", " ")}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {row.checkIn} → {row.checkOut} ({row.nights}n)
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {(row.baseAmountMinor / 100).toFixed(2)} {row.currencyCode}
                      </td>
                      <td className="px-3 py-2">{row.status}</td>
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

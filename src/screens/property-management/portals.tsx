import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
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
import { listContacts } from "@/lib/contacts/contacts.functions";
import { getPmSettings, listPmOwners } from "@/lib/property-management/pm.functions";
import { listPmTenants } from "@/lib/property-management/pm-ops.functions";
import {
  listPmPortalAccess,
  revokePmPortalAccess,
  upsertPmPortalAccess,
} from "@/lib/property-management/pm-posting.functions";
import type { Permission } from "@/lib/permissions";
import type { PmSectionKey } from "@/lib/property-management/sections";
import { toast } from "sonner";

type PortalKind = "owner" | "tenant";

export function PmPortalPage({ kind }: { kind: PortalKind }) {
  const sectionKey: PmSectionKey = kind === "owner" ? "owner-portal" : "tenant-portal";
  const title = kind === "owner" ? "Owner Portal" : "Tenant Portal";
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView =
    can("property.view" as Permission) ||
    can("property.settings.manage" as Permission) ||
    (kind === "owner"
      ? can("property.owner.manage" as Permission)
      : can("property.tenant.manage" as Permission));
  const canManage =
    can("property.settings.manage" as Permission) ||
    (kind === "owner"
      ? can("property.owner.manage" as Permission)
      : can("property.tenant.manage" as Permission));

  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPmSettings);
  const fetchAccess = useServerFn(listPmPortalAccess);
  const fetchContacts = useServerFn(listContacts);
  const fetchOwners = useServerFn(listPmOwners);
  const fetchTenants = useServerFn(listPmTenants);
  const invite = useServerFn(upsertPmPortalAccess);
  const revoke = useServerFn(revokePmPortalAccess);

  const [showForm, setShowForm] = useState(false);
  const [contactId, setContactId] = useState("");
  const [partyId, setPartyId] = useState("");
  const [email, setEmail] = useState("");

  const settings = useQuery({
    queryKey: ["pm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const access = useQuery({
    queryKey: ["pm-portal-access", company?.id, kind],
    queryFn: () => fetchAccess({ data: { companyId: company!.id, portalRole: kind } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });
  const contacts = useQuery({
    queryKey: ["pm-portal-contacts", company?.id],
    queryFn: () => fetchContacts({ data: { companyId: company!.id, kind: "all", limit: 200 } }),
    enabled: Boolean(company?.id) && canManage && showForm,
    retry: false,
  });
  const owners = useQuery({
    queryKey: ["pm-owners", company?.id],
    queryFn: () => fetchOwners({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && kind === "owner" && canManage && showForm,
    retry: false,
  });
  const tenants = useQuery({
    queryKey: ["pm-tenants", company?.id],
    queryFn: () => fetchTenants({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && kind === "tenant" && canManage && showForm,
    retry: false,
  });

  const contactOptions = useMemo(() => {
    const rows = Array.isArray(contacts.data) ? contacts.data : [];
    return rows as Array<{ id: string; name: string; email?: string | null }>;
  }, [contacts.data]);

  const inviteMutation = useMutation({
    mutationFn: async () => {
      if (!company || !contactId || !partyId) {
        throw new Error(
          kind === "owner" ? "Select contact and owner" : "Select contact and tenant",
        );
      }
      return invite({
        data: {
          companyId: company.id,
          contactId,
          portalRole: kind,
          ownerId: kind === "owner" ? partyId : null,
          tenantId: kind === "tenant" ? partyId : null,
          invitedEmail: email || null,
        },
      });
    },
    onSuccess: async () => {
      toast.success(`${kind === "owner" ? "Owner" : "Tenant"} portal invite recorded`);
      setShowForm(false);
      setContactId("");
      setPartyId("");
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: ["pm-portal-access", company?.id, kind] });
      await queryClient.invalidateQueries({ queryKey: ["pm-trust-summary", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const revokeMutation = useMutation({
    mutationFn: async (accessId: string) => {
      if (!company) throw new Error("No company");
      return revoke({ data: { companyId: company.id, accessId } });
    },
    onSuccess: async () => {
      toast.success("Portal access revoked");
      await queryClient.invalidateQueries({ queryKey: ["pm-portal-access", company?.id, kind] });
      await queryClient.invalidateQueries({ queryKey: ["pm-trust-summary", company?.id] });
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
        title={title}
        description="Portal access grants."
        subnav={<PmSubnav current={sectionKey} />}
      >
        <EmptyState title="No access" description="Ask an administrator for portal permissions." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title={title}
      description="Invite and revoke portal access. External self-serve login surfaces ship later; grants are persisted now."
      breadcrumbs={[{ label: "Property Management", to: "/property-management" }, { label: title }]}
      actions={
        canManage ? (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "Invite"}
          </Button>
        ) : null
      }
      subnav={<PmSubnav current={sectionKey} />}
    >
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load Property Management settings" />
      ) : !settings.data?.enabled ? (
        <EmptyState title="Module disabled" description="Enable Property Management in Settings." />
      ) : (
        <>
          {showForm && canManage ? (
            (contacts.isError && contacts.data === undefined) ||
            (kind === "owner"
              ? owners.isError && owners.data === undefined
              : tenants.isError && tenants.data === undefined) ? (
              <QueryErrorState
                queries={[contacts, kind === "owner" ? owners : tenants]}
                title="Could not load portal invite options"
              />
            ) : (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Invite {kind}</CardTitle>
                <CardDescription>
                  Links a contact to a {kind} record. Status starts as invited.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Contact</Label>
                  <RecordLookupSelect value={contactId} onValueChange={setContactId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select contact" />
                    </SelectTrigger>
                    <SelectContent>
                      {contactOptions.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </RecordLookupSelect>
                </div>
                <div className="grid gap-2">
                  <Label>{kind === "owner" ? "Owner" : "Tenant"}</Label>
                  <RecordLookupSelect value={partyId} onValueChange={setPartyId}>
                    <SelectTrigger>
                      <SelectValue placeholder={`Select ${kind}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {kind === "owner"
                        ? (owners.data ?? []).map((owner) => (
                            <SelectItem key={owner.id} value={owner.id}>
                              {owner.displayName}
                            </SelectItem>
                          ))
                        : (tenants.data ?? []).map((tenant) => (
                            <SelectItem key={tenant.id} value={tenant.id}>
                              {tenant.displayName}
                            </SelectItem>
                          ))}
                    </SelectContent>
                  </RecordLookupSelect>
                </div>
                <div className="grid gap-2 sm:col-span-2">
                  <Label htmlFor={`pm-portal-email-${kind}`}>Invite email (optional)</Label>
                  <Input
                    id={`pm-portal-email-${kind}`}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    disabled={!contactId || !partyId || inviteMutation.isPending}
                    onClick={() => inviteMutation.mutate()}
                  >
                    {inviteMutation.isPending ? "Saving…" : "Save invite"}
                  </Button>
                </div>
              </CardContent>
            </Card>
            )
          ) : null}
          {access.isLoading ? <LoadingState /> : null}
          {access.isError ? (
            <QueryErrorState queries={[access]} title="Could not load portal access" />
          ) : null}
          {access.data?.length === 0 ? (
            <EmptyState
              title={`No ${kind} portal grants`}
              description="Invite a contact linked to an existing record."
              action={
                canManage ? (
                  <Button size="sm" type="button" onClick={() => setShowForm(true)}>
                    Invite
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {access.data && access.data.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    <th className="px-3 py-2 font-medium">Party</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {access.data.map((row) => (
                    <tr key={row.id} className="border-t border-border/70">
                      <td className="px-3 py-2 tabular-nums">{row.contactId.slice(0, 8)}</td>
                      <td className="px-3 py-2 tabular-nums">
                        {(kind === "owner" ? row.ownerId : row.tenantId)?.slice(0, 8) ?? "—"}
                      </td>
                      <td className="px-3 py-2">{row.invitedEmail ?? "—"}</td>
                      <td className="px-3 py-2">{row.status}</td>
                      <td className="px-3 py-2">
                        {canManage && row.status !== "revoked" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={revokeMutation.isPending}
                            onClick={() => revokeMutation.mutate(row.id)}
                          >
                            Revoke
                          </Button>
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

import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { getPmSettings } from "@/lib/property-management/pm.functions";
import { listPmTenants, upsertPmTenant } from "@/lib/property-management/pm-ops.functions";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function PmTenantsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("property.view" as Permission);
  const canManage = can("property.tenant.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPmSettings);
  const fetchTenants = useServerFn(listPmTenants);
  const fetchContacts = useServerFn(listContacts);
  const saveTenant = useServerFn(upsertPmTenant);

  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showForm, setShowForm] = useState(false);

  const settings = useQuery({
    queryKey: ["pm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const tenants = useQuery({
    queryKey: ["pm-tenants", company?.id, search],
    queryFn: () => fetchTenants({ data: { companyId: company!.id, search: search || null } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const contacts = useQuery({
    queryKey: ["pm-tenant-contacts", company?.id],
    queryFn: () => fetchContacts({ data: { companyId: company!.id, kind: "all", limit: 200 } }),
    enabled: Boolean(company?.id) && canManage && showForm,
    retry: false,
  });

  const contactOptions = useMemo(() => {
    return (Array.isArray(contacts.data) ? contacts.data : []) as Array<{
      id: string;
      name: string;
    }>;
  }, [contacts.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!company || !contactId) throw new Error("Select a contact");
      return saveTenant({
        data: {
          companyId: company.id,
          draft: { contactId, displayName: displayName.trim() || null, status: "active" },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Tenant linked");
      setShowForm(false);
      setContactId("");
      setDisplayName("");
      await queryClient.invalidateQueries({ queryKey: ["pm-tenants", company?.id] });
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
        title="Tenants & Guests"
        description="Tenant overlays on Contacts."
        subnav={<PmSubnav current="tenants-guests" />}
      >
        <EmptyState title="No access" description="Ask an administrator for property.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Tenants & Guests"
      description="Tenants reuse LinkBooks Contacts — no duplicate identity store."
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: "Tenants & Guests" },
      ]}
      actions={
        canManage ? (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "Link tenant"}
          </Button>
        ) : null
      }
      subnav={<PmSubnav current="tenants-guests" />}
    >
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load Property Management settings" />
      ) : settings.isLoading ? (
        <LoadingState />
      ) : !settings.data?.enabled ? (
        <EmptyState title="Module disabled" description="Enable Property Management in Settings." />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tenants"
              className="max-w-sm"
              aria-label="Search tenants"
            />
            <Button asChild variant="outline">
              <Link to="/contacts">Open Contacts</Link>
            </Button>
          </div>
          {showForm && canManage ? (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Link tenant from Contacts</CardTitle>
                <CardDescription>Create the contact first if they are missing.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label>Contact</Label>
                  <RecordLookupSelect
                    value={contactId}
                    onValueChange={(value) => {
                      setContactId(value);
                      const match = contactOptions.find((row) => row.id === value);
                      if (match) setDisplayName(match.name);
                    }}
                  >
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
                  <Label htmlFor="pm-tenant-name">Display name</Label>
                  <Input
                    id="pm-tenant-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    disabled={!contactId || mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? "Saving…" : "Save tenant"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {tenants.isLoading ? <LoadingState /> : null}
          {tenants.isError ? (
            <QueryErrorState queries={[tenants]} title="Could not load tenants" />
          ) : null}
          {tenants.data?.length === 0 ? (
            <EmptyState
              title="No tenants linked"
              description="Link a contact as a tenant."
              action={
                canManage ? (
                  <Button size="sm" type="button" onClick={() => setShowForm(true)}>
                    Link tenant
                  </Button>
                ) : undefined
              }
            />
          ) : null}
          {tenants.data && tenants.data.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Display name</th>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.data.map((tenant) => (
                    <tr key={tenant.id} className="border-t border-border/70">
                      <td className="px-3 py-2">{tenant.displayName}</td>
                      <td className="px-3 py-2">{tenant.contactName ?? "—"}</td>
                      <td className="px-3 py-2">{tenant.status}</td>
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

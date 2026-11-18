import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
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
import { listContacts } from "@/lib/contacts/contacts.functions";
import {
  getPmSettings,
  listPmOwners,
  upsertPmOwner,
} from "@/lib/property-management/pm.functions";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function PmOwnersPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("property.owner.view" as Permission) || can("property.view" as Permission);
  const canManage = can("property.owner.manage" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getPmSettings);
  const fetchOwners = useServerFn(listPmOwners);
  const fetchContacts = useServerFn(listContacts);
  const saveOwner = useServerFn(upsertPmOwner);

  const [search, setSearch] = useState("");
  const [contactId, setContactId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [showForm, setShowForm] = useState(false);

  const settings = useQuery({
    queryKey: ["pm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const owners = useQuery({
    queryKey: ["pm-owners", company?.id, search],
    queryFn: () =>
      fetchOwners({ data: { companyId: company!.id, search: search || null } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const contacts = useQuery({
    queryKey: ["pm-owner-contacts", company?.id],
    queryFn: () =>
      fetchContacts({
        data: { companyId: company!.id, kind: "all", limit: 200 },
      }),
    enabled: Boolean(company?.id) && canManage && showForm,
    retry: false,
  });

  const contactOptions = useMemo(() => {
    const rows = Array.isArray(contacts.data) ? contacts.data : [];
    return rows as Array<{ id: string; name: string; email?: string | null }>;
  }, [contacts.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!company || !contactId) throw new Error("Select a contact");
      return saveOwner({
        data: {
          companyId: company.id,
          draft: {
            contactId,
            displayName: displayName.trim() || null,
            statementDeliveryEmail: email.trim() || null,
            status: "active",
          },
        },
      });
    },
    onSuccess: async () => {
      toast.success("Owner linked");
      setContactId("");
      setDisplayName("");
      setEmail("");
      setShowForm(false);
      await queryClient.invalidateQueries({ queryKey: ["pm-owners", company?.id] });
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
      <ListWorkspace title="Owners" description="Beneficial owners.">
        <PmSubnav current="owners" />
        <EmptyState
          title="No access"
          description="Ask an administrator for property.owner.view."
        />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="Owners"
      description="Owners are overlays on LinkBooks Contacts — no duplicate identity records."
      breadcrumbs={[
        { label: "Property Management", to: "/property-management" },
        { label: "Owners" },
      ]}
      actions={
        canManage ? (
          <Button type="button" onClick={() => setShowForm((value) => !value)}>
            {showForm ? "Close form" : "Link owner"}
          </Button>
        ) : null
      }
    >
      <PmSubnav current="owners" />
      {settings.data && !settings.data.enabled ? (
        <EmptyState
          title="Module disabled"
          description="Enable Property Management in Settings first."
        />
      ) : null}
      {settings.data?.enabled ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search owners"
              className="max-w-sm"
              aria-label="Search owners"
            />
            <Button asChild variant="outline">
              <Link to="/contacts">Open Contacts</Link>
            </Button>
          </div>
          {showForm && canManage ? (
            <Card className="mb-4">
              <CardHeader>
                <CardTitle>Link owner from Contacts</CardTitle>
                <CardDescription>
                  Create or update the contact first if they are not listed.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2 sm:col-span-2">
                  <Label>Contact</Label>
                  <Select
                    value={contactId || undefined}
                    onValueChange={(value) => {
                      setContactId(value);
                      const match = contactOptions.find((row) => row.id === value);
                      if (match) {
                        setDisplayName(match.name);
                        setEmail(match.email ?? "");
                      }
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
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-owner-name">Display name</Label>
                  <Input
                    id="pm-owner-name"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="pm-owner-email">Statement delivery email</Label>
                  <Input
                    id="pm-owner-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    disabled={!contactId || mutation.isPending}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending ? "Saving…" : "Save owner"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {owners.isLoading ? <LoadingState /> : null}
          {owners.isError ? (
            <ErrorState
              title="Could not load owners"
              description={friendlyAuthError(owners.error)}
            onRetry={() => owners.refetch()}
        />
          ) : null}
          {owners.data?.length === 0 ? (
            <EmptyState
              title="No owners linked"
              description="Link a contact as an owner to assign ownership shares."
            />
          ) : null}
          {owners.data && owners.data.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Display name</th>
                    <th className="px-3 py-2 font-medium">Contact</th>
                    <th className="px-3 py-2 font-medium">Delivery email</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {owners.data.map((owner) => (
                    <tr key={owner.id} className="border-t border-border/70">
                      <td className="px-3 py-2">{owner.displayName}</td>
                      <td className="px-3 py-2">{owner.contactName ?? "—"}</td>
                      <td className="px-3 py-2">{owner.statementDeliveryEmail ?? "—"}</td>
                      <td className="px-3 py-2">{owner.status}</td>
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

import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  getCrmSettings,
  getCrmTerritoryPolicy,
  listCrmTeamWorkload,
  listCrmTerritories,
  upsertCrmTerritory,
} from "@/lib/crm/crm.functions";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function CrmTeamPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canAdmin = can("crm.admin" as Permission);
  const queryClient = useQueryClient();
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchTeam = useServerFn(listCrmTeamWorkload);
  const fetchTerritoryPolicy = useServerFn(getCrmTerritoryPolicy);
  const fetchTerritories = useServerFn(listCrmTerritories);
  const saveTerritory = useServerFn(upsertCrmTerritory);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin,
    retry: false,
  });

  const team = useQuery({
    queryKey: ["crm-team-workload", company?.id],
    queryFn: () => fetchTeam({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin && settings.data?.enabled === true,
    retry: false,
  });

  const territoryPolicy = useQuery({
    queryKey: ["crm-territory-policy", company?.id],
    queryFn: () => fetchTerritoryPolicy({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canAdmin && settings.data?.enabled === true,
    retry: false,
  });

  const territories = useQuery({
    queryKey: ["crm-territories", company?.id],
    queryFn: () => fetchTerritories({ data: { companyId: company!.id } }),
    enabled:
      Boolean(company?.id) &&
      canAdmin &&
      settings.data?.enabled === true &&
      territoryPolicy.data?.canManageTerritories === true,
    retry: false,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("No organisation");
      return saveTerritory({
        data: {
          companyId: company.id,
          name,
          code: code || null,
          description: description || null,
          ownerUserId: ownerUserId || null,
          isActive: true,
          sortOrder: 100,
        },
      });
    },
    onSuccess: async () => {
      toast.success("Territory saved");
      setShowForm(false);
      setName("");
      setCode("");
      setDescription("");
      setOwnerUserId("");
      await queryClient.invalidateQueries({ queryKey: ["crm-territories", company?.id] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canAdmin) {
    return (
      <ListWorkspace title="Team & Territories" description="CRM ownership and assignment rules.">
        <EmptyState title="No CRM admin access" description="Ask an administrator for crm.admin." />
      </ListWorkspace>
    );
  }

  const rows = team.data?.members ?? [];
  const policy = territoryPolicy.data ?? team.data?.territory;
  const territoryRows = territories.data ?? [];
  const memberLabel = (userId: string) => {
    const member = rows.find((r) => r.userId === userId);
    if (!member) return userId.slice(0, 8);
    return member.fullName || member.email || userId.slice(0, 8);
  };

  return (
    <ListWorkspace
      title="Team & Territories"
      description="Company member CRM workload plus territory ownership. Automatic routing rules are not enabled yet."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Team & Territories" }]}
      actions={
        policy?.canManageTerritories && settings.data?.enabled ? (
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "New territory"}
          </Button>
        ) : undefined
      }
      subnav={<CrmSubnav current="team" />}
    >
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load CRM settings" />
      ) : settings.isLoading ? (
        <LoadingState />
      ) : null}
      {settings.isSuccess && settings.data && !settings.data.enabled ? (
        <EmptyState
          title="CRM is disabled"
          description="Enable CRM before reviewing team workload."
        />
      ) : null}

      {settings.isSuccess && settings.data?.enabled ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Territories</AlertTitle>
            <AlertDescription>
              {policy?.reason ?? "Territory records are managed here for ownership planning."}
            </AlertDescription>
          </Alert>

          {showForm && policy?.canManageTerritories ? (
            <Card>
              <CardHeader>
                <CardTitle>New territory</CardTitle>
                <CardDescription>Optional owner must be an active company member.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="territory-name">Name</Label>
                  <Input
                    id="territory-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="territory-code">Code</Label>
                  <Input
                    id="territory-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Owner</Label>
                  {team.isError ? (
                    <QueryErrorState
                      queries={[team]}
                      title="Could not load team members"
                      description="Territory can still be created unassigned after retry."
                    />
                  ) : (
                    <RecordLookupSelect
                      value={ownerUserId || "__none"}
                      onValueChange={(v) => setOwnerUserId(v === "__none" ? "" : v)}
                    >
                      <SelectTrigger aria-label="Territory owner">
                        <SelectValue placeholder="Unassigned" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">Unassigned</SelectItem>
                        {rows
                          .filter((m) => m.status === "active")
                          .map((member) => (
                            <SelectItem key={member.userId} value={member.userId}>
                              {member.fullName || member.email || member.userId.slice(0, 8)}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  )}
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="territory-description">Description</Label>
                  <Input
                    id="territory-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button
                    type="button"
                    disabled={
                      createMutation.isPending ||
                      !name.trim() ||
                      (team.isError && Boolean(ownerUserId))
                    }
                    onClick={() => createMutation.mutate()}
                  >
                    {createMutation.isPending ? "Saving…" : "Create territory"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {policy?.canManageTerritories ? (
            <>
              {territories.isLoading ? <LoadingState /> : null}
              {territories.isError ? (
                <QueryErrorState queries={[territories]} title="Could not load territories" />
              ) : null}
              {territories.isSuccess && territoryRows.length === 0 ? (
                <EmptyState
                  title="No territories yet"
                  description="Create a territory to track regional ownership. Auto-assignment rules arrive later."
                  action={
                    policy?.canManageTerritories ? (
                      <Button size="sm" type="button" onClick={() => setShowForm(true)}>
                        New territory
                      </Button>
                    ) : undefined
                  }
                />
              ) : null}
              {territories.isSuccess && territoryRows.length > 0 ? (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Territory</TableHead>
                        <TableHead>Owner</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {territoryRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>
                            <div className="font-medium">{row.name}</div>
                            {row.code ? (
                              <div className="font-mono text-xs text-muted-foreground">
                                {row.code}
                              </div>
                            ) : null}
                            {row.description ? (
                              <div className="text-sm text-muted-foreground">{row.description}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            {row.ownerUserId ? memberLabel(row.ownerUserId) : "Unassigned"}
                          </TableCell>
                          <TableCell>{row.isActive ? "Active" : "Inactive"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : null}
            </>
          ) : null}

          {team.isLoading ? <LoadingState /> : null}
          {team.isError ? (
            <QueryErrorState queries={[team]} title="Could not load team workload" />
          ) : null}
          {team.isSuccess && rows.length === 0 ? (
            <EmptyState
              title="No members"
              description="Invite organisation members first."
              action={
                <Button asChild size="sm">
                  <Link to="/settings" search={{ section: "users" }}>
                    Open users & security
                  </Link>
                </Button>
              }
            />
          ) : null}
          {team.isSuccess && rows.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Member workload</CardTitle>
                <CardDescription>Open CRM leads and opportunities by owner.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Member</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Open leads</TableHead>
                        <TableHead className="text-right">Open opportunities</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.userId}>
                          <TableCell>
                            <div className="font-medium">
                              {row.fullName || row.email || row.userId.slice(0, 8)}
                              {row.isYou ? " (you)" : ""}
                            </div>
                            {row.fullName && row.email ? (
                              <div className="text-sm text-muted-foreground">{row.email}</div>
                            ) : null}
                          </TableCell>
                          <TableCell className="capitalize">{row.role}</TableCell>
                          <TableCell className="capitalize">{row.status}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.openLeadCount}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.openOpportunityCount}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}

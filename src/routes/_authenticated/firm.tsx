import { PracticeWorkBoard } from "@/components/accountant/PracticeWorkBoard";
import { FirmClientPortfolio } from "@/components/firm/FirmClientPortfolio";
import { FirmOnboardingPanel, FirmTeamPanel } from "@/components/firm/FirmOnboardingAndTeam";
import { FirmEngagementPanel } from "@/components/firm/FirmEngagementPanel";
import { FirmStaffAssignments } from "@/components/firm/FirmStaffAssignments";
import { FirmInvitationsPanel } from "@/components/firm/FirmInvitationsPanel";
import { FirmRequestsPanel } from "@/components/firm/FirmRequestsPanel";
import { FirmPartnerPanel } from "@/components/firm/FirmPartnerPanel";
import { FirmAnalyticsPanel, FirmBillingPanel } from "@/components/firm/FirmBillingAnalytics";
import { setActiveCompany } from "@/lib/company.functions";
import { useCanDo } from "@/hooks/use-can";
import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import {
  createFirm,
  linkFirmClient,
  listFirmClientActivity,
  listFirmClients,
  listMyFirms,
  revokeFirmClient,
} from "@/lib/firm/firm.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LookupSelect } from "@/components/lookup";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/firm")({
  head: () => ({ meta: [{ title: "Firm — LinkBooks" }] }),
  component: FirmPage,
});

function FirmPage() {
  const { company } = useActiveCompany();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const switchCompany = useServerFn(setActiveCompany);
  const canLinkCompany = useCanDo("company.settings.edit");
  const fetchFirms = useServerFn(listMyFirms);
  const doCreate = useServerFn(createFirm);
  const fetchClients = useServerFn(listFirmClients);
  const doLink = useServerFn(linkFirmClient);
  const doRevoke = useServerFn(revokeFirmClient);

  const [firmName, setFirmName] = useState("");
  const [tab, setTab] = useState("clients");
  const [selectedFirmId, setSelectedFirmId] = useState("");
  const [accessLevel, setAccessLevel] = useState("view");
  const [activityCompanyId, setActivityCompanyId] = useState("");
  const fetchActivity = useServerFn(listFirmClientActivity);

  const firmsQ = useQuery({
    queryKey: ["my-firms"],
    queryFn: () => fetchFirms(),
  });

  const firmId = selectedFirmId || firmsQ.data?.[0]?.firmId || "";

  const clientsQ = useQuery({
    queryKey: ["firm-clients", firmId],
    enabled: Boolean(firmId),
    queryFn: () => fetchClients({ data: { firmId } }),
  });

  const firmAdmin =
    firmsQ.data?.some((f) => f.firmId === firmId && ["owner", "admin"].includes(f.role)) ?? false;
  const firmOwner = firmsQ.data?.some((f) => f.firmId === firmId && f.role === "owner") ?? false;
  const activityCompany = clientsQ.data?.some((c) => c.company_id === activityCompanyId)
    ? activityCompanyId
    : clientsQ.data?.[0]?.company_id || "";

  const activityQ = useQuery({
    queryKey: ["firm-client-activity", firmId, activityCompany],
    enabled: Boolean(firmId && activityCompany && tab === "activity"),
    queryFn: () => fetchActivity({ data: { firmId, companyId: activityCompany } }),
  });

  const createM = useMutation({
    mutationFn: () => doCreate({ data: { name: firmName } }),
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: ["my-firms"] });
      setSelectedFirmId(r.id);
      setFirmName("");
      toast.success("Firm created");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const linkM = useMutation({
    mutationFn: () => {
      if (!company?.id) throw new Error("Select a company to link as client");
      if (!firmId) throw new Error("Select a firm");
      return doLink({ data: { firmId, companyId: company.id, accessLevel } });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["firm-clients", firmId] });
      await qc.invalidateQueries({ queryKey: ["practice-work"] });
      toast.success("Client linked. Existing organisation roles were preserved.");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const revokeM = useMutation({
    mutationFn: (companyId: string) => doRevoke({ data: { firmId, companyId } }),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["firm-clients", firmId] });
      await qc.invalidateQueries({ queryKey: ["practice-work"] });
      if (result.retained)
        toast.warning(
          "Firm link revoked. Existing or independently modified organisation access was retained; review Users & Access.",
        );
      else toast.success("Firm link and its managed grants revoked");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const openClient = useMutation({
    mutationFn: (companyId: string) => switchCompany({ data: { companyId } }),
    onSuccess: async () => {
      await qc.cancelQueries();
      qc.clear();
      await navigate({ to: "/accountant" });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const createPanel = (
    <div className="grid max-w-lg gap-3 rounded-lg border bg-card p-5">
      <div>
        <h2 className="font-semibold">Create another firm</h2>
        <p className="text-sm text-muted-foreground">
          A separate practice keeps client access and workspaces isolated.
        </p>
      </div>
      <Label htmlFor="firm-name">Firm name</Label>
      <Input
        id="firm-name"
        maxLength={120}
        placeholder="Firm name"
        value={firmName}
        onChange={(event) => setFirmName(event.target.value)}
      />
      <div>
        <Button
          size="sm"
          disabled={createM.isPending || firmName.trim().length < 2}
          onClick={() => createM.mutate()}
        >
          {createM.isPending ? "Creating…" : "Create firm"}
        </Button>
      </div>
    </div>
  );

  return (
    <ListWorkspace
      title="Firm & clients"
      description="Manage your client portfolio, practice work, deadlines, and firm access in one workspace."
    >
      {firmsQ.isPending ? (
        <LoadingState />
      ) : firmsQ.isError ? (
        <ErrorState
          onRetry={() => void firmsQ.refetch()}
          title="Could not load firms"
          description={friendlyAuthError(firmsQ.error)}
        />
      ) : (firmsQ.data ?? []).length === 0 ? (
        <div className="space-y-4">
          <EmptyState
            title="Create your first firm"
            description="A firm workspace lets your authorised team coordinate work across clients."
          />
          {createPanel}
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full max-w-sm space-y-1">
              <Label>Active firm</Label>
              <LookupSelect
                ariaLabel="Active firm"
                allowClear={false}
                value={firmId}
                onChange={(id) => {
                  setSelectedFirmId(id);
                  setActivityCompanyId("");
                  setTab("clients");
                }}
                searchPlaceholder="Search firm"
                options={(firmsQ.data ?? []).map((f) => ({
                  id: f.firmId,
                  name: f.name,
                  label: f.name,
                  meta: f.role,
                  keywords: `${f.name} ${f.role}`,
                }))}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              {firmAdmin ? "Firm administrator" : "Firm team member"}
              <div className="text-xs">Client accounting permissions remain company-specific.</div>
            </div>
          </div>
          <Tabs className="space-y-5" value={tab} onValueChange={setTab}>
            <TabsList className="flex h-auto flex-wrap justify-start gap-1">
              <TabsTrigger value="clients">Clients & overview</TabsTrigger>
              <TabsTrigger value="work">Work & deadlines</TabsTrigger>
              <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
              <TabsTrigger value="engagements">Engagements</TabsTrigger>
              <TabsTrigger value="requests">Client requests</TabsTrigger>
              <TabsTrigger value="billing">Practice billing</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="invitations">Staff invitations</TabsTrigger>
              <TabsTrigger value="activity">Client activity</TabsTrigger>
              <TabsTrigger value="setup">Firm settings</TabsTrigger>
              <TabsTrigger value="partner">Partner programme</TabsTrigger>
            </TabsList>

            <TabsContent value="clients" className="space-y-4">
              {clientsQ.isPending ? (
                <LoadingState />
              ) : clientsQ.isError ? (
                <ErrorState
                  onRetry={() => void clientsQ.refetch()}
                  title="Could not load clients"
                  description={friendlyAuthError(clientsQ.error)}
                />
              ) : (clientsQ.data ?? []).length === 0 ? (
                <div className="space-y-3">
                  <EmptyState
                    title="No linked clients"
                    description="Link an organisation you administer to start using your practice portfolio."
                  />
                  <Button variant="outline" onClick={() => setTab("setup")}>
                    Open firm settings
                  </Button>
                </div>
              ) : (
                <FirmClientPortfolio
                  key={firmId}
                  firmId={firmId}
                  clients={clientsQ.data ?? []}
                  canManage={firmAdmin}
                  busy={openClient.isPending || revokeM.isPending}
                  onOpen={(companyId) => openClient.mutate(companyId)}
                  onRevoke={(companyId) => {
                    if (
                      window.confirm(
                        "Revoke this firm link and its tracked access grants? Independent and legacy memberships will be retained for separate review.",
                      )
                    )
                      revokeM.mutate(companyId);
                  }}
                />
              )}
            </TabsContent>

            <TabsContent value="partner" className="space-y-4">
              <FirmPartnerPanel key={firmId} firmId={firmId} canManage={firmAdmin} />
            </TabsContent>

            <TabsContent value="work" className="space-y-4">
              <PracticeWorkBoard key={firmId} firmId={firmId} />
              <p className="text-sm text-muted-foreground">
                Company permissions determine which client tasks you can access.{" "}
                <Link className="underline" to="/accountant">
                  Open Accountant tools
                </Link>
              </p>
            </TabsContent>

            <TabsContent value="onboarding">
              {clientsQ.isPending ? (
                <LoadingState />
              ) : clientsQ.isError ? (
                <ErrorState
                  onRetry={() => void clientsQ.refetch()}
                  title="Could not load clients"
                  description={friendlyAuthError(clientsQ.error)}
                />
              ) : (
                <FirmOnboardingPanel
                  key={firmId}
                  firmId={firmId}
                  clients={clientsQ.data ?? []}
                  canManage={firmAdmin}
                />
              )}
            </TabsContent>

            <TabsContent value="engagements">
              {clientsQ.isPending ? (
                <LoadingState />
              ) : clientsQ.isError ? (
                <ErrorState
                  onRetry={() => void clientsQ.refetch()}
                  title="Could not load clients"
                  description={friendlyAuthError(clientsQ.error)}
                />
              ) : (
                <FirmEngagementPanel
                  key={firmId}
                  firmId={firmId}
                  clients={clientsQ.data ?? []}
                  canManage={firmAdmin}
                />
              )}
            </TabsContent>

            <TabsContent value="team" className="space-y-6">
              <FirmTeamPanel key={firmId} firmId={firmId} />
              {clientsQ.isPending ? (
                <LoadingState />
              ) : clientsQ.isError ? (
                <ErrorState
                  onRetry={() => void clientsQ.refetch()}
                  title="Could not load clients"
                  description={friendlyAuthError(clientsQ.error)}
                />
              ) : (
                <FirmStaffAssignments
                  key={firmId}
                  firmId={firmId}
                  clients={clientsQ.data ?? []}
                  canManage={firmAdmin}
                />
              )}
            </TabsContent>

            <TabsContent value="requests">
              {clientsQ.isPending ? (
                <LoadingState />
              ) : clientsQ.isError ? (
                <ErrorState
                  onRetry={() => void clientsQ.refetch()}
                  title="Could not load clients"
                  description={friendlyAuthError(clientsQ.error)}
                />
              ) : (
                <FirmRequestsPanel
                  key={firmId}
                  firmId={firmId}
                  clients={clientsQ.data ?? []}
                  canManage={firmAdmin}
                />
              )}
            </TabsContent>

            <TabsContent value="billing">
              {clientsQ.isPending ? (
                <LoadingState />
              ) : clientsQ.isError ? (
                <ErrorState
                  onRetry={() => void clientsQ.refetch()}
                  title="Could not load clients"
                  description={friendlyAuthError(clientsQ.error)}
                />
              ) : (
                <FirmBillingPanel
                  key={firmId}
                  firmId={firmId}
                  clients={clientsQ.data ?? []}
                  canManage={firmAdmin}
                  activeCompanyId={company?.id ?? ""}
                  activeCompanyName={company?.name ?? "No organisation selected"}
                />
              )}
            </TabsContent>

            <TabsContent value="insights">
              <FirmAnalyticsPanel key={firmId} firmId={firmId} />
            </TabsContent>

            <TabsContent value="invitations">
              <FirmInvitationsPanel
                key={firmId}
                firmId={firmId}
                canManage={firmAdmin}
                isOwner={firmOwner}
              />
            </TabsContent>

            <TabsContent value="activity" className="space-y-4">
              <h2 className="text-lg font-semibold">Client activity history</h2>
              {(clientsQ.data ?? []).length === 0 ? (
                <EmptyState
                  title="No linked clients"
                  description="Client activity is available after your first organisation is linked."
                />
              ) : (
                <>
                  <LookupSelect
                    className="max-w-sm"
                    ariaLabel="Client"
                    allowClear={false}
                    value={activityCompany}
                    onChange={setActivityCompanyId}
                    placeholder="Select client"
                    searchPlaceholder="Search client"
                    options={(clientsQ.data ?? []).map((client) => {
                      const name = client.companies?.name ?? "Restricted client";
                      return {
                        id: client.company_id,
                        name,
                        label: name,
                        keywords: name,
                      };
                    })}
                  />
                  {activityQ.isPending ? (
                    <LoadingState rows={3} />
                  ) : activityQ.isError ? (
                    <ErrorState
                      onRetry={() => void activityQ.refetch()}
                      title="Could not load activity"
                      description={friendlyAuthError(activityQ.error)}
                    />
                  ) : (activityQ.data ?? []).length === 0 ? (
                    <EmptyState
                      title="No audit events yet"
                      description="Authorised activity on this client will appear here."
                    />
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>When</TableHead>
                            <TableHead>Action</TableHead>
                            <TableHead>Entity</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activityQ.data!.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell className="whitespace-nowrap text-xs">
                                {new Date(item.created_at).toLocaleString()}
                              </TableCell>
                              <TableCell>{item.action}</TableCell>
                              <TableCell className="text-xs">{item.entity_type}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="setup" className="space-y-5">
              <Alert>
                <AlertDescription>
                  Linking requires owner/admin rights in the active organisation. Revocation only
                  removes tracked, unchanged managed grants; independently assigned and legacy
                  access remains. Review Users & Access after revocation.
                </AlertDescription>
              </Alert>
              <div className="grid max-w-lg gap-3 rounded-lg border bg-card p-5">
                <h2 className="font-semibold">Link client organisation</h2>
                <p className="text-sm text-muted-foreground">
                  Active organisation: <strong>{company?.name ?? "none selected"}</strong>
                </p>
                <Label>Practice access level</Label>
                <Select value={accessLevel} onValueChange={setAccessLevel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">View (read_only)</SelectItem>
                    <SelectItem value="bookkeep">Bookkeep</SelectItem>
                    <SelectItem value="full">Full (accountant)</SelectItem>
                  </SelectContent>
                </Select>
                <div>
                  <Button
                    size="sm"
                    disabled={linkM.isPending || !company?.id || !firmAdmin || !canLinkCompany}
                    onClick={() => linkM.mutate()}
                  >
                    {linkM.isPending ? "Linking…" : "Link client"}
                  </Button>
                </div>
              </div>
              {createPanel}
            </TabsContent>
          </Tabs>
        </>
      )}
    </ListWorkspace>
  );
}

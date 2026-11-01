import { PracticeWorkBoard } from "@/components/accountant/PracticeWorkBoard";
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
import { PageHeader, LoadingState, ErrorState, EmptyState } from "@/components/common/states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Badge } from "@/components/ui/badge";

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
  const activityCompany = clientsQ.data?.some((c) => c.company_id === activityCompanyId)
    ? activityCompanyId
    : clientsQ.data?.[0]?.company_id || "";

  const activityQ = useQuery({
    queryKey: ["firm-client-activity", firmId, activityCompany],
    enabled: Boolean(firmId && activityCompany),
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

  return (
    <>
      <PageHeader
        title="Firm & clients"
        description="Review client work, manage deadlines and coordinate month-end preparation and independent sign-off."
      />
      <Alert className="mb-6">
        <AlertDescription>
          Linking requires you to be owner/admin of the active organisation. Revoking removes
          memberships created and tracked by this workflow. Independent, modified and legacy access
          is preserved. Review Users & Access for retained memberships.
        </AlertDescription>
      </Alert>

      <div className="mb-8 grid max-w-lg gap-3 rounded-md border p-4">
        <Label htmlFor="firm-name">Create firm</Label>
        <Input
          id="firm-name"
          maxLength={120}
          placeholder="Firm name"
          value={firmName}
          onChange={(e) => setFirmName(e.target.value)}
        />
        <Button
          size="sm"
          disabled={createM.isPending || firmName.trim().length < 2}
          onClick={() => createM.mutate()}
        >
          Create
        </Button>
      </div>

      {firmsQ.isPending ? (
        <LoadingState />
      ) : firmsQ.isError ? (
        <ErrorState title="Could not load firms" description={friendlyAuthError(firmsQ.error)} />
      ) : (firmsQ.data ?? []).length === 0 ? (
        <EmptyState
          title="No firms yet"
          description="Create a firm to manage client organisations."
        />
      ) : (
        <>
          <div className="mb-4 max-w-sm space-y-1">
            <Label>Active firm</Label>
            <LookupSelect
              ariaLabel="Active firm"
              allowClear={false}
              value={firmId}
              onChange={(id) => {
                setSelectedFirmId(id);
                setActivityCompanyId("");
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

          <div className="mb-6 grid max-w-lg gap-3 rounded-md border p-4">
            <Label>Link active organisation as client</Label>
            <p className="text-sm text-muted-foreground">
              Active org: <strong>{company?.name ?? "none selected"}</strong>
            </p>
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
            <Button
              size="sm"
              disabled={linkM.isPending || !company?.id || !firmAdmin || !canLinkCompany}
              onClick={() => linkM.mutate()}
            >
              Link client
            </Button>
          </div>

          {clientsQ.isPending ? (
            <LoadingState />
          ) : clientsQ.isError ? (
            <ErrorState
              title="Could not load clients"
              description={friendlyAuthError(clientsQ.error)}
            />
          ) : (clientsQ.data ?? []).length === 0 ? (
            <EmptyState
              title="No linked clients"
              description="Link an organisation you administer."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clientsQ.data!.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{c.companies?.name ?? c.company_id.slice(0, 8)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{c.access_level}</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={openClient.isPending}
                        onClick={() => openClient.mutate(c.company_id)}
                      >
                        Open books
                      </Button>{" "}
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={revokeM.isPending || !firmAdmin}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Revoke this firm link and its tracked access grants? Independent and legacy memberships will be retained for separate review.",
                            )
                          )
                            revokeM.mutate(c.company_id);
                        }}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <PracticeWorkBoard key={firmId} firmId={firmId} />
          <p className="mt-4 text-sm text-muted-foreground">
            Switch into a client via the company switcher once membership is granted. Multi-org
            users always see the active organisation name in the header.{" "}
            <Link className="underline" to="/accountant">
              Accountant checklist
            </Link>
          </p>

          {(clientsQ.data ?? []).length > 0 ? (
            <div className="mt-8 space-y-3">
              <Label>Client activity history</Label>
              <LookupSelect
                className="max-w-sm"
                ariaLabel="Client"
                allowClear={false}
                value={activityCompany}
                onChange={setActivityCompanyId}
                placeholder="Select client"
                searchPlaceholder="Search client"
                options={(clientsQ.data ?? []).map((c) => {
                  const name = c.companies?.name ?? c.company_id.slice(0, 8);
                  return {
                    id: c.company_id,
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
                  title="Could not load activity"
                  description={friendlyAuthError(activityQ.error)}
                />
              ) : (activityQ.data ?? []).length === 0 ? (
                <EmptyState
                  title="No audit events yet"
                  description="Actions on this client will appear here."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Entity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activityQ.data!.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(a.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>{a.action}</TableCell>
                        <TableCell className="text-xs">{a.entity_type}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

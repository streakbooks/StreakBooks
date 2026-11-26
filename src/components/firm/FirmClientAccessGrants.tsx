import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import { listFirmTeam } from "@/lib/firm/firm-workflows.functions";
import {
  listFirmClientAccessGrants,
  requestFirmClientPermissions,
  revokeFirmClientAccessGrant,
  saveFirmClientAccessGrant,
} from "@/lib/firm/firm.functions";
import { LookupSelect } from "@/components/lookup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const roles = ["read_only", "staff", "bookkeeper", "accountant", "admin"] as const;
const elevatedPermissions = [
  "accounting.post",
  "sales.draft",
  "purchases.draft",
  "expenses.submit",
  "banking.feeds.manage",
  "banking.reconcile",
  "members.manage",
  "company.settings.edit",
  "billing.manage",
  "tax.settings",
] as const;

export function FirmClientAccessGrants({
  firmId,
  clients,
  canManage,
}: {
  firmId: string;
  clients: FirmClientRow[];
  canManage: boolean;
}) {
  const clientOptions = useMemo(
    () => clients.filter((client) => Boolean(client.companies)),
    [clients],
  );
  const [clientSelection, setClientSelection] = useState("");
  const companyId = clientOptions.some((client) => client.company_id === clientSelection)
    ? clientSelection
    : (clientOptions[0]?.company_id ?? "");
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<(typeof roles)[number]>("read_only");
  const [permissionKey, setPermissionKey] =
    useState<(typeof elevatedPermissions)[number]>("accounting.post");
  const [reason, setReason] = useState("");
  const qc = useQueryClient();
  const loadTeam = useServerFn(listFirmTeam);
  const loadGrants = useServerFn(listFirmClientAccessGrants);
  const saveGrant = useServerFn(saveFirmClientAccessGrant);
  const revokeGrant = useServerFn(revokeFirmClientAccessGrant);
  const requestPermissions = useServerFn(requestFirmClientPermissions);
  const teamQ = useQuery({
    queryKey: ["firm-access-grant-team", firmId],
    enabled: Boolean(firmId && canManage),
    queryFn: () => loadTeam({ data: { firmId } }),
  });
  const grantsQ = useQuery({
    queryKey: ["firm-client-access-grants", firmId, companyId],
    enabled: Boolean(firmId && companyId && canManage),
    queryFn: () => loadGrants({ data: { firmId, companyId } }),
  });
  const selectedUserId = (teamQ.data ?? []).some((member) => member.user_id === userId)
    ? userId
    : (teamQ.data?.[0]?.user_id ?? "");
  const names = new Map(
    (teamQ.data ?? []).map((member) => [
      member.user_id,
      member.full_name || member.email || "Firm staff",
    ]),
  );

  const grantM = useMutation({
    mutationFn: () => saveGrant({ data: { firmId, companyId, userId: selectedUserId, role } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["firm-client-access-grants", firmId, companyId] });
      await qc.invalidateQueries({ queryKey: ["firm-clients", firmId] });
      toast.success("Client access grant saved");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const revokeM = useMutation({
    mutationFn: (staffId: string) => revokeGrant({ data: { firmId, companyId, userId: staffId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["firm-client-access-grants", firmId, companyId] });
      await qc.invalidateQueries({ queryKey: ["firm-clients", firmId] });
      toast.success("Client access removed");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const requestM = useMutation({
    mutationFn: () =>
      requestPermissions({
        data: {
          firmId,
          companyId,
          userId: selectedUserId,
          permissionKeys: [permissionKey],
          requestReason: reason,
        },
      }),
    onSuccess: () => {
      setReason("");
      toast.success("Client approval request sent");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (!canManage) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Client access by staff member</CardTitle>
        <CardDescription>
          Assign each staff member to specific clients. Firm access does not use a client licence.
          Creating or posting transactions, bank feeds, settings, billing, and member administration
          need client approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {clientOptions.length === 0 ? (
          <EmptyState
            title="No linked clients"
            description="Link a client before assigning access."
          />
        ) : (
          <>
            {teamQ.isPending ? <LoadingState /> : null}
            {teamQ.isError ? (
              <QueryErrorState queries={[teamQ]} title="Could not load firm staff" />
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Client</Label>
                <LookupSelect
                  ariaLabel="Choose client for access grants"
                  allowClear={false}
                  value={companyId}
                  onChange={setClientSelection}
                  options={clientOptions.map((client) => ({
                    id: client.company_id,
                    name: getFirmClientName(client),
                    label: getFirmClientName(client),
                  }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Firm staff member</Label>
                <Select value={selectedUserId} onValueChange={setUserId}>
                  <SelectTrigger aria-label="Choose firm staff member">
                    <SelectValue placeholder="Choose staff" />
                  </SelectTrigger>
                  <SelectContent>
                    {(teamQ.data ?? []).map((member) => (
                      <SelectItem key={member.user_id} value={member.user_id}>
                        {member.full_name || member.email || "Firm staff"} ({member.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Role for this client</Label>
                <Select
                  value={role}
                  onValueChange={(value) => setRole(value as (typeof roles)[number])}
                >
                  <SelectTrigger aria-label="Choose role for client">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item.replaceAll("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button
                  disabled={!selectedUserId || grantM.isPending}
                  onClick={() => grantM.mutate()}
                >
                  Save client access
                </Button>
              </div>
            </div>

            {grantsQ.isPending ? <LoadingState /> : null}
            {grantsQ.isError ? (
              <QueryErrorState queries={[grantsQ]} title="Could not load client grants" />
            ) : null}
            {grantsQ.isSuccess && grantsQ.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No firm staff currently have this client assigned.
              </p>
            ) : null}
            {(grantsQ.data ?? []).map((grant) => (
              <div
                key={grant.user_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <p className="font-medium">{names.get(grant.user_id) ?? "Firm staff"}</p>
                  <p className="text-sm capitalize text-muted-foreground">
                    {grant.role.replaceAll("_", " ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={revokeM.isPending}
                  onClick={() => revokeM.mutate(grant.user_id)}
                >
                  Remove access
                </Button>
              </div>
            ))}

            <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
              <div className="space-y-2">
                <Label>Elevated access request</Label>
                <Select
                  value={permissionKey}
                  onValueChange={(value) =>
                    setPermissionKey(value as (typeof elevatedPermissions)[number])
                  }
                >
                  <SelectTrigger aria-label="Choose elevated client permission">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {elevatedPermissions.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="firm-access-request-reason">Reason for client review</Label>
                <Input
                  id="firm-access-request-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                />
              </div>
              <Button
                variant="outline"
                disabled={
                  !selectedUserId ||
                  !grantsQ.data?.some((grant) => grant.user_id === selectedUserId) ||
                  reason.trim().length < 10 ||
                  requestM.isPending
                }
                onClick={() => requestM.mutate()}
              >
                Request approval
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

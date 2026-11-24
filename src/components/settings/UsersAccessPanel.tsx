import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Lock } from "lucide-react";
import { toast } from "sonner";
import { listCompanyMembers, type CompanyMember } from "@/lib/company.functions";
import {
  createCompanyInvitation,
  listCompanyInvitations,
  revokeCompanyInvitation,
  updateMemberRole,
} from "@/lib/settings/org-settings.functions";
import {
  listMemberAdjustments,
  removeCompanyMember,
  saveMemberAdjustments,
  setMemberStatus,
} from "@/lib/settings/member-access.functions";
import {
  ACCESS_AREAS,
  adjustmentsFromSelection,
  effectivePermissions,
  isRoleLockedPermission,
  selectionFromEffective,
  type AccessAdjustment,
} from "@/lib/access-catalogue";
import { roleLabels, type CompanyRole } from "@/lib/company-constants";
import { ROLE_SUMMARIES } from "@/lib/access-role-summaries";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useCan } from "@/hooks/use-can";
import { useActiveCompany } from "@/hooks/use-active-company";
import { permissionsForRole, type Permission } from "@/lib/permissions";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const INVITE_ROLES: CompanyRole[] = ["admin", "accountant", "bookkeeper", "staff", "read_only"];

type Invitation = {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  expires_at: string;
};

type AdjustmentRow = { userId: string; permission: Permission; effect: "grant" | "deny" };

export function UsersAccessPanel({ companyId }: { companyId: string }) {
  const { can, ready } = useCan();
  const canView = can("members.view");
  const canManage = can("members.manage");
  const canGrantOwner = can("members.grant_owner");
  const { company } = useActiveCompany();
  const actorPermissions = new Set<Permission>(
    company?.permissions ?? (company?.role ? permissionsForRole(company.role) : []),
  );

  const qc = useQueryClient();
  const fetchMembers = useServerFn(listCompanyMembers);
  const fetchAdjustments = useServerFn(listMemberAdjustments);
  const fetchInvitations = useServerFn(listCompanyInvitations);

  const membersQuery = useQuery({
    queryKey: ["company-members", companyId],
    enabled: ready && canView,
    queryFn: () => fetchMembers({ data: { companyId } }),
  });
  const adjustmentsQuery = useQuery({
    queryKey: ["member-adjustments", companyId],
    enabled: ready && canView,
    queryFn: () => fetchAdjustments({ data: { companyId } }),
  });
  const invitationsQuery = useQuery({
    queryKey: ["company-invitations", companyId],
    enabled: ready && canManage,
    queryFn: () => fetchInvitations({ data: { companyId } }),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const members = membersQuery.data ?? [];
  const selected = members.find((member) => member.user_id === selectedId) ?? null;
  const activeOwners = members.filter(
    (member) => member.role === "owner" && member.status === "active",
  ).length;

  if (!ready) return <LoadingState rows={3} />;
  if (!canView) {
    return (
      <Alert>
        <AlertTitle>People</AlertTitle>
        <AlertDescription>You need access to view people in this organisation.</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">People and access</CardTitle>
          <CardDescription>
            Each person has a duty role. Document, bank, ledger and report access can be tailored
            for that person. Settings, people, billing and ownership stay with the role. The last
            owner cannot be removed. Access is enforced in the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {membersQuery.isPending || adjustmentsQuery.isPending ? (
            <LoadingState rows={3} />
          ) : membersQuery.isError || adjustmentsQuery.isError ? (
            <QueryErrorState
              queries={[membersQuery, adjustmentsQuery]}
              title="Could not load people"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Access</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  const custom = (adjustmentsQuery.data ?? []).some(
                    (row) => row.userId === member.user_id,
                  );
                  return (
                    <TableRow
                      key={member.user_id}
                      data-state={selectedId === member.user_id ? "selected" : undefined}
                    >
                      <TableCell>
                        {member.full_name || "—"}
                        {member.is_you ? " (you)" : ""}
                      </TableCell>
                      <TableCell>{member.email || "—"}</TableCell>
                      <TableCell>{roleLabels[member.role] ?? member.role}</TableCell>
                      <TableCell>
                        {member.role === "owner" ? (
                          <Badge variant="neutral">Full</Badge>
                        ) : custom ? (
                          <Badge variant="info">Tailored</Badge>
                        ) : (
                          <Badge variant="secondary">Role default</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={member.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedId(member.user_id)}
                        >
                          {canManage && !member.is_you ? "Manage" : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {selected ? (
            <MemberEditor
              key={selected.user_id}
              companyId={companyId}
              member={selected}
              adjustments={(adjustmentsQuery.data ?? []).filter(
                (row) => row.userId === selected.user_id,
              )}
              canManage={canManage}
              canGrantOwner={canGrantOwner}
              actorPermissions={actorPermissions}
              soleOwner={
                selected.role === "owner" && selected.status === "active" && activeOwners <= 1
              }
              onClose={() => setSelectedId(null)}
              onSaved={async () => {
                await qc.invalidateQueries({ queryKey: ["company-members", companyId] });
                await qc.invalidateQueries({ queryKey: ["member-adjustments", companyId] });
              }}
            />
          ) : null}
        </CardContent>
      </Card>

      {canManage ? (
        <InvitationsCard
          companyId={companyId}
          actorPermissions={actorPermissions}
          invitations={(invitationsQuery.data ?? []) as Invitation[]}
          isPending={invitationsQuery.isPending}
          isError={invitationsQuery.isError}
          error={invitationsQuery.error}
          onRetry={() => invitationsQuery.refetch()}
          onChanged={async () => {
            await qc.invalidateQueries({ queryKey: ["company-invitations", companyId] });
          }}
        />
      ) : null}
    </div>
  );
}

function MemberEditor({
  companyId,
  member,
  adjustments,
  canManage,
  canGrantOwner,
  actorPermissions,
  soleOwner,
  onClose,
  onSaved,
}: {
  companyId: string;
  member: CompanyMember;
  adjustments: AdjustmentRow[];
  canManage: boolean;
  canGrantOwner: boolean;
  actorPermissions: Set<Permission>;
  soleOwner: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const changeRole = useServerFn(updateMemberRole);
  const saveAccess = useServerFn(saveMemberAdjustments);
  const setStatus = useServerFn(setMemberStatus);
  const removeMember = useServerFn(removeCompanyMember);
  const managesOwner = member.role === "owner" && !canGrantOwner;
  const editable = canManage && !member.is_you && !managesOwner && !soleOwner;
  const [role, setRole] = useState<CompanyRole>(member.role);
  const [selected, setSelected] = useState<Set<Permission>>(() =>
    selectionFromEffective(
      effectivePermissions(
        member.role,
        adjustments.map((row) => ({ permission: row.permission, effect: row.effect })),
      ),
    ),
  );
  const [confirm, setConfirm] = useState<"suspend" | "remove" | null>(null);

  const roleOptions = (Object.keys(roleLabels) as CompanyRole[]).filter(
    (item) => item !== "owner" || canGrantOwner,
  );

  const save = useMutation({
    mutationFn: async () => {
      const next = role === "owner" ? [] : adjustmentsFromSelection(role, selected);
      const current = adjustments.map((row) => ({
        permission: row.permission,
        effect: row.effect,
      }));
      const roleChanged = role !== member.role;
      const accessChanged =
        next.length !== current.length ||
        next.some(
          (item) =>
            !current.some(
              (existing) =>
                existing.permission === item.permission && existing.effect === item.effect,
            ),
        );
      if (!roleChanged && !accessChanged) return false;
      if (roleChanged) {
        await changeRole({ data: { companyId, userId: member.user_id, role } });
      }
      if (role !== "owner" && (accessChanged || (roleChanged && next.length > 0))) {
        await saveAccess({
          data: { companyId, userId: member.user_id, role, adjustments: next },
        });
      }
      return true;
    },
    onSuccess: async (changed) => {
      if (!changed) {
        toast.message("Access is already up to date");
        return;
      }
      await onSaved();
      toast.success("Access updated");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const statusChange = useMutation({
    mutationFn: async (status: "active" | "suspended") => {
      await setStatus({ data: { companyId, userId: member.user_id, status } });
    },
    onSuccess: async () => {
      setConfirm(null);
      await onSaved();
      toast.success(member.status === "suspended" ? "Access restored" : "Access suspended");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const remove = useMutation({
    mutationFn: async () => {
      await removeMember({ data: { companyId, userId: member.user_id } });
    },
    onSuccess: async () => {
      setConfirm(null);
      onClose();
      await onSaved();
      toast.success("Access removed");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{member.full_name || member.email || "Person"}</h3>
          <p className="text-sm text-muted-foreground">{ROLE_SUMMARIES[role]}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      {member.is_you ? (
        <Alert className="mb-4">
          <AlertTitle>Your access</AlertTitle>
          <AlertDescription>
            Another owner or administrator changes your role and access.
          </AlertDescription>
        </Alert>
      ) : null}
      {soleOwner ? (
        <Alert className="mb-4">
          <AlertTitle>Last owner</AlertTitle>
          <AlertDescription>
            Add another owner before changing, suspending or removing this person.
          </AlertDescription>
        </Alert>
      ) : null}
      {managesOwner && !member.is_you ? (
        <Alert className="mb-4">
          <AlertTitle>Owner</AlertTitle>
          <AlertDescription>Only an owner can change another owner.</AlertDescription>
        </Alert>
      ) : null}

      <div className="mb-4 max-w-sm space-y-1">
        <Label>Duty role</Label>
        {editable ? (
          <Select
            value={role}
            onValueChange={(value) => {
              const next = value as CompanyRole;
              setRole(next);
              setSelected(selectionFromEffective(effectivePermissions(next)));
            }}
          >
            {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {roleOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {roleLabels[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <p className="text-sm">{roleLabels[member.role] ?? member.role}</p>
        )}
      </div>

      <AccessChecklist
        role={role}
        selected={selected}
        actorPermissions={actorPermissions}
        disabled={!editable || role === "owner"}
        onToggle={(permission, on) => {
          setSelected((current) => {
            const next = new Set(current);
            if (on) next.add(permission);
            else next.delete(permission);
            return next;
          });
        }}
      />

      {editable ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            Save access
          </Button>
          {member.status === "active" ? (
            <Button size="sm" variant="outline" onClick={() => setConfirm("suspend")}>
              Suspend
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={statusChange.isPending}
              onClick={() => statusChange.mutate("active")}
            >
              Restore access
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setConfirm("remove")}>
            Remove
          </Button>
        </div>
      ) : null}

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "remove" ? "Remove this person?" : "Suspend this person?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "remove"
                ? "They lose access to this organisation immediately. Their posted accounting history stays."
                : "They cannot open this organisation until an owner or administrator restores them. Posted history stays."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (confirm === "remove") remove.mutate();
                else statusChange.mutate("suspended");
              }}
            >
              {confirm === "remove" ? "Remove" : "Suspend"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function InvitationsCard({
  companyId,
  actorPermissions,
  invitations,
  isPending,
  isError,
  error,
  onRetry,
  onChanged,
}: {
  companyId: string;
  actorPermissions: Set<Permission>;
  invitations: Invitation[];
  isPending: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  onChanged: () => Promise<void>;
}) {
  const create = useServerFn(createCompanyInvitation);
  const revoke = useServerFn(revokeCompanyInvitation);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CompanyRole>("staff");
  const [selected, setSelected] = useState<Set<Permission>>(() =>
    selectionFromEffective(effectivePermissions("staff")),
  );
  const [customise, setCustomise] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  const createM = useMutation({
    mutationFn: async () => {
      const adjustments: AccessAdjustment[] = customise
        ? adjustmentsFromSelection(role, selected)
        : [];
      return create({ data: { companyId, email, role, adjustments } });
    },
    onSuccess: async (result) => {
      const origin = window.location.origin;
      setLink(`${origin}/invite/${result.inviteToken}`);
      setEmail("");
      await onChanged();
      toast.success("Invitation created. Copy the link — it is shown once.");
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  const revokeM = useMutation({
    mutationFn: (invitationId: string) => revoke({ data: { companyId, invitationId } }),
    onSuccess: async () => {
      await onChanged();
      toast.success("Invitation revoked");
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Invitations</CardTitle>
        <CardDescription>
          A link expires in 7 days and works only for the invited email address. Creating another
          invitation for the same address replaces the pending one. Outbound email is not
          configured, so StreakBooks does not claim the invitation was emailed.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_14rem_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="invite-email">Email</Label>
            <Input
              id="invite-email"
              type="email"
              autoComplete="off"
              placeholder="colleague@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Duty role</Label>
            <Select
              value={role}
              onValueChange={(value) => {
                const next = value as CompanyRole;
                setRole(next);
                setSelected(selectionFromEffective(effectivePermissions(next)));
              }}
            >
              {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}

              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVITE_ROLES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {roleLabels[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button disabled={!email.trim() || createM.isPending} onClick={() => createM.mutate()}>
            Create invitation
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">{ROLE_SUMMARIES[role]}</p>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setCustomise((open) => !open)}
        >
          {customise ? "Hide tailored access" : "Tailor access for this invitation"}
        </Button>
        {customise ? (
          <AccessChecklist
            role={role}
            selected={selected}
            actorPermissions={actorPermissions}
            disabled={false}
            onToggle={(permission, on) => {
              setSelected((current) => {
                const next = new Set(current);
                if (on) next.add(permission);
                else next.delete(permission);
                return next;
              });
            }}
          />
        ) : null}
        {link ? (
          <div className="space-y-2 rounded-md border bg-muted/40 p-3">
            <p className="text-sm font-medium">Invitation link</p>
            <p className="break-all text-xs">{link}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={async () => {
                await navigator.clipboard.writeText(link);
                toast.success("Link copied");
              }}
            >
              <Copy className="mr-1 size-4" />
              Copy link
            </Button>
          </div>
        ) : null}
        {isPending ? (
          <LoadingState rows={2} />
        ) : isError ? (
          <QueryErrorState
            queries={[{ isError, error, refetch: onRetry }]}
            title="Could not load invitations"
          />
        ) : invitations.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invitations yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {invitations.map((invitation) => (
              <li
                key={invitation.id}
                className="flex flex-wrap items-center justify-between gap-2 border-b py-2"
              >
                <span>
                  {invitation.email} ·{" "}
                  {roleLabels[invitation.role as CompanyRole] ?? invitation.role}{" "}
                  <Badge variant="outline">{invitation.status}</Badge>
                  {invitation.status === "pending" || invitation.status === "expired" ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {invitation.status === "expired" ? "Expired" : "Expires"}{" "}
                      {new Date(invitation.expires_at).toLocaleDateString()}
                    </span>
                  ) : null}
                </span>
                {invitation.status === "pending" || invitation.status === "expired" ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={revokeM.isPending}
                    onClick={() => revokeM.mutate(invitation.id)}
                  >
                    Revoke
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AccessChecklist({
  role,
  selected,
  actorPermissions,
  disabled,
  onToggle,
}: {
  role: CompanyRole;
  selected: Set<Permission>;
  actorPermissions: Set<Permission>;
  disabled: boolean;
  onToggle: (permission: Permission, on: boolean) => void;
}) {
  const baseline = useMemo(() => new Set(effectivePermissions(role)), [role]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {ACCESS_AREAS.map((area) => (
        <section
          key={area.id}
          className="rounded-md border p-3"
          aria-labelledby={`access-${area.id}`}
        >
          <h4 id={`access-${area.id}`} className="text-sm font-semibold">
            {area.label}
          </h4>
          <p className="mb-3 text-xs text-muted-foreground">{area.description}</p>
          <ul className="space-y-3">
            {area.items.map((item) => {
              const locked = isRoleLockedPermission(item.permission) || role === "owner";
              const included = locked
                ? baseline.has(item.permission)
                : selected.has(item.permission);
              const actorCanGrant =
                actorPermissions.has(item.permission) || baseline.has(item.permission);
              const controlDisabled = disabled || locked || (!included && !actorCanGrant);
              return (
                <li key={item.permission}>
                  <label className="flex items-start gap-3">
                    <Checkbox
                      className="mt-0.5"
                      checked={included}
                      disabled={controlDisabled}
                      onCheckedChange={(value) => onToggle(item.permission, value === true)}
                      aria-label={item.label}
                    />
                    <span>
                      <span className="flex items-center gap-1 text-sm">
                        {locked ? (
                          <Lock className="size-3 text-muted-foreground" aria-hidden />
                        ) : null}
                        {item.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {locked ? "Comes from the duty role. " : ""}
                        {!locked && !included && !actorCanGrant
                          ? "You can only add access you already hold. "
                          : ""}
                        {item.detail}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "suspended") return <Badge variant="warning">Suspended</Badge>;
  return <Badge variant="neutral">{status}</Badge>;
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  createFirmStaffInvitation,
  listFirmStaffInvitations,
  revokeFirmStaffInvitation,
} from "@/lib/firm/firm-invites.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";

export function FirmInvitationsPanel({
  firmId,
  canManage,
  isOwner,
}: {
  firmId: string;
  canManage: boolean;
  isOwner: boolean;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [newLink, setNewLink] = useState("");
  const [delivery, setDelivery] = useState("");
  const list = useServerFn(listFirmStaffInvitations);
  const create = useServerFn(createFirmStaffInvitation);
  const revoke = useServerFn(revokeFirmStaffInvitation);
  const qc = useQueryClient();
  const key = ["firm-staff-invitations", firmId];
  const q = useQuery({
    queryKey: key,
    enabled: canManage,
    queryFn: () => list({ data: { firmId } }),
  });
  const createM = useMutation({
    mutationFn: () => create({ data: { firmId, email, role } }),
    onSuccess: async (result) => {
      setEmail("");
      setNewLink(result.path);
      setDelivery(result.deliveryStatus);
      await qc.invalidateQueries({ queryKey: key });
      toast.success("Invitation created");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const revokeM = useMutation({
    mutationFn: (inviteId: string) => revoke({ data: { inviteId } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: key });
      toast.success("Invitation revoked");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (!canManage) {
    return (
      <EmptyState
        title="Firm invitations are administrator-only"
        description="Ask a firm owner or administrator to invite a new team member."
      />
    );
  }

  return (
    <section className="space-y-5" aria-label="Firm staff invitations">
      <div>
        <h2 className="text-lg font-semibold">Invite firm staff</h2>
        <p className="text-sm text-muted-foreground">
          Invited colleagues must verify their email, sign in, and accept a single-use link. Joining
          the firm never grants automatic access to client accounting books.
        </p>
      </div>
      <form
        className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_160px_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setNewLink("");
          createM.mutate();
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="firm-invite-email">Email address</Label>
          <Input
            id="firm-invite-email"
            type="email"
            required
            maxLength={254}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="colleague@example.com"
          />
        </div>
        <div className="space-y-1">
          <Label>Firm role</Label>
          <Select value={role} onValueChange={(value) => setRole(value as "member" | "admin")}>
            <SelectTrigger aria-label="Invited firm role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="member">Member</SelectItem>
              {isOwner ? <SelectItem value="admin">Administrator</SelectItem> : null}
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="self-end" disabled={createM.isPending}>
          {createM.isPending ? "Inviting…" : "Create invitation"}
        </Button>
      </form>
      {newLink ? (
        <div className="space-y-2 rounded-lg border p-4" role="status">
          <p className="text-sm font-medium">
            {delivery === "provider_accepted"
              ? "Email provider accepted the invitation for delivery."
              : "Invitation created. Automatic delivery is not verified; share this link securely."}
          </p>
          <p className="text-xs text-muted-foreground">
            The link is visible only now. It expires in seven days; do not post it publicly.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.origin + newLink);
                toast.success("Invitation link copied");
              } catch {
                toast.error("Could not copy the invitation link");
              }
            }}
          >
            Copy invitation link
          </Button>
        </div>
      ) : null}
      {q.isPending ? (
        <LoadingState rows={3} />
      ) : q.isError ? (
        <ErrorState title="Could not load invitations" description={friendlyAuthError(q.error)} />
      ) : !q.data?.length ? (
        <EmptyState
          title="No invitations yet"
          description="Use this page to invite staff without changing client memberships."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Role</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Delivery</th>
                <th className="p-3 font-medium">Expires</th>
                <th className="p-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((item) => (
                <tr className="border-t" key={item.id}>
                  <td className="p-3">{item.email}</td>
                  <td className="p-3 capitalize">{item.role}</td>
                  <td className="p-3">
                    <Badge variant="secondary">{item.status}</Badge>
                  </td>
                  <td className="p-3">
                    {item.deliveryStatus === "provider_accepted"
                      ? "Accepted by email provider"
                      : item.deliveryStatus.replaceAll("_", " ")}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    {new Date(item.expiresAt).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    {item.status === "pending" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={revokeM.isPending}
                        onClick={() => {
                          if (window.confirm("Revoke this unused invitation?"))
                            revokeM.mutate(item.id);
                        }}
                      >
                        Revoke
                      </Button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

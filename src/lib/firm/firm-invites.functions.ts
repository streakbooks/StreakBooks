import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { configuredInvitationOrigin, firmInvitePath } from "@/lib/firm/invite-link";

const firmInput = z.object({ firmId: z.string().uuid() }).strict();
const createInput = firmInput
  .extend({
    email: z.email().max(254),
    role: z.enum(["member", "admin"]),
  })
  .strict();
const tokenInput = z
  .object({
    token: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
const revokeInput = z.object({ inviteId: z.string().uuid() }).strict();

type InviteDeliveryStatus =
  "not_attempted" | "provider_accepted" | "failed" | "not_configured" | "domain_unverified";

export type FirmStaffInvitation = {
  id: string;
  email: string;
  role: "member" | "admin";
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  deliveryStatus: InviteDeliveryStatus;
};

export type FirmInvitationPreview = {
  firmId?: string;
  firmName?: string;
  role?: "member" | "admin";
  expiresAt?: string;
  status: "pending" | "accepted" | "expired" | "revoked" | "different_account";
};

export const listFirmStaffInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => firmInput.parse(value))
  .handler(async ({ data, context }): Promise<FirmStaffInvitation[]> => {
    const { data: rows, error } = await context.supabase.rpc(
      "firm_invite_list" as never,
      { _firm_id: data.firmId } as never,
    );
    if (error) throw new Error(error.message);
    return (rows ?? []) as FirmStaffInvitation[];
  });

export const createFirmStaffInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => createInput.parse(value))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: issued, error } = await sb.rpc(
      "firm_invite_create" as never,
      { _firm_id: data.firmId, _email: data.email, _role: data.role } as never,
    );
    if (error) throw new Error(error.message);
    const invitation = issued as {
      id: string;
      token: string;
      email: string;
      role: string;
      expiresAt: string;
    } | null;
    if (!invitation?.id) throw new Error("Firm invitation could not be created");
    const path = firmInvitePath(invitation.token);
    const origin = configuredInvitationOrigin(process.env["APP_BASE_URL"]);
    let deliveryStatus: FirmStaffInvitation["deliveryStatus"] = "not_configured";
    let messageId: string | null = null;
    if (origin) {
      const { readEmailConfig, checkResendDomain, sendViaResend } =
        await import("@/lib/documents/email-provider.server");
      const config = readEmailConfig();
      if (config.configured) {
        const domain = await checkResendDomain(config);
        if (domain.state !== "verified") {
          deliveryStatus = "domain_unverified";
        } else {
          const { data: firm, error: firmError } = await sb
            .from("firms" as never)
            .select("name" as never)
            .eq("id" as never, data.firmId as never)
            .single();
          if (firmError) throw new Error(firmError.message);
          const name = (firm as { name: string }).name;
          const link = origin + path;
          const message = [
            "You have been invited to join " + name + " as a " + invitation.role + " in LinkBooks.",
            "Open this link and sign in using the invited email address:",
            link,
            "This link expires in seven days. Accepting an invitation does not grant access to client books.",
          ].join("\n\n");
          const { escapeHtml } = await import("@/lib/documents/email-templates");
          const result = await sendViaResend(config, {
            to: [invitation.email],
            subject: "Invitation to " + name + " on LinkBooks",
            text: message,
            html: "<p>" + message.split("\n\n").map(escapeHtml).join("</p><p>") + "</p>",
            idempotencyKey: "firm-invite-" + invitation.id,
          });
          deliveryStatus = result.ok ? "provider_accepted" : "failed";
          messageId = result.ok ? result.messageId : null;
        }
      }
    }
    const { error: recordError } = await sb.rpc(
      "firm_invite_delivery" as never,
      { _id: invitation.id, _status: deliveryStatus, _provider_message_id: messageId } as never,
    );
    if (recordError)
      throw new Error("Invite created but delivery audit failed: " + recordError.message);
    return {
      id: invitation.id,
      email: invitation.email,
      expiresAt: invitation.expiresAt,
      deliveryStatus,
      path,
      // The token is returned only once to the authorized creating administrator.
      // Do not persist it in a browser cache or query key.
    };
  });

export const previewFirmStaffInvitation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => tokenInput.parse(value))
  .handler(async ({ data, context }): Promise<FirmInvitationPreview | null> => {
    const { data: preview, error } = await context.supabase.rpc(
      "firm_invite_preview" as never,
      { _token: data.token } as never,
    );
    if (error) throw new Error(error.message);
    return (preview ?? null) as FirmInvitationPreview | null;
  });

export const acceptFirmStaffInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => tokenInput.parse(value))
  .handler(async ({ data, context }): Promise<{ firmId: string; role: string }> => {
    const { data: accepted, error } = await context.supabase.rpc(
      "firm_invite_accept" as never,
      { _token: data.token } as never,
    );
    if (error) throw new Error(error.message);
    return accepted as { firmId: string; role: string };
  });

export const revokeFirmStaffInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => revokeInput.parse(value))
  .handler(async ({ data, context }) => {
    const { data: revoked, error } = await context.supabase.rpc(
      "firm_invite_revoke" as never,
      { _id: data.inviteId } as never,
    );
    if (error) throw new Error(error.message);
    if (!revoked) throw new Error("Invitation was already accepted, revoked or expired");
    return { ok: true };
  });

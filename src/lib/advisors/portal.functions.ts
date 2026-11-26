import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapClient, type AdvisorsClient } from "@/lib/advisors/management";
import {
  mapBookingReminder,
  mapPortalAppointment,
  mapPortalDocument,
  mapPortalHome,
  mapPortalInvite,
  mapPortalMessage,
  mapPortalNotification,
  mapPortalServiceRequest,
  mapPortalTask,
  type AdvisorsBookingReminder,
  type AdvisorsPortalAppointment,
  type AdvisorsPortalDocument,
  type AdvisorsPortalHome,
  type AdvisorsPortalInvite,
  type AdvisorsPortalMessage,
  type AdvisorsPortalNotification,
  type AdvisorsPortalServiceRequest,
  type AdvisorsPortalTask,
} from "@/lib/advisors/portal";

type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }>;
};

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) {
    const message = error.message ?? "Advisors portal request failed.";
    if (
      message.includes("schema cache") ||
      message.includes("Could not find the function") ||
      message.includes("PGRST202")
    ) {
      throw new Error(
        "Advisors portal is not available in this database yet. Apply the Advisors SQL migrations (AD-09), then reload the API schema cache and try again.",
      );
    }
    throw new Error(message);
  }
  return data;
}

function appOrigin(): string {
  const configured = (process.env["APP_ORIGIN"] ?? process.env["VITE_APP_ORIGIN"] ?? "").trim();
  if (configured) return configured.replace(/\/$/, "");
  return "http://localhost:8080";
}

const reasonSchema = z.string().trim().min(3).max(500);

export const getAdvisorsPortalHome = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorsPortalHome> => {
    return mapPortalHome(await callRpc(context.supabase, "advisors_portal_home"));
  });

export const listAdvisorsPortalAppointments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorsPortalAppointment[]> => {
    const raw = await callRpc(context.supabase, "advisors_portal_list_appointments");
    return Array.isArray(raw) ? raw.map(mapPortalAppointment) : [];
  });

export const listAdvisorsPortalTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorsPortalTask[]> => {
    const raw = await callRpc(context.supabase, "advisors_portal_list_tasks");
    return Array.isArray(raw) ? raw.map(mapPortalTask) : [];
  });

export const listAdvisorsPortalDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorsPortalDocument[]> => {
    const raw = await callRpc(context.supabase, "advisors_portal_list_documents");
    return Array.isArray(raw) ? raw.map(mapPortalDocument) : [];
  });

export const markAdvisorsPortalDocumentReceived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        requestId: z.string().uuid(),
        note: z.string().trim().max(1000).optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsPortalDocument> => {
    const raw = await callRpc(context.supabase, "advisors_portal_mark_document_received", {
      _request_id: data.requestId,
      _note: data.note ?? "",
    });
    return mapPortalDocument(raw);
  });

export const listAdvisorsPortalMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorsPortalMessage[]> => {
    const raw = await callRpc(context.supabase, "advisors_portal_list_messages", {
      _limit: 100,
    });
    return Array.isArray(raw) ? raw.map(mapPortalMessage) : [];
  });

export const sendAdvisorsPortalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ body: z.string().trim().min(1).max(4000) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsPortalMessage> => {
    return mapPortalMessage(
      await callRpc(context.supabase, "advisors_portal_send_message", {
        _body: data.body,
      }),
    );
  });

export const updateAdvisorsPortalContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(1).max(120).optional(),
        businessName: z.string().trim().max(160).optional(),
        phone: z.string().trim().max(40).optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsClient> => {
    return mapClient(
      await callRpc(context.supabase, "advisors_portal_update_contact", {
        _payload: {
          name: data.name,
          businessName: data.businessName,
          phone: data.phone,
        },
      }),
    );
  });

export const createAdvisorsPortalServiceRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        kind: z.enum(["plan_change", "cancellation"]),
        details: z.string().trim().min(3).max(4000),
        preferredPlanCode: z.string().trim().max(80).optional(),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsPortalServiceRequest> => {
    return mapPortalServiceRequest(
      await callRpc(context.supabase, "advisors_portal_create_service_request", {
        _kind: data.kind,
        _details: data.details,
        _preferred_plan_code: data.preferredPlanCode ?? null,
      }),
    );
  });

export const listAdvisorsPortalNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorsPortalNotification[]> => {
    const raw = await callRpc(context.supabase, "advisors_portal_list_notifications", {
      _limit: 50,
    });
    return Array.isArray(raw) ? raw.map(mapPortalNotification) : [];
  });

export const markAdvisorsPortalNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        ids: z.array(z.string().uuid()).max(100).optional(),
      })
      .strict()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<number> => {
    const raw = await callRpc(context.supabase, "advisors_portal_mark_notifications_read", {
      _ids: data.ids ?? null,
    });
    return typeof raw === "number" ? raw : Number(raw) || 0;
  });

export const acceptAdvisorsPortalInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({ token: z.string().trim().min(16).max(200) })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsClient> => {
    return mapClient(
      await callRpc(context.supabase, "advisors_portal_accept_invite", {
        _token: data.token,
      }),
    );
  });

export const createAdvisorsPortalInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsPortalInvite & { emailed: boolean }> => {
    const invite = mapPortalInvite(
      await callRpc(context.supabase, "platform_advisors_create_portal_invite", {
        _client_id: data.clientId,
        _reason: data.reason,
      }),
    );
    const link = `${appOrigin()}/advisors/portal/invite/${invite.token}`;
    const { readEmailConfig, sendViaResend } =
      await import("@/lib/documents/email-provider.server");
    const config = readEmailConfig();
    let emailed = false;
    if (config.configured) {
      const text = `You have been invited to the StreakBooks Advisors customer portal. Sign in with ${invite.email} and open: ${link}`;
      const result = await sendViaResend(config, {
        to: [invite.email],
        subject: "Your StreakBooks Advisors portal invitation",
        text,
        html: `<p>You have been invited to the StreakBooks Advisors customer portal.</p><p>Sign in with <strong>${invite.email}</strong> and open this link:</p><p><a href="${link}">${link}</a></p>`,
      });
      emailed = result.ok;
    }
    return { ...invite, link, emailed };
  });

export const unlinkAdvisorsPortalUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsClient> => {
    return mapClient(
      await callRpc(context.supabase, "platform_advisors_unlink_portal_user", {
        _client_id: data.clientId,
        _reason: data.reason,
      }),
    );
  });

export const replyAdvisorsPortalMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        body: z.string().trim().min(1).max(4000),
        reason: reasonSchema,
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<AdvisorsPortalMessage> => {
    return mapPortalMessage(
      await callRpc(context.supabase, "platform_advisors_reply_portal_message", {
        _client_id: data.clientId,
        _body: data.body,
        _reason: data.reason,
      }),
    );
  });

export const listAdvisorsPortalServiceRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        status: z.enum(["open", "in_review", "accepted", "declined", "cancelled"]).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .strict()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const raw = await callRpc(context.supabase, "platform_advisors_list_portal_requests", {
      _status: data.status ?? null,
      _limit: data.limit ?? 100,
    });
    return Array.isArray(raw) ? raw : [];
  });

export const dispatchAdvisorsBookingReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        limit: z.number().int().min(1).max(100).optional(),
      })
      .strict()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const claimedRaw = await callRpc(context.supabase, "advisors_claim_due_reminders", {
      _limit: data.limit ?? 20,
    });
    const claimed: AdvisorsBookingReminder[] = Array.isArray(claimedRaw)
      ? claimedRaw.map(mapBookingReminder)
      : [];

    const { readEmailConfig, sendViaResend } =
      await import("@/lib/documents/email-provider.server");
    const config = readEmailConfig();
    const results: Array<{ reminderId: string; status: string; error?: string }> = [];

    for (const reminder of claimed) {
      if (!config.configured) {
        await callRpc(context.supabase, "advisors_mark_reminder_status", {
          _reminder_id: reminder.reminderId,
          _status: "failed",
          _error: "Resend is not configured (RESEND_API_KEY / EMAIL_FROM)",
        });
        results.push({
          reminderId: reminder.reminderId,
          status: "failed",
          error: "not_configured",
        });
        continue;
      }

      const when = new Date(reminder.startsAt).toLocaleString();
      const manageUrl = `${appOrigin()}/advisors/manage/${reminder.manageToken}`;
      const text = `Hi ${reminder.customerName}, this is a reminder of your StreakBooks Advisors appointment on ${when}${reminder.advisorName ? ` with ${reminder.advisorName}` : ""}. Manage it here: ${manageUrl}`;
      const sent = await sendViaResend(config, {
        to: [reminder.customerEmail],
        subject: "Reminder: your StreakBooks Advisors appointment",
        text,
        html: `<p>Hi ${reminder.customerName},</p><p>This is a reminder of your StreakBooks Advisors appointment on <strong>${when}</strong>${reminder.advisorName ? ` with ${reminder.advisorName}` : ""}.</p><p><a href="${manageUrl}">Manage appointment</a></p>`,
        idempotencyKey: `advisors-reminder-${reminder.reminderId}`,
      });

      if (sent.ok) {
        await callRpc(context.supabase, "advisors_mark_reminder_status", {
          _reminder_id: reminder.reminderId,
          _status: "sent",
        });
        results.push({ reminderId: reminder.reminderId, status: "sent" });
      } else {
        await callRpc(context.supabase, "advisors_mark_reminder_status", {
          _reminder_id: reminder.reminderId,
          _status: "failed",
          _error: sent.error,
        });
        results.push({
          reminderId: reminder.reminderId,
          status: "failed",
          error: sent.error,
        });
      }
    }

    return {
      claimed: claimed.length,
      results,
      providerConfigured: config.configured,
    };
  });

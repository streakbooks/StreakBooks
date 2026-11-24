import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { detectCustomerTimeZone } from "@/lib/advisors/booking-slots";

async function publicClient() {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key || url.includes(".invalid")) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function clientBucket(): string {
  const forwarded = getRequestHeader("x-forwarded-for") ?? "";
  const ip = forwarded.split(",")[0]?.trim() || getRequestHeader("x-real-ip") || "anonymous";
  return `advisors-booking:${ip.slice(0, 64)}`;
}

const listSlotsSchema = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    customerTimezone: z.string().min(1).max(80).optional(),
    advisorId: z.string().uuid().optional(),
  })
  .strict();

const bookSchema = z
  .object({
    startsAt: z.string().datetime({ offset: true }),
    customerTimezone: z.string().min(1).max(80),
    customerName: z.string().trim().min(2).max(120),
    customerEmail: z.string().trim().email().max(200),
    businessName: z.string().trim().max(200).optional(),
    customerPhone: z.string().trim().max(40).optional(),
    notes: z.string().trim().max(2000).optional(),
    serviceCode: z.enum(["bookkeeping", "coaching"]).optional(),
    planCode: z.string().trim().max(80).optional(),
    advisorId: z.string().uuid().optional(),
    idempotencyKey: z.string().trim().min(8).max(120),
    conversationToken: z.string().trim().max(128).optional(),
  })
  .strict();

export type AvailableSlot = {
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  isFreeConsultation: boolean;
};

export const listAdvisorAvailableSlots = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => listSlotsSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const timezone = data.customerTimezone || detectCustomerTimeZone();
    const client = await publicClient();
    if (!client) {
      return {
        ready: false as const,
        advisorId: null,
        advisorName: "StreakBooks Advisors",
        timezone: "UTC",
        slots: [] as AvailableSlot[],
        reason: "Booking calendar requires a configured database.",
      };
    }
    const { data: result, error } = await client.rpc(
      "advisors_list_available_slots" as never,
      {
        _day: data.day,
        _customer_timezone: timezone,
        _advisor_id: data.advisorId ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    const row = (result ?? {}) as Record<string, unknown>;
    const slots = Array.isArray(row["slots"])
      ? row["slots"].map((item) => {
          const slot = (item ?? {}) as Record<string, unknown>;
          return {
            startsAt: String(slot["startsAt"] ?? ""),
            endsAt: String(slot["endsAt"] ?? ""),
            durationMinutes: Number(slot["durationMinutes"] ?? 30),
            isFreeConsultation: Boolean(slot["isFreeConsultation"] ?? true),
          } satisfies AvailableSlot;
        })
      : [];
    return {
      ready: true as const,
      advisorId: typeof row["advisorId"] === "string" ? row["advisorId"] : null,
      advisorName: String(row["advisorName"] ?? "StreakBooks Advisors"),
      timezone: String(row["timezone"] ?? "UTC"),
      slots,
      reason: typeof row["reason"] === "string" ? row["reason"] : null,
    };
  });

export const bookAdvisorAppointment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => bookSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const client = await publicClient();
    if (!client)
      throw new Error("Booking is unavailable until the Advisors database is configured.");
    const { data: result, error } = await client.rpc(
      "advisors_book_appointment" as never,
      {
        _payload: {
          ...data,
          bucket: clientBucket(),
        },
      } as never,
    );
    if (error) throw new Error(error.message);
    return result as {
      id: string;
      status: string;
      startsAt: string;
      endsAt: string;
      manageToken: string;
      isFreeConsultation: boolean;
      durationMinutes: number;
      replayed: boolean;
      message: string;
    };
  });

export type AdvisorAppointmentView = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  customerTimezone: string;
  customerName: string;
  customerEmail: string;
  businessName: string;
  serviceCode: string | null;
  planCode: string | null;
  notes: string | null;
};

function asAppointmentView(raw: unknown): AdvisorAppointmentView {
  const row = (raw ?? {}) as Record<string, unknown>;
  return {
    id: String(row["id"] ?? ""),
    status: String(row["status"] ?? ""),
    startsAt: String(row["startsAt"] ?? ""),
    endsAt: String(row["endsAt"] ?? ""),
    customerTimezone: String(row["customerTimezone"] ?? "UTC"),
    customerName: String(row["customerName"] ?? ""),
    customerEmail: String(row["customerEmail"] ?? ""),
    businessName: String(row["businessName"] ?? ""),
    serviceCode: typeof row["serviceCode"] === "string" ? row["serviceCode"] : null,
    planCode: typeof row["planCode"] === "string" ? row["planCode"] : null,
    notes: typeof row["notes"] === "string" ? row["notes"] : null,
  };
}

export const getAdvisorAppointment = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ manageToken: z.string().min(16).max(128) }).parse(input),
  )
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const client = await publicClient();
    if (!client) throw new Error("Appointment lookup requires a configured database.");
    const { data: result, error } = await client.rpc(
      "advisors_get_appointment" as never,
      {
        _manage_token: data.manageToken,
      } as never,
    );
    if (error) throw new Error(error.message);
    return asAppointmentView(result);
  });

export const cancelAdvisorAppointment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        manageToken: z.string().min(16).max(128),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const client = await publicClient();
    if (!client) throw new Error("Cancellation requires a configured database.");
    const { data: result, error } = await client.rpc(
      "advisors_cancel_appointment" as never,
      {
        _manage_token: data.manageToken,
        _reason: data.reason ?? "",
      } as never,
    );
    if (error) throw new Error(error.message);
    return result as { id: string; status: string };
  });

export const rescheduleAdvisorAppointment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        manageToken: z.string().min(16).max(128),
        startsAt: z.string().datetime({ offset: true }),
        idempotencyKey: z.string().trim().min(8).max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const client = await publicClient();
    if (!client) throw new Error("Rescheduling requires a configured database.");
    const { data: result, error } = await client.rpc(
      "advisors_reschedule_appointment" as never,
      {
        _manage_token: data.manageToken,
        _starts_at: data.startsAt,
        _idempotency_key: data.idempotencyKey ?? null,
      } as never,
    );
    if (error) throw new Error(error.message);
    const row = (result ?? {}) as Record<string, unknown>;
    return {
      id: String(row["id"] ?? ""),
      status: String(row["status"] ?? ""),
      startsAt: String(row["startsAt"] ?? ""),
      endsAt: String(row["endsAt"] ?? ""),
      manageToken: String(row["manageToken"] ?? ""),
      previousAppointmentId:
        typeof row["previousAppointmentId"] === "string" ? row["previousAppointmentId"] : null,
      replayed: Boolean(row["replayed"]),
    };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RpcClient = {
  rpc: (
    fn: never,
    args?: never,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

async function callRpc(client: unknown, fn: string, args?: Record<string, unknown>) {
  const { data, error } = await (client as RpcClient).rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data;
}

export type AdvisorsBookingAdmin = {
  advisor: {
    id: string;
    displayName: string;
    email: string | null;
    timezone: string;
    isActive: boolean;
  } | null;
  settings: {
    consultationMinutes: number;
    bufferMinutes: number;
    noticeHours: number;
    maxDailyAppointments: number;
    bookingHorizonDays: number;
    isFreeConsultation: boolean;
  } | null;
  workingHours: Array<{ weekday: number; startMinute: number; endMinute: number }>;
  exceptions: Array<{
    id: string;
    kind: string;
    startsAt: string;
    endsAt: string;
    label: string;
  }>;
  appointments: Array<{
    id: string;
    status: string;
    startsAt: string;
    endsAt: string;
    customerName: string;
    customerEmail: string;
    businessName: string;
    serviceCode: string | null;
    planCode: string | null;
  }>;
};

function mapBookingAdmin(raw: unknown): AdvisorsBookingAdmin {
  const row = (raw ?? {}) as Record<string, unknown>;
  const advisorRaw = row["advisor"];
  const settingsRaw = row["settings"];
  const advisor =
    advisorRaw && typeof advisorRaw === "object"
      ? (() => {
          const item = advisorRaw as Record<string, unknown>;
          return {
            id: String(item["id"] ?? ""),
            displayName: String(item["displayName"] ?? ""),
            email: typeof item["email"] === "string" ? item["email"] : null,
            timezone: String(item["timezone"] ?? "UTC"),
            isActive: Boolean(item["isActive"]),
          };
        })()
      : null;
  const settings =
    settingsRaw && typeof settingsRaw === "object"
      ? (() => {
          const item = settingsRaw as Record<string, unknown>;
          return {
            consultationMinutes: Number(item["consultationMinutes"] ?? 30),
            bufferMinutes: Number(item["bufferMinutes"] ?? 15),
            noticeHours: Number(item["noticeHours"] ?? 24),
            maxDailyAppointments: Number(item["maxDailyAppointments"] ?? 8),
            bookingHorizonDays: Number(item["bookingHorizonDays"] ?? 28),
            isFreeConsultation: Boolean(item["isFreeConsultation"] ?? true),
          };
        })()
      : null;
  return {
    advisor,
    settings,
    workingHours: Array.isArray(row["workingHours"])
      ? row["workingHours"].map((item) => {
          const hour = (item ?? {}) as Record<string, unknown>;
          return {
            weekday: Number(hour["weekday"] ?? 0),
            startMinute: Number(hour["startMinute"] ?? 0),
            endMinute: Number(hour["endMinute"] ?? 0),
          };
        })
      : [],
    exceptions: Array.isArray(row["exceptions"])
      ? row["exceptions"].map((item) => {
          const exception = (item ?? {}) as Record<string, unknown>;
          return {
            id: String(exception["id"] ?? ""),
            kind: String(exception["kind"] ?? ""),
            startsAt: String(exception["startsAt"] ?? ""),
            endsAt: String(exception["endsAt"] ?? ""),
            label: String(exception["label"] ?? ""),
          };
        })
      : [],
    appointments: Array.isArray(row["appointments"])
      ? row["appointments"].map((item) => {
          const appointment = (item ?? {}) as Record<string, unknown>;
          return {
            id: String(appointment["id"] ?? ""),
            status: String(appointment["status"] ?? ""),
            startsAt: String(appointment["startsAt"] ?? ""),
            endsAt: String(appointment["endsAt"] ?? ""),
            customerName: String(appointment["customerName"] ?? ""),
            customerEmail: String(appointment["customerEmail"] ?? ""),
            businessName: String(appointment["businessName"] ?? ""),
            serviceCode:
              typeof appointment["serviceCode"] === "string" ? appointment["serviceCode"] : null,
            planCode: typeof appointment["planCode"] === "string" ? appointment["planCode"] : null,
          };
        })
      : [],
  };
}

export const getAdvisorsBookingAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return mapBookingAdmin(await callRpc(context.supabase, "platform_advisors_booking_admin"));
  });

export const saveAdvisorsBookingSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        payload: z.object({
          timezone: z.string().min(1).max(80),
          consultationMinutes: z.number().int().min(15).max(180),
          bufferMinutes: z.number().int().min(0).max(120),
          noticeHours: z.number().int().min(0).max(720),
          maxDailyAppointments: z.number().int().min(1).max(40),
          workingHours: z.array(
            z.object({
              weekday: z.number().int().min(0).max(6),
              startMinute: z.number().int().min(0).max(1439),
              endMinute: z.number().int().min(1).max(1440),
            }),
          ),
        }),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    return mapBookingAdmin(
      await callRpc(context.supabase, "platform_advisors_save_booking_settings", {
        _payload: data.payload,
        _reason: data.reason,
      }),
    );
  });

export const addAdvisorsAvailabilityException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        kind: z.enum(["holiday", "unavailable", "break"]),
        startsAt: z.string().datetime({ offset: true }),
        endsAt: z.string().datetime({ offset: true }),
        label: z.string().trim().max(200).optional(),
        reason: z.string().trim().min(3).max(500),
        advisorId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const result = (await callRpc(context.supabase, "platform_advisors_add_exception", {
      _payload: {
        kind: data.kind,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        label: data.label ?? "",
        advisorId: data.advisorId,
      },
      _reason: data.reason,
    })) as { id?: string };
    return { id: String(result?.id ?? "") };
  });

export const setAdvisorsAppointmentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        appointmentId: z.string().uuid(),
        status: z.enum(["confirmed", "cancelled", "completed", "no_show"]),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const result = (await callRpc(context.supabase, "platform_advisors_set_appointment_status", {
      _appointment_id: data.appointmentId,
      _status: data.status,
      _reason: data.reason,
    })) as { id?: string; status?: string };
    return { id: String(result?.id ?? ""), status: String(result?.status ?? "") };
  });

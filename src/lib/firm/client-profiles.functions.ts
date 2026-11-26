import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { isoDate } from "@/lib/accountant/practice-work";

export const CLIENT_STATUSES = [
  "onboarding",
  "active",
  "on_hold",
  "offboarding",
  "archived",
] as const;
export type FirmClientStatus = (typeof CLIENT_STATUSES)[number];

export type FirmClientProfile = {
  firm_id: string;
  company_id: string;
  status: FirmClientStatus;
  primary_contact_name: string;
  primary_contact_email: string;
  industry: string;
  service_line: string;
  notes: string;
  tags: string[];
  next_review_date: string | null;
  updated_at: string;
  version: number;
};

const schema = z
  .object({
    firmId: z.string().uuid(),
    companyId: z.string().uuid(),
    expectedVersion: z.number().int().min(0),
    status: z.enum(CLIENT_STATUSES),
    primary_contact_name: z.string().trim().max(120),
    primary_contact_email: z.union([z.literal(""), z.email().max(254)]),
    industry: z.string().trim().max(100),
    service_line: z.string().trim().max(120),
    notes: z.string().trim().max(3000),
    tags: z.array(z.string().trim().min(1).max(40)).max(12),
    next_review_date: isoDate.nullable(),
  })
  .strict();

export type FirmClientProfileInput = z.infer<typeof schema>;

export const listFirmClientProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ firmId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }): Promise<FirmClientProfile[]> => {
    const { data: membership, error: memberError } = await context.supabase
      .from("firm_members" as never)
      .select("id" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!membership) throw new Error("Firm membership required");

    // RLS additionally requires effective company permissions and an active link.
    // Never silently return a truncated portfolio.
    const { data: rows, error } = await context.supabase
      .from("firm_client_profiles" as never)
      .select(
        "firm_id,company_id,status,primary_contact_name,primary_contact_email,industry,service_line,notes,tags,next_review_date,updated_at,version" as never,
      )
      .eq("firm_id" as never, data.firmId as never)
      .order("company_id" as never)
      .limit(1001);
    if (error) throw new Error(error.message);
    if ((rows ?? []).length > 1000)
      throw new Error(
        "Portfolio has more than 1,000 client profiles; narrow the scope before export",
      );
    return (rows ?? []) as FirmClientProfile[];
  });

export const saveFirmClientProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }): Promise<FirmClientProfile> => {
    const { data: membership, error: memberError } = await context.supabase
      .from("firm_members" as never)
      .select("role" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!membership || !["owner", "admin"].includes((membership as { role: string }).role))
      throw new Error("Firm administrator access required");

    const { data: link, error: linkError } = await context.supabase
      .from("firm_client_links" as never)
      .select("id" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("company_id" as never, data.companyId as never)
      .is("revoked_at" as never, null)
      .maybeSingle();
    if (linkError) throw new Error(linkError.message);
    if (!link) throw new Error("Client is not linked to the selected firm");

    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { firmId, companyId, expectedVersion, ...fields } = data;
    const payload = {
      ...fields,
      tags: [...new Set(fields.tags.map((tag) => tag.trim()))],
      updated_by: context.userId,
    };
    const projection =
      "firm_id,company_id,status,primary_contact_name,primary_contact_email,industry,service_line,notes,tags,next_review_date,updated_at,version";

    if (expectedVersion === 0) {
      const { data: saved, error } = await context.supabase
        .from("firm_client_profiles" as never)
        .insert({ ...payload, firm_id: firmId, company_id: companyId } as never)
        .select(projection as never)
        .single();
      if (error) throw new Error("Client profile changed. Refresh and try again: " + error.message);
      return saved as FirmClientProfile;
    }

    const { data: saved, error } = await context.supabase
      .from("firm_client_profiles" as never)
      .update(payload as never)
      .eq("firm_id" as never, firmId as never)
      .eq("company_id" as never, companyId as never)
      .eq("version" as never, expectedVersion as never)
      .select(projection as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!saved) throw new Error("Client profile changed. Refresh and try again.");
    return saved as FirmClientProfile;
  });

const bulkSchema = z
  .object({
    firmId: z.string().uuid(),
    items: z
      .array(
        z
          .object({
            companyId: z.string().uuid(),
            expectedVersion: z.number().int().min(0),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    field: z.enum(["status", "service_line", "next_review_date"]),
    value: z.string().nullable(),
  })
  .strict()
  .superRefine((input, ctx) => {
    const ids = input.items.map((item) => item.companyId);
    if (new Set(ids).size !== ids.length)
      ctx.addIssue({ code: "custom", message: "Select each client only once" });
    if (input.field === "status" && !CLIENT_STATUSES.includes(input.value as FirmClientStatus))
      ctx.addIssue({ code: "custom", message: "Choose a valid practice status" });
    if (input.field === "service_line" && (input.value === null || input.value.length > 120))
      ctx.addIssue({ code: "custom", message: "Service must be no more than 120 characters" });
    if (
      input.field === "next_review_date" &&
      input.value !== null &&
      !isoDate.safeParse(input.value).success
    )
      ctx.addIssue({ code: "custom", message: "Choose a real review date" });
  });
export type FirmClientBulkInput = z.infer<typeof bulkSchema>;

export const bulkUpdateFirmClientProfiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => bulkSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "bulk_update_firm_client_profiles" as never,
      {
        _firm_id: data.firmId,
        _items: data.items,
        _field: data.field,
        _value: data.value,
      } as never,
    );
    if (error) throw new Error(error.message);
    return result as { updated: number; unchanged: number; total: number };
  });

const tagSchema = z
  .object({
    firmId: z.string().uuid(),
    items: z
      .array(
        z
          .object({
            companyId: z.string().uuid(),
            expectedVersion: z.number().int().min(0),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    operation: z.enum(["add", "remove", "replace"]),
    tags: z.array(z.string().trim().min(1).max(40)).max(12),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (new Set(input.items.map((item) => item.companyId)).size !== input.items.length)
      ctx.addIssue({ code: "custom", message: "Select each client once" });
    if (input.operation !== "replace" && !input.tags.length)
      ctx.addIssue({ code: "custom", message: "Enter at least one tag" });
  });
export type FirmBulkTagsInput = z.infer<typeof tagSchema>;

export const bulkUpdateFirmClientTags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => tagSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.rpc(
      "bulk_update_firm_client_tags" as never,
      {
        _firm_id: data.firmId,
        _items: data.items,
        _operation: data.operation,
        _tags: [...new Set(data.tags)],
      } as never,
    );
    if (error) throw new Error(error.message);
    return result as { updated: number; unchanged: number; total: number };
  });

export type FirmClientProfileAudit = {
  id: number;
  company_id: string;
  actor_id: string;
  action: "created" | "updated";
  changed_fields: string[];
  before_values: {
    status: string;
    service_line: string;
    next_review_date: string | null;
    tags?: string[];
  } | null;
  after_values: {
    status: string;
    service_line: string;
    next_review_date: string | null;
    tags?: string[];
  };
  created_at: string;
};

export const listFirmClientProfileAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => z.object({ firmId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data, context }): Promise<FirmClientProfileAudit[]> => {
    const { data: member, error: memberError } = await context.supabase
      .from("firm_members" as never)
      .select("role" as never)
      .eq("firm_id" as never, data.firmId as never)
      .eq("user_id" as never, context.userId as never)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member || !["owner", "admin"].includes((member as { role: string }).role))
      throw new Error("Firm administrator access required");
    const { data: rows, error } = await context.supabase
      .from("firm_client_profile_audit" as never)
      .select(
        "id,company_id,actor_id,action,changed_fields,before_values,after_values,created_at" as never,
      )
      .eq("firm_id" as never, data.firmId as never)
      .order("created_at" as never, { ascending: false })
      .order("id" as never, { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (rows ?? []) as FirmClientProfileAudit[];
  });

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
};

const schema = z
  .object({
    firmId: z.string().uuid(),
    companyId: z.string().uuid(),
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
  .inputValidator((input: unknown) => z.object({ firmId: z.string().uuid() }).strict().parse(input))
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
        "firm_id,company_id,status,primary_contact_name,primary_contact_email,industry,service_line,notes,tags,next_review_date,updated_at" as never,
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
  .inputValidator((input: unknown) => schema.parse(input))
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
    const { firmId, companyId, ...fields } = data;
    const { data: saved, error } = await context.supabase
      .from("firm_client_profiles" as never)
      .upsert(
        {
          ...fields,
          tags: [...new Set(fields.tags.map((tag) => tag.trim()))],
          firm_id: firmId,
          company_id: companyId,
          updated_at: new Date().toISOString(),
          updated_by: context.userId,
        } as never,
        { onConflict: "firm_id,company_id" },
      )
      .select(
        "firm_id,company_id,status,primary_contact_name,primary_contact_email,industry,service_line,notes,tags,next_review_date,updated_at" as never,
      )
      .single();
    if (error) throw new Error(error.message);
    return saved as FirmClientProfile;
  });

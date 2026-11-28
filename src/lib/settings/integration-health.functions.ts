import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { buildIntegrationHealth } from "./integration-health";

export const getIntegrationHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: company, error } = await context.supabase
      .from("companies" as never)
      .select("is_demo" as never)
      .eq("id" as never, data.companyId as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!company) throw new Error("Organisation not found");
    const { readEmailConfig } = await import("@/lib/documents/email-provider.server");
    return buildIntegrationHealth({
      emailConfigured: readEmailConfig().configured,
      isDemo: (company as { is_demo: boolean }).is_demo,
    });
  });

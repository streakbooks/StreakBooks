import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { resolveReportingBasis } from "./accounting-basis.server";

export const getReportingBasis = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { companyId: string }) => ({ companyId: assertUuid(input.companyId) }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "reports.view");
    return resolveReportingBasis(context.supabase, data.companyId);
  });

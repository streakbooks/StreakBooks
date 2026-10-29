import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { buildCompanyAiContext } from "@/lib/ai/context";
import { parseDeterministicCommand } from "@/lib/ai-voice/deterministic-engine";

/**
 * Authoritative execution gateway. The client supplies only raw speech/text.
 * Organisation, actor, permissions and resolved command are derived on server.
 * No financial writes or privileged credentials.
 */
export const executeDeterministicVoiceCommand = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ transcript: z.string().trim().min(1).max(1000) }).strict().parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("last_company_id").eq("id", userId).single();
    if (profileError || !profile?.last_company_id) throw new Error("Select an organisation first.");
    const companyId = profile.last_company_id;
    await assertCompanyMember(supabase, companyId);
    await assertCompanyPermission(supabase, companyId, "ai.use");
    const parsed = parseDeterministicCommand(data.transcript);
    if (parsed.kind === "unsupported") return { status: "unsupported" as const, message: parsed.message, destination: null };
    if (parsed.kind === "ambiguous") return {
      status: "ambiguous" as const, message: "Please clarify: " + parsed.candidates.join(" or "),
      destination: null,
    };
    await assertCompanyPermission(supabase, companyId, parsed.command.requiredPermission);
    if (parsed.command.intent === "review") {
      const contextData = await buildCompanyAiContext(supabase, companyId, 12000);
      const block = contextData.calculatedBlocks.find((item) => item.kind === parsed.command.review);
      return { status: "ok" as const, message: `${block?.title ?? "Review"} (limited sample):\\n${block?.body ?? "No data available."}`, destination: null };
    }
    // Server-side resolve and validate that the destination is permitted in this organisation.
    const { data: company, error: companyError } = await supabase.from("companies")
      .select("id").eq("id", companyId).maybeSingle();
    if (companyError || !company) throw new Error("Organisation is unavailable.");
    return {
      status: "ok" as const,
      message: "Opening " + parsed.command.label + ".",
      destination: parsed.command.destination,
    };
  });

export const getDeterministicVoiceReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({
    review: z.enum(["duplicates", "reconcile", "unusual"]),
  }).strict().parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile, error } = await supabase.from("profiles")
      .select("last_company_id").eq("id", userId).single();
    if (error || !profile?.last_company_id) throw new Error("Select an organisation first.");
    const companyId = profile.last_company_id;
    await assertCompanyMember(supabase, companyId);
    await assertCompanyPermission(supabase, companyId, "ai.use");
    await assertCompanyPermission(supabase, companyId, "banking.view");
    const contextData = await buildCompanyAiContext(supabase, companyId, 12000);
    const block = contextData.calculatedBlocks.find((item) => item.kind === data.review);
    return {
      title: block?.title ?? "Review",
      message: block?.body ?? "No data is available.",
      companyName: contextData.companyName,
      sampleOnly: true as const,
    };
  });

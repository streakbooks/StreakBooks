import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import {
  DEFAULT_ADVISOR_SERVICES,
  normalizePublicAdvisorCatalogue,
  type AdvisorService,
} from "@/lib/advisors/catalogue";

export type PublicAdvisorCatalogue = {
  ready: boolean;
  source: "database" | "defaults";
  services: AdvisorService[];
};

export const listPublicAdvisorServices = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicAdvisorCatalogue> => {
    setResponseHeader("Cache-Control", "private, no-store");
    const url = process.env["SUPABASE_URL"];
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    if (!url || !key || url.includes(".invalid")) {
      return { ready: false, source: "defaults", services: DEFAULT_ADVISOR_SERVICES };
    }
    try {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(url, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await client.rpc("list_public_advisor_services" as never);
      if (error) {
        if (
          error.code === "42883" ||
          error.code === "PGRST202" ||
          error.code === "42P01" ||
          error.message.toLowerCase().includes("fetch")
        ) {
          return { ready: false, source: "defaults", services: DEFAULT_ADVISOR_SERVICES };
        }
        throw new Error(error.message);
      }
      return {
        ready: true,
        source: "database",
        services: normalizePublicAdvisorCatalogue(data),
      };
    } catch {
      return { ready: false, source: "defaults", services: DEFAULT_ADVISOR_SERVICES };
    }
  },
);

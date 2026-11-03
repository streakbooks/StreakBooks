import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { PortalShell } from "@/components/portals/PortalShell";

export const Route = createFileRoute("/portal/app")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/portal/login" });
  },
  component: PortalShell,
});

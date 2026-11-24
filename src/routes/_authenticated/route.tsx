import { validateSettingsPanelSearch } from "@/lib/settings/panels";
import { useEffect } from "react";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/AppShell";
import { useActiveCompany } from "@/hooks/use-active-company";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { needsMfaStepUp } from "@/lib/auth-session";
import { listPortalAccess } from "@/lib/portals/portals.functions";

/**
 * Every StreakBooks application page lives under this gate. The session lives in
 * browser storage, so this subtree opts out of server rendering and checks the
 * session on the client before any child route renders.
 *
 * This gate is the user-experience layer only — data access is enforced
 * server-side by `requireSupabaseAuth` and database row-level security.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  validateSearch: validateSettingsPanelSearch,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({
        to: "/auth",
        search: { redirect: location.href },
      });
    }
    if (await needsMfaStepUp()) {
      throw redirect({ to: "/auth/mfa", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  pendingComponent: () => (
    <div className="grid min-h-screen place-items-center bg-background">
      <Loader2 className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">Loading StreakBooks</span>
    </div>
  ),
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/platform" || pathname.startsWith("/platform/")) return <Outlet />;
  return <CompanyLayout />;
}

function CompanyLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data, isPending, isError, error, refetch } = useActiveCompany();
  const fetchPortalAccess = useServerFn(listPortalAccess);
  const onOnboarding =
    pathname.startsWith("/onboarding") ||
    pathname === "/profile" ||
    pathname === "/firm" ||
    pathname.startsWith("/invite/") ||
    pathname.startsWith("/firm-invite/");

  useEffect(() => {
    if (isPending || isError) return;
    const count = data?.companies.length ?? 0;
    if (count === 0 && !onOnboarding) {
      void fetchPortalAccess()
        .then((rows) => {
          const memberships = Array.isArray(rows) ? rows : [];
          void navigate({
            to: memberships.length > 0 ? "/portal/app" : "/onboarding",
            replace: true,
          });
        })
        .catch(() => {
          void navigate({ to: "/onboarding", replace: true });
        });
    }
  }, [data?.companies.length, fetchPortalAccess, isError, isPending, navigate, onOnboarding]);

  if (isPending) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading organisations</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg items-center px-4">
        <QueryErrorState
          queries={[{ isError, error, refetch }]}
          title="Could not load your organisations"
        />
      </div>
    );
  }

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}

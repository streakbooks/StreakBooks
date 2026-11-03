import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShieldCheck, ArrowLeft, LogOut } from "lucide-react";
import { getPlatformContext } from "@/lib/platform/platform.functions";
import { visibleSections } from "@/lib/platform/catalog";
import { PlatformSearch } from "@/components/platform/PlatformSearch";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
export const Route = createFileRoute("/_authenticated/platform")({
  component: PlatformLayout,
  head: () => ({ meta: [{ title: "Superadmin Control Centre — LinkBooks" }] }),
});
function PlatformLayout() {
  const load = useServerFn(getPlatformContext);
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["platform", "context"],
    queryFn: () => load(),
    retry: false,
    staleTime: 30000,
  });
  const inAutomation = useRouterState({
    select: (s) => s.location.pathname.startsWith("/platform/automation"),
  });
  const inOperations = useRouterState({
    select: (s) => s.location.pathname.startsWith("/platform/operations"),
  });
  const section = useRouterState({
    select: (s) => (s.location.search as { section?: string }).section ?? "overview",
  });
  if (query.isPending)
    return (
      <main className="grid min-h-screen place-items-center" role="status">
        Verifying platform access…
      </main>
    );
  if (query.isError)
    return (
      <main className="mx-auto max-w-xl space-y-4 p-8">
        <ShieldCheck className="size-10 text-primary" />
        <h1 className="text-2xl font-semibold">Platform access required</h1>
        <p role="alert">{query.error.message}</p>
        <p className="text-sm text-muted-foreground">
          Platform staff must enroll an authenticator in Profile → Security and complete
          verification. Business roles do not grant access to this console.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Link to="/profile" className="text-primary underline">
            Open Profile and Security
          </Link>
          <Link
            to="/auth/mfa"
            search={{ redirect: "/platform" }}
            className="text-primary underline"
          >
            Verify MFA
          </Link>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      </main>
    );
  return (
    <div className="min-h-screen bg-muted/30">
      <a className="skip-link" href="#platform-main">
        Skip to platform content
      </a>
      <aside className="border-b bg-sidebar text-sidebar-foreground lg:fixed lg:inset-y-0 lg:w-64 lg:overflow-y-auto lg:border-b-0">
        <div className="flex items-center gap-3 p-6">
          <span className="grid size-9 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">
            LB
          </span>
          <div>
            <strong className="block text-sm">LinkBooks</strong>
            <span className="text-xs opacity-65">Superadmin Control Centre</span>
          </div>
        </div>
        <nav
          aria-label="Platform navigation"
          className="flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col"
        >
          {query.data.permissions.some((p) =>
            ["support.view", "businesses.view", "settings.view"].includes(p),
          ) ? (
            <Link
              to="/platform/operations"
              search={{
                module: query.data.permissions.includes("support.view")
                  ? "cases"
                  : query.data.permissions.includes("businesses.view")
                    ? "segments"
                    : "releases",
              }}
              aria-current={inOperations ? "page" : undefined}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent/60"
            >
              Operations workspace
            </Link>
          ) : null}
          {query.data.permissions.some((p) =>
            ["settings.view", "monitoring.view", "notifications.view"].includes(p),
          ) ? (
            <Link
              to="/platform/automation"
              search={{
                module: query.data.permissions.some((p) =>
                  ["settings.view", "monitoring.view"].includes(p),
                )
                  ? "jobs"
                  : "rules",
              }}
              aria-current={inAutomation ? "page" : undefined}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-sidebar-accent/60"
            >
              Jobs and alerts
            </Link>
          ) : null}
          {visibleSections(query.data.permissions).map(([id, label]) => (
            <Link
              key={id}
              to="/platform"
              search={{ section: id }}
              aria-current={!inOperations && !inAutomation && section === id ? "page" : undefined}
              className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${!inOperations && !inAutomation && section === id ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/60"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-sidebar-border p-5 text-xs opacity-70 lg:block">
          Platform administration
          <br />
          Customer accounting access is separately authorized.
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card px-6 py-4">
          <div className="flex items-center gap-2 text-sm">
            <ShieldCheck className="size-4 text-primary" />
            <span>MFA verified</span>
            <span className="rounded-full bg-muted px-2 py-1 text-xs">{query.data.role}</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <PlatformSearch context={query.data} />
            <Link to="/" className="flex items-center gap-1 text-sm text-muted-foreground">
              <ArrowLeft className="size-4" />
              Accounting workspace
            </Link>
            <Link to="/profile" className="text-sm text-primary">
              Profile
            </Link>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await cache.cancelQueries();
                cache.clear();
                await supabase.auth.signOut();
                window.location.assign("/auth");
              }}
            >
              <LogOut className="size-4" />
              Sign out
            </Button>
          </div>
        </header>
        <main
          id="platform-main"
          tabIndex={-1}
          className="mx-auto max-w-[1600px] space-y-6 p-4 outline-none md:p-8"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}

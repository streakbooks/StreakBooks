import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  Calculator,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { getPlatformContext } from "@/lib/platform/platform.functions";
import { listMyFirms } from "@/lib/firm/firm.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Workspace discovery only; every destination continues to enforce its own server permissions. */
export function WorkspaceAccessPanel() {
  const { company } = useActiveCompany();
  const fetchFirms = useServerFn(listMyFirms);
  const fetchPlatformContext = useServerFn(getPlatformContext);
  const firmsQuery = useQuery({
    queryKey: ["workspace-access", "firms"],
    queryFn: () => fetchFirms(),
    staleTime: 60_000,
  });
  const platformQuery = useQuery({
    queryKey: ["workspace-access", "platform"],
    queryFn: async () => {
      try {
        return await fetchPlatformContext();
      } catch {
        // The platform RPC denies ordinary business accounts. Keep discovery quiet and fail closed.
        return null;
      }
    },
    staleTime: 5 * 60_000,
    retry: false,
  });

  const companyPermissions = new Set(company?.permissions ?? []);
  const canManageBilling =
    companyPermissions.has("billing.view") || companyPermissions.has("billing.manage");
  const canOpenBooks = companyPermissions.has("accounting.view");
  const firms = firmsQuery.data ?? [];
  const platformAccess = Boolean(platformQuery.data);

  return (
    <Card className="mb-6 border-border/80">
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-lg">Your StreakBooks workspaces</CardTitle>
          <p className="text-sm text-muted-foreground">
            Use one account. Your company and firm invitations determine which records you can open.
          </p>
        </div>
        <Badge variant="outline">{company?.name ?? "No company selected"}</Badge>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <WorkspaceCard
          icon={<Building2 className="size-4" />}
          title="Company owner or subscriber"
          description={
            canManageBilling
              ? "Manage your organisation, plan, team and books. Switch companies from the top bar."
              : "Open your invited organisation. Billing controls are available to its authorised owner."
          }
          href={canManageBilling ? "/settings" : "/"}
          search={canManageBilling ? { section: "subscription" } : undefined}
          action={canManageBilling ? "Manage subscription" : "Open company books"}
          status={canManageBilling ? "Company owner" : (company?.role ?? "Company member")}
        />
        <WorkspaceCard
          icon={<Calculator className="size-4" />}
          title="Accountant"
          description={
            canOpenBooks
              ? "Review close tasks, reconciliations, workpapers and adjustments for this company."
              : "An organisation owner must invite you and grant accounting access."
          }
          href={canOpenBooks ? "/accountant" : "/firm"}
          action={canOpenBooks ? "Open accountant workspace" : "View firm access"}
          status={canOpenBooks ? "Company access" : "Invitation required"}
        />
        <WorkspaceCard
          icon={<BriefcaseBusiness className="size-4" />}
          title="CPA / CA or bookkeeping firm"
          description={
            firmsQuery.isError
              ? "Firm memberships could not be loaded. Open the firm workspace to retry access."
              : firms.length
                ? `${firms.length} firm ${firms.length === 1 ? "membership" : "memberships"}. Open the practice portfolio and work only with linked client companies.`
                : "Create a firm or accept an invitation, then ask client owners to link their organisations."
          }
          href="/firm"
          action={
            firms.length
              ? "Open firm workspace"
              : firmsQuery.isError
                ? "Retry in firm workspace"
                : "Set up a firm"
          }
          status={
            firmsQuery.isError
              ? "Membership status unavailable"
              : firms.length
                ? firms.map((firm) => firm.name).join(", ")
                : "Practice workspace"
          }
        />
        <WorkspaceCard
          icon={<ShieldCheck className="size-4" />}
          title="StreakBooks platform admin"
          description={
            platformAccess
              ? "Manage platform operations, support, settings and monitoring. MFA is required."
              : "Internal staff only. This console is separate from a company administrator or firm partner account."
          }
          href={platformAccess ? "/platform" : undefined}
          action={platformAccess ? "Open admin console" : "Restricted to platform staff"}
          status={platformAccess ? "Staff access verified" : "Staff only"}
        />
        <div className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/20 p-4 md:col-span-2 xl:col-span-4">
          <UsersRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            <strong className="font-medium text-foreground">Partner access stays scoped.</strong> A
            firm membership does not make you a StreakBooks platform admin. A client organisation
            grants and can revoke the firm’s access independently. Link Business Advisory services
            are a separate client portal and subscription.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function WorkspaceCard({
  icon,
  title,
  description,
  href,
  search,
  action,
  status,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  href?: "/" | "/settings" | "/accountant" | "/firm" | "/platform" | undefined;
  search?: { section: "subscription" } | undefined;
  action: string;
  status: string;
}) {
  return (
    <section className="flex min-h-48 flex-col rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <p className="mt-2 flex-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Badge variant="secondary" className="max-w-full truncate">
          {status}
        </Badge>
        {href ? (
          <Button asChild size="sm" variant="outline">
            <Link to={href} search={search as never}>
              {action}
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">{action}</span>
        )}
      </div>
    </section>
  );
}


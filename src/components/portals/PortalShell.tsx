import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/common/states";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { cn } from "@/lib/utils";
import { usePortal } from "@/components/portals/use-portal";

const customerNav = [
  { to: "/portal/app", label: "Home", exact: true },
  { to: "/portal/app/invoices", label: "Invoices" },
  { to: "/portal/app/credits", label: "Credit notes" },
  { to: "/portal/app/statement", label: "Statement" },
  { to: "/portal/app/payments", label: "Payments" },
  { to: "/portal/app/documents", label: "Documents" },
  { to: "/portal/app/messages", label: "Messages" },
  { to: "/portal/app/security", label: "Security" },
] as const;

const supplierNav = [
  { to: "/portal/app", label: "Home", exact: true },
  { to: "/portal/app/bills", label: "Bills" },
  { to: "/portal/app/orders", label: "Orders" },
  { to: "/portal/app/remittances", label: "Remittances" },
  { to: "/portal/app/documents", label: "Documents" },
  { to: "/portal/app/messages", label: "Messages" },
  { to: "/portal/app/bank", label: "Bank details" },
  { to: "/portal/app/security", label: "Security" },
] as const;

export function PortalShell() {
  const portal = usePortal();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (portal.isPending) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading portal</span>
      </div>
    );
  }
  if (portal.isError) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg items-center px-4">
        <ErrorState
          title="The portal could not be opened"
          description={friendlyAuthError(portal.error)}
          onRetry={() => portal.refetch()}
        />
      </div>
    );
  }
  if (!portal.memberships.length) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 px-4">
        <h1 className="text-xl font-semibold">No portal access yet</h1>
        <p className="text-sm text-muted-foreground">
          Ask the organisation to invite this email address. If you also work in LinkBooks, open the
          main app.
        </p>
        <Button asChild variant="outline">
          <Link to="/">Open LinkBooks</Link>
        </Button>
      </div>
    );
  }

  const current = portal.current;
  const nav = current?.role === "supplier" ? supplierNav : customerNav;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              LinkBooks portal
            </p>
            <h1 className="text-lg font-semibold">{current?.company_name}</h1>
            <p className="text-sm text-muted-foreground">
              {current?.contact_name} · {current?.role === "supplier" ? "Supplier" : "Customer"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {portal.memberships.length > 1 ? (
              <label className="text-sm">
                <span className="sr-only">Organisation</span>
                <select
                  className="h-9 rounded-md border border-input bg-background px-2"
                  value={current?.membership_id ?? ""}
                  onChange={(event) => portal.select(event.target.value)}
                >
                  {portal.memberships.map((membership) => (
                    <option key={membership.membership_id} value={membership.membership_id}>
                      {membership.company_name} ({membership.role})
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <ThemeToggle />
          </div>
        </div>
        <nav aria-label="Portal" className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4">
          {nav.map((item) => {
            const active =
              "exact" in item && item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "-mb-px shrink-0 border-b-2 border-transparent px-3 py-2 text-sm text-muted-foreground",
                  active && "border-primary text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        {current && !current.enabled ? (
          <p className="mb-4 rounded-md border border-border bg-muted px-3 py-2 text-sm">
            This organisation has turned the portal off. Historical invitations stay in place, and
            new activity waits until they turn it on.
          </p>
        ) : null}
        <Outlet />
      </main>
    </div>
  );
}

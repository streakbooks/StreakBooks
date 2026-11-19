import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LayoutGrid } from "lucide-react";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { listCompanyMarketplaceApps } from "@/lib/app-store/app-store.functions";
import { connectorStatusLabel } from "@/lib/app-store/connector-status";
import type { Permission } from "@/lib/permissions";

/**
 * Universal App Launcher (XP-01): org-aware installed/requested apps from anywhere.
 * Connection status is honest — disconnected until a verified connection exists.
 */
export function AppLauncher() {
  const { company } = useActiveCompany();
  const { can } = useCan();
  const canView = can("appstore.view" as Permission);
  const [query, setQuery] = useState("");
  const fetchCatalogue = useServerFn(listCompanyMarketplaceApps);
  const catalogue = useQuery({
    queryKey: ["app-store-catalogue", company?.id, "launcher"],
    queryFn: () => fetchCatalogue({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
    staleTime: 30_000,
  });

  const installed = useMemo(() => {
    const apps = catalogue.data?.apps ?? [];
    const q = query.trim().toLowerCase();
    return apps
      .filter((app) => app.installStatus && app.installStatus !== "not_installed")
      .filter((app) => !q || `${app.name} ${app.code}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [catalogue.data?.apps, query]);

  if (!canView) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open App Launcher"
          className="pointer-coarse:size-11"
        >
          <LayoutGrid className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="space-y-1 font-normal">
          <div className="text-sm font-medium">App Launcher</div>
          <div className="text-xs text-muted-foreground">
            {company?.name ?? "Select an organisation"} · installed apps for this organisation
          </div>
        </DropdownMenuLabel>
        <div className="px-2 pb-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter installed apps"
            aria-label="Filter installed apps"
            className="h-8"
          />
        </div>
        <DropdownMenuSeparator />
        {!company ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">
            Select an organisation to see installed apps.
          </div>
        ) : catalogue.isError ? (
          <div className="px-2 py-3">
            <QueryErrorState queries={[catalogue]} title="Could not load installed apps" />
          </div>
        ) : catalogue.isLoading ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">Loading apps…</div>
        ) : installed.length === 0 ? (
          <div className="space-y-2 px-2 py-3">
            <p className="text-sm text-muted-foreground">
              No installed or requested apps for this organisation yet.
            </p>
            <Button asChild size="sm" className="w-full">
              <Link to="/app-store">Browse App Store</Link>
            </Button>
          </div>
        ) : (
          installed.map((app) => (
            <DropdownMenuItem key={app.code} asChild>
              <Link
                to="/app-store/apps/$appCode"
                params={{ appCode: app.code }}
                className="flex flex-col items-start gap-1"
              >
                <span className="font-medium">{app.name}</span>
                <span className="flex flex-wrap gap-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {app.installStatus}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {app.connectionStatus ?? "disconnected"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {connectorStatusLabel(app.implementationStatus)}
                  </Badge>
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/app-store/$section" params={{ section: "my-apps" }}>
            My Apps
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/app-store">App Store overview</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/developer">Developer portal</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

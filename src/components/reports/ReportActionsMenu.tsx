import { Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { ReportingTab } from "@/lib/reports/centre-search";
const destinations: Array<{ tab: ReportingTab; label: string }> = [
  { tab: "custom", label: "Saved custom reports" },
  { tab: "management", label: "Management dashboards & forecasts" },
  { tab: "packs", label: "Management report packs" },
  { tab: "templates", label: "Report templates" },
  { tab: "schedules", label: "Schedules & delivery history" },
];
/** Navigation to existing reporting tools; permissions are checked at each destination. */
export function ReportActionsMenu({ from, to }: { from: string; to: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline">
          <MoreHorizontal className="mr-1 size-4" aria-hidden="true" />
          More options
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel>Reporting tools</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/reports/builder/$viewId" params={{ viewId: "new" }} search={{ from, to }}>
            Create custom report
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {destinations.map(({ tab, label }) => (
          <DropdownMenuItem key={tab} asChild>
            <Link to="/reports" search={{ tab, from, to }}>
              {label}
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { useEffect, useRef, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  closeSettingsPanel,
  settingsPanelTrail,
  type SettingsPanelId,
  panelLabel,
} from "@/lib/settings/panels";
import { workspaceSettingsFor } from "@/lib/settings/module-navigation";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
export function SettingsPanelFrame({
  panel,
  children,
}: {
  panel: SettingsPanelId;
  children: ReactNode;
}) {
  const location = useRouterState({ select: (s) => s.location });
  const search = location.search as Record<string, unknown>;
  const owner =
    location.pathname === "/settings"
      ? search["section"]
      : workspaceSettingsFor(location.pathname)?.prefix.slice(1);
  const parent = settingsPanelTrail(search["settingsTrail"]).at(-1);
  const focus = useRef<HTMLElement>(null);
  useEffect(() => {
    focus.current?.focus();
  }, [panel]);
  const backLabel = parent
    ? `Back to ${panelLabel(parent, typeof owner === "string" ? owner : undefined)}`
    : location.pathname.endsWith("/settings") || location.pathname === "/settings"
      ? `Back to ${typeof owner === "string" ? owner.replaceAll("_", " ") + " " : ""}settings`
      : "Back to previous screen";
  return (
    <section aria-label="Settings detail" ref={focus} tabIndex={-1} className="space-y-4">
      <ListWorkspace
        title={panelLabel(panel, typeof owner === "string" ? owner : undefined)}
        actions={
          <Button variant="outline" asChild>
            <Link
              to={location.pathname}
              search={(previous: Record<string, unknown>) => closeSettingsPanel(previous)}
              aria-label={backLabel}
            >
              <ArrowLeft className="mr-2 size-4" aria-hidden />
              Back
            </Link>
          </Button>
        }
      >
        {children}
      </ListWorkspace>
    </section>
  );
}

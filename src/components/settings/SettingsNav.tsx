import { Link, useRouterState } from "@tanstack/react-router";
import { openSettingsPanel, type SettingsPanelId } from "@/lib/settings/panels";
import { cn } from "@/lib/utils";
import { categoryMeta, searchSettings, type SettingsCategory } from "@/lib/settings/registry";
import { SETTINGS_NAV_GROUPS } from "@/lib/settings/nav-groups";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

const NAV_KEY = "streakbooks.settings.nav.open";

type Props = {
  section: string;
  embedded?: boolean;
  showDemo: boolean;
  filter?: string;
};

export function SettingsNav({ section, embedded = false, showDemo, filter }: Props) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(NAV_KEY);
      if (raw) setOpen(JSON.parse(raw) as Record<string, boolean>);
      else {
        const init: Record<string, boolean> = {};
        SETTINGS_NAV_GROUPS.forEach((g) => {
          init[g.label] = true;
        });
        setOpen(init);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (next: Record<string, boolean>) => {
    setOpen(next);
    try {
      localStorage.setItem(NAV_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const q = (filter ?? "").trim().toLowerCase();
  const matches = new Set(searchSettings(q).map((item) => item.id));
  const hasVisibleMatches = categoryMeta.some(
    (item) => matches.has(item.id) && (item.id !== "demo" || showDemo),
  );

  return (
    <nav className="space-y-2" aria-label="Settings categories">
      {SETTINGS_NAV_GROUPS.map((group) => {
        const items = categoryMeta.filter((c) => {
          if (!group.ids.includes(c.id)) return false;
          if (c.id === "demo" && !showDemo) return false;
          return matches.has(c.id);
        });
        if (items.length === 0) return null;
        const isOpen = Boolean(q) || open[group.label] !== false;
        return (
          <Collapsible
            key={group.label}
            open={isOpen}
            onOpenChange={(v) => {
              if (!q) persist({ ...open, [group.label]: v });
            }}
          >
            <CollapsibleTrigger asChild>
              <Button
                variant="ghost"
                className="flex h-8 w-full items-center justify-between px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {group.label}
                <ChevronDown className={cn("size-3.5 transition", isOpen ? "rotate-180" : "")} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-0.5 pb-2">
              {items.map((c) => (
                <Link
                  key={c.id}
                  to={embedded ? pathname : "/settings"}
                  search={
                    embedded
                      ? (previous: Record<string, unknown>) =>
                          openSettingsPanel(previous, `category:${c.id}` as SettingsPanelId)
                      : { section: c.id }
                  }
                  aria-current={section === c.id ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                    section === c.id
                      ? "bg-accent text-accent-foreground"
                      : "text-foreground/90 hover:bg-muted",
                  )}
                >
                  <span className="truncate">{c.label}</span>
                  {c.availability === "unavailable" ? (
                    <Badge variant="outline" className="ml-1 shrink-0 text-[10px]">
                      Unavailable
                    </Badge>
                  ) : null}
                </Link>
              ))}
            </CollapsibleContent>
          </Collapsible>
        );
      })}
      {q && !hasVisibleMatches ? (
        <p role="status" className="px-2 py-3 text-sm text-muted-foreground">
          No matching settings categories.
        </p>
      ) : null}
    </nav>
  );
}

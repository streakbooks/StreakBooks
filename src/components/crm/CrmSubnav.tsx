import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useCan } from "@/hooks/use-can";
import { CRM_SECTIONS, type CrmSectionKey } from "@/lib/crm/sections";
import type { Permission } from "@/lib/permissions";
import { cn } from "@/lib/utils";

const CRM_GROUPS = [
  { key: "workspace", label: "Workspace" },
  { key: "pipeline", label: "Pipeline" },
  { key: "relationships", label: "Relationships" },
  { key: "engagement", label: "Engagement" },
  { key: "revenue", label: "Revenue" },
  { key: "insights", label: "Insights" },
  { key: "admin", label: "Administration" },
] as const;

/**
 * Accessible, two-row CRM navigation.
 *
 * The previous layout stacked seven different navigation bands above every
 * screen. Group selection reduces that to two compact rows while retaining
 * real deep links, keyboard access, browser history and Ctrl/Cmd-click.
 */
export function CrmSubnav({ current }: { current: CrmSectionKey }) {
  const { can } = useCan();
  const [selection, setSelection] = useState<{
    forSection: CrmSectionKey;
    group: string;
  } | null>(null);

  const visible = CRM_SECTIONS.filter((section) =>
    section.anyOf.some((permission) => can(permission as Permission)),
  );
  const groups = CRM_GROUPS.map((group) => ({
    ...group,
    sections: visible.filter((section) => section.group === group.key),
  })).filter((group) => group.sections.length > 0);

  const currentGroup = visible.find((section) => section.key === current)?.group ?? groups[0]?.key;
  const selectedGroup =
    selection?.forSection === current && groups.some((group) => group.key === selection.group)
      ? selection.group
      : currentGroup;
  const displayed = groups.find((group) => group.key === selectedGroup);
  const currentLabel = CRM_SECTIONS.find((section) => section.key === current)?.label ?? "CRM";

  if (groups.length === 0) return null;

  return (
    <nav
      aria-label="CRM sections"
      className="mb-5 min-w-0 rounded-2xl border border-border/70 bg-card/70 p-3 shadow-sm print:hidden sm:p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            CRM workspace
          </p>
          <p className="truncate text-sm font-semibold text-foreground">{currentLabel}</p>
        </div>
        {visible.some((section) => section.key === "overview") && current !== "overview" ? (
          <Link
            to="/crm"
            className="inline-flex min-h-10 items-center rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            Overview
          </Link>
        ) : null}
      </div>

      <div aria-label="CRM navigation groups" className="flex min-w-0 gap-1 overflow-x-auto pb-2">
        {groups.map((group) => {
          const active = group.key === selectedGroup;
          return (
            <button
              key={group.key}
              type="button"
              aria-pressed={active}
              aria-controls="crm-navigation-sections"
              onClick={() => setSelection({ forSection: current, group: group.key })}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11 motion-reduce:transition-none",
                active
                  ? "bg-primary/10 text-primary ring-1 ring-primary/25"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {group.label}
              <span
                aria-hidden="true"
                className={cn(
                  "text-xs tabular-nums",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                {group.sections.length}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id="crm-navigation-sections"
        aria-label={displayed ? displayed.label + " sections" : "CRM sections"}
        className="flex min-w-0 flex-wrap gap-1.5 border-t border-border/70 pt-3"
      >
        {(displayed?.sections ?? []).map((section) => {
          const active = current === section.key;
          const className = cn(
            "inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11 motion-reduce:transition-none",
            active
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border/60 bg-background text-foreground hover:border-primary/30 hover:bg-muted",
          );
          return section.key === "overview" ? (
            <Link
              key={section.key}
              to="/crm"
              className={className}
              aria-current={active ? "page" : undefined}
            >
              {section.label}
            </Link>
          ) : (
            <Link
              key={section.key}
              to="/crm/$section"
              params={{ section: section.key }}
              className={className}
              aria-current={active ? "page" : undefined}
            >
              {section.label}
            </Link>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Select a category to browse its pages. Links support back, forward and opening in a new tab.
      </p>
    </nav>
  );
}

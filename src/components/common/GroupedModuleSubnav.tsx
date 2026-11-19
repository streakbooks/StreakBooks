import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

import {
  buildGroupedModuleNav,
  type GroupedModuleNavGroup,
  type GroupedModuleNavSection,
} from "@/lib/navigation/grouped-module-nav";

/**
 * Compact two-row module navigation: group segmented controls + section links.
 *
 * Keeps every permitted destination as a real browser Link (history, Ctrl/Cmd-click)
 * while limiting visible chrome to two levels. Prefer this over stacking every group
 * band vertically on dense modules (HR, CRM, Property Management).
 */
export function GroupedModuleSubnav<TKey extends string>({
  label,
  groups,
  sections,
  current,
  overview,
  renderSection,
  className,
}: {
  label: string;
  groups: readonly GroupedModuleNavGroup[];
  sections: readonly GroupedModuleNavSection<TKey>[];
  current: TKey;
  /** Optional shortcut when the current page is not the module overview. */
  overview?: ReactNode;
  renderSection: (section: GroupedModuleNavSection<TKey>, active: boolean) => ReactNode;
  className?: string;
}) {
  const [selection, setSelection] = useState<{ forSection: TKey; group: string } | null>(null);
  const { populated, selectedGroup, displayed } = buildGroupedModuleNav(
    groups,
    sections,
    current,
    selection?.forSection === current ? selection.group : null,
  );
  const currentLabel = sections.find((section) => section.key === current)?.label ?? label;
  const sectionsId = `${label.toLowerCase().replace(/\s+/g, "-")}-navigation-sections`;

  if (populated.length === 0) return null;

  return (
    <nav
      aria-label={`${label} sections`}
      className={cn(
        "mb-2 min-w-0 rounded-lg border border-border/70 bg-card/80 px-2 py-1.5 print:hidden sm:px-2.5",
        className,
      )}
    >
      <div className="mb-1 flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground">
          <span className="sr-only">{label}: </span>
          {currentLabel}
        </p>
        {overview}
      </div>

      <div
        aria-label={`${label} navigation groups`}
        className="flex min-w-0 gap-1 overflow-x-auto pb-1"
      >
        {populated.map((group) => {
          const active = group.key === selectedGroup;
          return (
            <button
              key={group.key}
              type="button"
              aria-pressed={active}
              aria-controls={sectionsId}
              onClick={() => setSelection({ forSection: current, group: group.key })}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10 motion-reduce:transition-none",
                active
                  ? "bg-primary/10 text-primary ring-1 ring-primary/25"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {group.label}
              <span
                aria-hidden="true"
                className={cn(
                  "text-[0.7rem] tabular-nums",
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
        id={sectionsId}
        aria-label={displayed ? `${displayed.label} sections` : `${label} sections`}
        className="flex min-w-0 flex-wrap gap-1 border-t border-border/60 pt-1.5"
      >
        {(displayed?.sections ?? []).map((section) => {
          const active = current === section.key;
          return (
            <span key={section.key} className="contents">
              {renderSection(section, active)}
            </span>
          );
        })}
      </div>
    </nav>
  );
}

import type { ReactNode } from "react";
import { PageHeader, type Crumb } from "@/components/common/states";
import { cn } from "@/lib/utils";

/**
 * Shared list workspace chrome. New modules should compose this instead of
 * inventing one-off page shells — tokens, density and header rhythm inherit automatically.
 */
export function ListWorkspace({
  title,
  description,
  breadcrumbs,
  meta,
  actions,
  subnav,
  toolbar,
  insights,
  children,
  className,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  meta?: ReactNode;
  actions?: ReactNode;
  subnav?: ReactNode;
  toolbar?: ReactNode;
  insights?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-slot="list-workspace"
      aria-label={title}
      className={cn("lb-list-workspace flex min-w-0 flex-col gap-3", className)}
    >
      <PageHeader
        title={title}
        {...(description !== undefined ? { description } : {})}
        {...(breadcrumbs !== undefined ? { breadcrumbs } : {})}
        {...(meta !== undefined ? { meta } : {})}
        {...(actions !== undefined ? { actions } : {})}
      />
      {subnav}
      {toolbar}
      <div
        className={cn(
          "lb-list-workspace-body grid min-w-0 gap-3",
          insights ? "xl:grid-cols-[minmax(0,1fr)_18rem]" : undefined,
        )}
      >
        <div className="lb-list-workspace-main min-w-0">{children}</div>
        {insights ? (
          <aside
            className="lb-insight-rail min-w-0 rounded-xl border border-border/70 bg-card/60 p-4"
            aria-label="Contextual insights"
          >
            {insights}
          </aside>
        ) : null}
      </div>
    </section>
  );
}

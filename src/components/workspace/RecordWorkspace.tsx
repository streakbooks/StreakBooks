import type { ReactNode } from "react";
import { PageHeader, type Crumb } from "@/components/common/states";
import { cn } from "@/lib/utils";

/**
 * Shared record/detail workspace: action header, optional related tiles, body tabs,
 * and a contextual insight rail. Backends and posting rules remain outside this shell.
 */
export function RecordWorkspace({
  title,
  description,
  breadcrumbs,
  meta,
  actions,
  related,
  timeline,
  insights,
  children,
  className,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  meta?: ReactNode;
  actions?: ReactNode;
  related?: ReactNode;
  timeline?: ReactNode;
  insights?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("lb-record-workspace flex min-w-0 flex-col gap-4", className)}>
      <PageHeader
        title={title}
        {...(description !== undefined ? { description } : {})}
        {...(breadcrumbs !== undefined ? { breadcrumbs } : {})}
        {...(meta !== undefined ? { meta } : {})}
        {...(actions !== undefined ? { actions } : {})}
      />
      {related}
      <div
        className={cn(
          "lb-record-workspace-body grid min-w-0 gap-4",
          insights ? "xl:grid-cols-[minmax(0,1fr)_18rem]" : undefined,
        )}
      >
        <div className="lb-record-workspace-main flex min-w-0 flex-col gap-4">
          {children}
          {timeline}
        </div>
        {insights ? (
          <aside
            className="lb-insight-rail min-w-0 rounded-xl border border-border/70 bg-card/60 p-4"
            aria-label="Contextual insights"
          >
            {insights}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

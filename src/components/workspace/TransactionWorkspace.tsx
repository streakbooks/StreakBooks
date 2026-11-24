import type { ReactNode } from "react";
import { PageHeader, type Crumb } from "@/components/common/states";
import { cn } from "@/lib/utils";

/**
 * Shared premium transaction entry shell.
 *
 * Layout contract (StreakBooks original expression of mature accounting UX):
 * header (title/status/actions) → details FormGrid → line editor → sticky
 * totals/actions → optional support tabs and insight rail.
 *
 * Does not own posting, permissions, or calculations — callers wire real backends.
 */
export function TransactionWorkspace({
  title,
  description,
  breadcrumbs,
  meta,
  actions,
  stickyActions,
  details,
  lines,
  totals,
  support,
  insights,
  children,
  className,
}: {
  title: string;
  description?: string;
  breadcrumbs?: Crumb[];
  meta?: ReactNode;
  /** Primary header actions (Save, Approve, More). Prefer real wired controls. */
  actions?: ReactNode;
  /** Optional sticky footer bar (Save + Totals) that remains visible while scrolling. */
  stickyActions?: ReactNode;
  /** Header field grid: contact, dates, reference, tax treatment, etc. */
  details?: ReactNode;
  /** Editable line-item region. */
  lines?: ReactNode;
  /** Totals summary (usually bottom-right). */
  totals?: ReactNode;
  /** Notes / attachments / history / related tabs or panels. */
  support?: ReactNode;
  insights?: ReactNode;
  /** Escape hatch for transitional editors that still own their own body layout. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      data-slot="transaction-workspace"
      aria-label={title}
      className={cn("lb-transaction-workspace flex min-w-0 flex-col gap-3 pb-20", className)}
    >
      <PageHeader
        title={title}
        {...(description !== undefined ? { description } : {})}
        {...(breadcrumbs !== undefined ? { breadcrumbs } : {})}
        {...(meta !== undefined ? { meta } : {})}
        {...(actions !== undefined ? { actions } : {})}
      />

      <div
        className={cn(
          "lb-transaction-workspace-body grid min-w-0 gap-3",
          insights ? "xl:grid-cols-[minmax(0,1fr)_18rem]" : undefined,
        )}
      >
        <div className="lb-transaction-workspace-main flex min-w-0 flex-col gap-3">
          {details ? (
            <div
              data-slot="transaction-details"
              className="rounded-lg border border-border/70 bg-card/80 p-3 sm:p-4"
            >
              {details}
            </div>
          ) : null}

          {lines ? (
            <div data-slot="transaction-lines" className="min-w-0 overflow-x-auto">
              {lines}
            </div>
          ) : null}

          {totals ? (
            <div
              data-slot="transaction-totals"
              className="flex min-w-0 justify-end border-t border-border/60 pt-4"
            >
              {totals}
            </div>
          ) : null}

          {support ? (
            <div data-slot="transaction-support" className="min-w-0">
              {support}
            </div>
          ) : null}

          {children}
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

      {stickyActions ? (
        <div
          data-slot="transaction-sticky-actions"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-border/80 bg-card/95 px-3 py-3 backdrop-blur-sm supports-[backdrop-filter]:bg-card/85 sm:px-4 lg:left-[var(--lb-sidebar-current-width,var(--lb-sidebar-width))] lg:px-6 print:hidden"
        >
          <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-end gap-2">
            {stickyActions}
          </div>
        </div>
      ) : null}
    </section>
  );
}

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type WorkspaceInsightFact = {
  label: string;
  value: ReactNode;
};

export type WorkspaceInsightLink = {
  label: string;
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string | undefined>;
  hint?: string;
};

/**
 * Factual related-record rail content. Only render known links and ledger-backed
 * facts — never invent balances, AI suggestions, or competitor-style smart buttons.
 */
export function WorkspaceInsights({
  title = "Related",
  facts,
  links,
  footer,
  className,
}: {
  title?: string;
  facts?: WorkspaceInsightFact[];
  links?: WorkspaceInsightLink[];
  footer?: ReactNode;
  className?: string;
}) {
  const hasFacts = Boolean(facts?.length);
  const hasLinks = Boolean(links?.length);
  if (!hasFacts && !hasLinks && !footer) return null;

  return (
    <div className={cn("space-y-4 text-sm", className)} data-slot="workspace-insights">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
      {hasFacts ? (
        <dl className="space-y-2">
          {facts!.map((fact) => (
            <div key={fact.label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd className="break-words font-medium text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {hasLinks ? (
        <ul className="space-y-1.5" aria-label="Related records">
          {links!.map((link) => (
            <li key={`${link.label}-${link.to}`}>
              <Link
                to={link.to as never}
                {...(link.params ? { params: link.params as never } : {})}
                {...(link.search ? { search: link.search as never } : {})}
                className="block rounded-md border border-transparent px-2 py-1.5 hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="font-medium text-foreground underline-offset-2 hover:underline">
                  {link.label}
                </span>
                {link.hint ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{link.hint}</span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {footer ? <div className="border-t border-border/60 pt-3 text-xs text-muted-foreground">{footer}</div> : null}
    </div>
  );
}

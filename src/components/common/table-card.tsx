import type { ReactNode } from "react";

/** Card frame for a data table: rounded border, clipped corners, no double borders. */
export function TableCard({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border/90 bg-card shadow-card ring-1 ring-foreground/5 dark:ring-white/5">
      {children}
    </div>
  );
}

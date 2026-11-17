import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Titled group of related fields inside a form. Left column describes the section on wide
 * screens, fields sit in a responsive grid on the right.
 */
export function FormSection({
  title,
  description,
  children,
  columns = 2,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        "grid min-w-0 gap-4 border-b border-border/70 py-6 first:pt-0 last:border-b-0 lg:grid-cols-[minmax(11rem,14rem)_minmax(0,1fr)] lg:gap-8",
        className,
      )}
    >
      <div>
        <h2 className="border-l-[3px] border-primary/65 pl-3 text-sm font-bold tracking-[-0.01em] text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 pl-3 text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div
        className={cn(
          "grid min-w-0 gap-4",
          columns === 1 && "grid-cols-1",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-2 xl:grid-cols-3",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * Label + control + helper text + inline validation message.
 * `htmlFor` must equal the control's id; spread `fieldA11y(htmlFor, …)` onto the control so
 * screen readers announce the helper/error text. Required fields show a visible asterisk.
 */
export function FormField({
  label,
  htmlFor,
  required,
  helper,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  helper?: ReactNode;
  error?: string | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? (
          <>
            <span aria-hidden className="ml-0.5 text-destructive">
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </Label>
      {children}
      {helper && !error ? (
        <p id={`${htmlFor}-help`} className="text-xs text-muted-foreground">
          {helper}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Sticky-friendly action row at the bottom of a form (primary action last). */
export function FormActions({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-2 border-t border-border/70 bg-card/60 px-1 py-4 print:hidden sm:px-2",
        className,
      )}
    >
      {children}
    </div>
  );
}

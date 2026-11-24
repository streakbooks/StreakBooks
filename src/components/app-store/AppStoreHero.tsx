import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Marketplace hero surface — uses StreakBooks design tokens (navy/blue), not a new theme.
 * One composition: brand + headline + support + CTAs.
 */
export function AppStoreHero({
  brand = "StreakBooks App Store",
  title,
  description,
  actions,
  className,
}: {
  brand?: string;
  title: string;
  description: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative mb-8 overflow-hidden rounded-2xl border border-border/80",
        "bg-[radial-gradient(120%_80%_at_0%_0%,color-mix(in_oklch,var(--primary)_18%,transparent),transparent_55%),linear-gradient(160deg,color-mix(in_oklch,var(--background)_70%,var(--card)),var(--card))]",
        "px-6 py-8 sm:px-8 sm:py-10",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-500",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-primary/10 blur-3xl motion-safe:animate-pulse"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-24 left-1/3 size-48 rounded-full bg-info/10 blur-3xl"
      />
      <p className="relative mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
        {brand}
      </p>
      <h1 className="relative max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      <p className="relative mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
        {description}
      </p>
      {actions ? <div className="relative mt-6 flex flex-wrap gap-2">{actions}</div> : null}
    </section>
  );
}

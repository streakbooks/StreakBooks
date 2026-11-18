import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { SettingsDestinationLink } from "@/components/settings/ModuleSettingsLinks";
import type { SettingsDestination } from "@/lib/settings/module-navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { activeSubnavIndex } from "@/lib/navigation/subnav-selection";

type Item = {
  to: string;
  label: string;
  exact?: boolean;
  search?: Record<string, string>;
  count?: number | undefined;
};

/**
 * All module sections remain discoverable native links; no items are hidden
 * behind a More menu. A scrollable strip and explicit controls make long
 * modules navigable on desktop, touch and keyboard, with Settings always visible.
 */
export function ModuleSubnav({
  label,
  items,
  settings,
}: {
  label: string;
  items: readonly Item[];
  settings: SettingsDestination;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.search });
  const stripRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const sections = items.filter((item) => item.label !== "Settings");
  const activeIndex = activeSubnavIndex(sections, pathname, search as Record<string, unknown>);
  const isActive = (item: Item) => sections[activeIndex] === item;

  const updateEdges = useCallback(() => {
    const element = stripRef.current;
    if (!element) return;
    const left = element.scrollLeft > 2;
    const right = element.scrollLeft + element.clientWidth < element.scrollWidth - 2;
    setEdges((previous) =>
      previous.left === left && previous.right === right ? previous : { left, right },
    );
  }, []);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateEdges);
    observer?.observe(strip);
    if (strip.firstElementChild) observer?.observe(strip.firstElementChild);
    const frame = window.requestAnimationFrame(() => {
      const current = strip.querySelector<HTMLElement>('a[aria-current="page"]');
      if (current) {
        const container = strip.getBoundingClientRect();
        const active = current.getBoundingClientRect();
        if (active.left < container.left || active.right > container.right) {
          strip.scrollBy({
            left:
              active.left < container.left
                ? active.left - container.left
                : active.right - container.right,
            behavior: "instant",
          });
        }
      }
      updateEdges();
    });
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [items, pathname, search, updateEdges]);

  const scrollSections = (direction: -1 | 1) => {
    const strip = stripRef.current;
    if (!strip) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollBy({
      left: Math.max(160, Math.floor(strip.clientWidth * 0.7)) * direction,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  return (
    <nav
      aria-label={label + " sections"}
      className="mb-5 flex min-w-0 items-center gap-1 border-b border-border pb-1 print:hidden"
    >
      <div
        ref={stripRef}
        onScroll={updateEdges}
        data-testid="module-section-strip"
        className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain"
      >
        <div className="flex w-max min-w-full items-center gap-1 py-1">
          {sections.map((item) => (
            <Link
              key={item.to + item.label}
              to={item.to}
              search={item.search as never}
              activeOptions={{ exact: item.exact ?? false }}
              aria-current={isActive(item) ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-transparent px-3 py-2 text-sm font-medium text-muted-foreground outline-none transition-[background-color,color,border-color,box-shadow] duration-[var(--lb-duration-fast)] hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none pointer-coarse:min-h-11",
                isActive(item) &&
                  "border-border bg-accent text-foreground shadow-[0_1px_2px_color-mix(in_oklab,var(--foreground)_6%,transparent)]",
              )}
            >
              {item.label}
              {typeof item.count === "number" ? (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {item.count}
                </Badge>
              ) : null}
            </Link>
          ))}
        </div>
      </div>
      {(edges.left || edges.right) && (
        <div className="hidden shrink-0 items-center gap-0.5 border-l border-border pl-1 sm:flex">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={"Scroll " + label + " sections left"}
            title="Earlier sections"
            disabled={!edges.left}
            onClick={() => scrollSections(-1)}
            className="size-9"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={"Scroll " + label + " sections right"}
            title="Later sections"
            disabled={!edges.right}
            onClick={() => scrollSections(1)}
            className="size-9"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      )}
      <SettingsDestinationLink
        destination={settings}
        mode="route"
        ariaLabel={label + " settings"}
        className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
      >
        <Settings2 className="size-4" aria-hidden />
        <span className="hidden lg:inline">Settings</span>
      </SettingsDestinationLink>
    </nav>
  );
}

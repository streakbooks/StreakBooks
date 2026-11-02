/** Visual treatment for semantic, URL-addressable subsection tabs.
 * Use a real router <Link>, not Radix TabsTrigger asChild: Radix's mouse handlers
 * can prevent modified/middle clicks from reaching native browser behavior.
 */
export const nativeTabLinkClass =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow";

import type { KeyboardEvent } from "react";

/**
 * Preserve familiar tablist arrow/Home/End navigation without wrapping a real
 * hyperlink in a Radix TabsTrigger. Modified clicks and browser context menus
 * remain entirely native; keyboard selection is ordinary same-tab navigation.
 */
export function handleNativeTabKeyDown(event: KeyboardEvent<HTMLElement>): void {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  const tabs = Array.from(
    event.currentTarget.querySelectorAll<HTMLAnchorElement>(
      'a[role="tab"]:not([aria-disabled="true"])',
    ),
  );
  if (tabs.length < 2) return;
  const index = tabs.indexOf(event.target as HTMLAnchorElement);
  if (index < 0) return;

  let next: number;
  if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
  else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  else return;

  event.preventDefault();
  tabs[next]?.focus();
  tabs[next]?.click();
}

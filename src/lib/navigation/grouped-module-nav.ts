import { cn } from "@/lib/utils";

export type GroupedModuleNavGroup = {
  key: string;
  label: string;
};

export type GroupedModuleNavSection<TKey extends string> = {
  key: TKey;
  label: string;
  group: string;
};

/** Pure helper for tests and callers that need the populated group model. */
export function buildGroupedModuleNav<TKey extends string>(
  groups: readonly GroupedModuleNavGroup[],
  sections: readonly GroupedModuleNavSection<TKey>[],
  current: TKey,
  selectedGroupOverride?: string | null,
) {
  const populated = groups
    .map((group) => ({
      ...group,
      sections: sections.filter((section) => section.group === group.key),
    }))
    .filter((group) => group.sections.length > 0);
  const currentGroup =
    sections.find((section) => section.key === current)?.group ?? populated[0]?.key;
  const selectedGroup =
    selectedGroupOverride && populated.some((group) => group.key === selectedGroupOverride)
      ? selectedGroupOverride
      : currentGroup;
  return {
    populated,
    selectedGroup,
    displayed: populated.find((group) => group.key === selectedGroup) ?? null,
  };
}

/** Shared class for section deep links inside GroupedModuleSubnav. */
export function groupedModuleSectionClassName(active: boolean) {
  return cn(
    "inline-flex h-8 items-center rounded-md border px-2.5 text-[0.8125rem] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-10 motion-reduce:transition-none",
    active
      ? "border-primary bg-primary text-primary-foreground"
      : "border-border/60 bg-background text-foreground hover:border-primary/30 hover:bg-muted",
  );
}

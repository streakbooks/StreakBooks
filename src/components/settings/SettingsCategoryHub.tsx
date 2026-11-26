import { Link } from "@tanstack/react-router";
import { SETTINGS_NAV_GROUPS } from "@/lib/settings/nav-groups";
import { CATEGORY_ICONS } from "@/lib/settings/category-icons";
import { categoryMeta, searchSettings } from "@/lib/settings/registry";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

type Props = {
  currentSection?: string;
  showDemo: boolean;
  filter: string;
  onFilterChange: (value: string) => void;
  onOpenSearch?: (() => void) | undefined;
  className?: string;
};

export function SettingsCategoryHub({
  currentSection,
  showDemo,
  filter,
  onFilterChange,
  onOpenSearch,
  className,
}: Props) {
  const q = filter.trim().toLowerCase();
  const allowed = new Set(
    searchSettings(q)
      .filter((item) => item.id !== "demo" || showDemo)
      .map((item) => item.id),
  );
  const metaById = new Map(categoryMeta.map((item) => [item.id, item]));

  return (
    <div className={cn("space-y-8", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Settings</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a category. Search or browse by area — same as picking a section in the sidebar.
          </p>
        </div>
        <div className="relative w-full sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="Search settings…"
            aria-label="Search settings categories"
            className="pl-9"
            onKeyDown={(e) => {
              if (e.key === "Enter" && onOpenSearch) {
                e.preventDefault();
                onOpenSearch();
              }
            }}
          />
        </div>
      </div>

      {SETTINGS_NAV_GROUPS.map((group) => {
        const items = group.ids
          .map((id) => metaById.get(id))
          .filter((item): item is (typeof categoryMeta)[number] => Boolean(item))
          .filter((item) => allowed.has(item.id));
        if (items.length === 0) return null;
        return (
          <section key={group.label} aria-labelledby={`settings-group-${group.label}`}>
            <h3
              id={`settings-group-${group.label}`}
              className="mb-3 text-sm font-semibold text-foreground"
            >
              {group.label}
            </h3>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => {
                const Icon = CATEGORY_ICONS[item.id];
                const active = currentSection === item.id;
                return (
                  <li key={item.id}>
                    <Link
                      to="/settings"
                      search={{ section: item.id }}
                      className={cn(
                        "group flex h-full gap-3 rounded-xl border bg-card p-4 text-left transition-colors",
                        "hover:border-primary/40 hover:bg-accent/30",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        active && "border-primary/50 bg-accent/40",
                      )}
                      aria-current={active ? "page" : undefined}
                    >
                      <span
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-lg",
                          "bg-primary/10 text-primary group-hover:bg-primary/15",
                        )}
                      >
                        <Icon className="size-5" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-primary group-hover:underline">
                          {item.label}
                        </span>
                        <span className="mt-1 block text-sm leading-snug text-muted-foreground line-clamp-2">
                          {item.description}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {q && allowed.size === 0 ? (
        <p className="text-sm text-muted-foreground" role="status">
          No settings match &quot;{filter.trim()}&quot;. Try another term or open search (Ctrl/⌘ Shift
          K).
        </p>
      ) : null}
    </div>
  );
}
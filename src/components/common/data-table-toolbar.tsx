import { useRef, type ReactNode } from "react";
import { Download, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableAppearanceControls } from "./TableAppearanceControls";
import type { Density } from "@/lib/table-prefs";

export type ToolbarColumn = { id: string; label: string; visible: boolean };

/**
 * Toolbar that sits above a data table: search, filter controls (any nodes), column chooser,
 * density, export. When rows are selected it swaps to a bulk-action bar with the count and a
 * "clear" control, so bulk actions never hide among filters.
 *
 * It is presentational: pass state in, handle changes out. Omit a prop to omit that control.
 */
export function DataTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search",
  filters,
  columns,
  onToggleColumn,
  density,
  onDensityChange,
  onExport,
  exporting,
  selectedCount = 0,
  onClearSelection,
  bulkActions,
  summary,
  exportDisabled,
}: {
  search?: string;
  onSearchChange?: (q: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  columns?: ToolbarColumn[];
  onToggleColumn?: (id: string) => void;
  density?: Density;
  onDensityChange?: (d: Density) => void;
  onExport?: (() => void) | undefined;
  exporting?: boolean;
  selectedCount?: number;
  onClearSelection?: () => void;
  bulkActions?: ReactNode;
  summary?: ReactNode;
  exportDisabled?: boolean;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const clearSearch = () => {
    onSearchChange?.("");
    searchRef.current?.focus();
  };
  if (selectedCount > 0) {
    return (
      <div
        role="region"
        aria-label="Bulk actions"
        className="mb-4 flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-primary/30 bg-info-soft/80 px-3 py-3 shadow-xs sm:px-4 print:hidden"
      >
        <span className="text-sm font-medium text-info-ink" aria-live="polite">
          {selectedCount} selected
        </span>
        <div className="flex flex-wrap items-center gap-2">{bulkActions}</div>
        {onClearSelection ? (
          <Button type="button" variant="ghost" size="sm" className="ml-auto" aria-label="Clear selected records" onClick={onClearSelection}>
            <X />
            Clear
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div
      className="mb-4 flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-border/85 bg-card p-3 shadow-card sm:p-3.5 print:hidden"
      role="search"
      aria-label="Filter records"
    >
      {onSearchChange ? (
        <div className="relative w-full sm:w-64 sm:flex-1 sm:max-w-md">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchRef}
            className="bg-muted/15 pl-9 pr-10"
            type="search"
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== "Escape" ||
                event.defaultPrevented ||
                !search ||
                event.nativeEvent.isComposing
              )
                return;
              event.preventDefault();
              event.stopPropagation();
              clearSearch();
            }}
          />
          {search ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 size-9"
              aria-label="Clear search"
              onClick={clearSearch}
            >
              <X className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
      ) : null}
      {filters}
      {summary ? (
        <span className="rounded-md bg-muted/45 px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground" role="status">
          {summary}
        </span>
      ) : null}
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
        <TableAppearanceControls
          columns={columns ?? []}
          hidden={columns?.filter((column) => !column.visible).map((column) => column.id) ?? []}
          density={density}
          onToggleColumn={onToggleColumn}
          onDensityChange={onDensityChange}
        />
        {onExport ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onExport}
            disabled={exporting || exportDisabled}
            aria-busy={exporting || undefined}
          >
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            Export CSV
          </Button>
        ) : null}
      </div>
    </div>
  );
}

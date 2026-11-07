import { Columns3, RotateCcw, Rows3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Density } from "@/lib/table-prefs";

export type OptionalTableColumn = { id: string; label: string };

/**
 * Consistent, keyboard-accessible list appearance controls.
 *
 * Only optional columns are configurable: IDs, money amounts, document
 * actions and financial workflow controls remain visible and usable.
 */
export function TableAppearanceControls({
  columns,
  hidden,
  density,
  onToggleColumn,
  onDensityChange,
  onReset,
}: {
  columns: readonly OptionalTableColumn[];
  hidden: readonly string[];
  density?: Density | undefined;
  onToggleColumn?: ((id: string) => void) | undefined;
  onDensityChange?: ((density: Density) => void) | undefined;
  onReset?: (() => void) | undefined;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 print:hidden"
      role="group"
      aria-label="Table appearance"
    >
      {columns.length > 0 && onToggleColumn ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" aria-label="Columns">
              <Columns3 className="size-4" aria-hidden />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60 rounded-xl border-border/85 shadow-overlay">
            <DropdownMenuLabel>Optional columns</DropdownMenuLabel>
            {columns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={!hidden.includes(column.id)}
                onCheckedChange={() => onToggleColumn(column.id)}
                onSelect={(event) => event.preventDefault()}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Essential fields and actions stay visible
            </DropdownMenuLabel>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {density && onDensityChange ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label={
                density === "compact" ? "Compact row density" : "Comfortable row density"
              }
            >
              <Rows3 className="size-4" aria-hidden />
              {density === "compact" ? "Compact" : "Comfortable"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl border-border/85 shadow-overlay">
            <DropdownMenuLabel>Row spacing</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={density}
              onValueChange={(value) => {
                if (value === "compact" || value === "comfortable") onDensityChange(value);
              }}
            >
              <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {onReset ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onReset}>
                  <RotateCcw className="size-4" aria-hidden />
                  Restore table defaults
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

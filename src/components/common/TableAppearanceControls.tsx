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
  density: Density;
  onToggleColumn: (id: string) => void;
  onDensityChange: (density: Density) => void;
  onReset: () => void;
}) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 print:hidden"
      role="group"
      aria-label="Table appearance"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="Choose table columns">
            <Columns3 className="size-4" aria-hidden />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" aria-label="Choose row density">
            <Rows3 className="size-4" aria-hidden />
            {density === "compact" ? "Compact" : "Comfortable"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
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
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onReset}>
            <RotateCcw className="size-4" aria-hidden />
            Restore table defaults
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

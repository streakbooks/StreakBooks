"use client";

import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type LineGridColumnOption = {
  id: string;
  label: string;
  /** Required columns cannot be hidden. */
  required?: boolean;
};

/**
 * Hide/show optional spreadsheet columns. Does not change posting or calculation rules.
 */
export function LineGridColumnMenu({
  columns,
  visibleIds,
  onChange,
  label = "Columns",
}: {
  columns: readonly LineGridColumnOption[];
  visibleIds: readonly string[];
  onChange: (next: string[]) => void;
  label?: string;
}) {
  const visible = new Set(visibleIds);
  const hideable = columns.filter((column) => !column.required);
  const hiddenCount = hideable.filter((column) => !visible.has(column.id)).length;
  const triggerLabel = hiddenCount > 0 ? `${label} (${hiddenCount} hidden)` : `${label} (0 hidden)`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-1.5">
          <Columns3 className="size-3.5" aria-hidden />
          {triggerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Show columns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={visible.has(column.id)}
            disabled={column.required}
            onCheckedChange={(checked) => {
              if (column.required) return;
              const next = checked
                ? [...visibleIds, column.id]
                : visibleIds.filter((id) => id !== column.id);
              // Keep required columns present.
              for (const required of columns.filter((c) => c.required)) {
                if (!next.includes(required.id)) next.push(required.id);
              }
              onChange(next);
            }}
          >
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

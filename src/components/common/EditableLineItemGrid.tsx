import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type EditableLineItemColumn = {
  id: string;
  header: ReactNode;
  widthClassName?: string;
  align?: "left" | "right" | "center";
};

/**
 * Spreadsheet-oriented line-item table chrome.
 *
 * Keyboard navigation, paste, and domain cell editors are adopted by callers in
 * later batches. This shell standardises sticky headers, density, and add-row CTA.
 */
export function EditableLineItemGrid({
  columns,
  children,
  onAddRow,
  addRowLabel = "Add line",
  empty,
  className,
  "aria-label": ariaLabel = "Line items",
}: {
  columns: readonly EditableLineItemColumn[];
  children: ReactNode;
  onAddRow?: () => void;
  addRowLabel?: string;
  empty?: ReactNode;
  className?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      data-slot="editable-line-item-grid"
      className={cn(
        "lb-editable-line-item-grid overflow-hidden rounded-xl border border-border/70 bg-card/80",
        className,
      )}
    >
      <Table aria-label={ariaLabel}>
        <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.id}
                className={cn(
                  column.widthClassName,
                  column.align === "right" && "text-right",
                  column.align === "center" && "text-center",
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>

      {empty ? <div className="border-t border-border/60 px-4 py-8">{empty}</div> : null}

      {onAddRow ? (
        <div className="flex items-center border-t border-border/60 px-3 py-2">
          <Button type="button" variant="ghost" size="sm" onClick={onAddRow} className="gap-1.5">
            <Plus className="size-4" aria-hidden />
            {addRowLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

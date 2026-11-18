"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type EditableLineItemColumn = {
  id: string;
  header: ReactNode;
  /** Fixed pixel width — avoids autofit collapse when cells fill. */
  widthPx?: number;
  widthClassName?: string;
  align?: "left" | "right" | "center";
  resizable?: boolean;
  minWidthPx?: number;
};

/**
 * Spreadsheet-oriented line-item table chrome.
 *
 * Fixed column widths (no autofit), optional resize handles, sticky header,
 * and add-row CTA. Domain cell editors remain caller-owned.
 */
export function EditableLineItemGrid({
  columns,
  children,
  onAddRow,
  addRowLabel = "Add line",
  empty,
  toolbar,
  footer,
  onColumnWidthChange,
  className,
  "aria-label": ariaLabel = "Line items",
}: {
  columns: readonly EditableLineItemColumn[];
  children: ReactNode;
  onAddRow?: (() => void) | undefined;
  addRowLabel?: string;
  empty?: ReactNode;
  toolbar?: ReactNode;
  /** Usually a vertical TotalsSummary anchored bottom-right. */
  footer?: ReactNode;
  onColumnWidthChange?: (columnId: string, widthPx: number) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const dragRef = useRef<{ id: string; startX: number; startW: number } | null>(null);

  const onResizePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLSpanElement>, column: EditableLineItemColumn) => {
      if (!onColumnWidthChange || column.resizable === false) return;
      event.preventDefault();
      event.stopPropagation();
      const startW = column.widthPx ?? column.minWidthPx ?? 120;
      dragRef.current = { id: column.id, startX: event.clientX, startW };
      const target = event.currentTarget;
      target.setPointerCapture(event.pointerId);

      const onMove = (moveEvent: PointerEvent) => {
        const drag = dragRef.current;
        if (!drag) return;
        const min = column.minWidthPx ?? 72;
        const next = Math.max(min, drag.startW + (moveEvent.clientX - drag.startX));
        onColumnWidthChange(drag.id, next);
      };
      const onUp = (upEvent: PointerEvent) => {
        dragRef.current = null;
        target.releasePointerCapture(upEvent.pointerId);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onColumnWidthChange],
  );

  const totalMinWidth = columns.reduce(
    (sum, column) => sum + (column.widthPx ?? column.minWidthPx ?? 100),
    0,
  );

  return (
    <div
      data-slot="editable-line-item-grid"
      className={cn(
        "lb-editable-line-item-grid overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {toolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          {toolbar}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <Table
          aria-label={ariaLabel}
          className="lb-spreadsheet-table border-collapse"
          style={{ tableLayout: "fixed", minWidth: totalMinWidth }}
        >
          <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => (
                <TableHead
                  key={column.id}
                  className={cn(
                    "relative select-none whitespace-nowrap",
                    column.widthClassName,
                    column.align === "right" && "text-right",
                    column.align === "center" && "text-center",
                  )}
                  style={
                    column.widthPx
                      ? { width: column.widthPx, minWidth: column.widthPx, maxWidth: column.widthPx }
                      : column.minWidthPx
                        ? { minWidth: column.minWidthPx }
                        : undefined
                  }
                >
                  {column.header}
                  {onColumnWidthChange && column.resizable !== false ? (
                    <span
                      role="separator"
                      aria-orientation="vertical"
                      aria-label={`Resize ${typeof column.header === "string" ? column.header : column.id} column`}
                      className="absolute inset-y-1 right-0 z-10 w-1.5 cursor-col-resize rounded-sm hover:bg-primary/30"
                      onPointerDown={(event) => onResizePointerDown(event, column)}
                    />
                  ) : null}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>{children}</TableBody>
        </Table>
      </div>

      {empty ? <div className="border-t border-border px-4 py-8">{empty}</div> : null}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border px-3 py-2">
        {onAddRow ? (
          <Button type="button" variant="ghost" size="sm" onClick={onAddRow} className="gap-1.5">
            <Plus className="size-4" aria-hidden />
            {addRowLabel}
          </Button>
        ) : (
          <span />
        )}
        {footer ? <div className="ml-auto min-w-[14rem]">{footer}</div> : null}
      </div>
    </div>
  );
}

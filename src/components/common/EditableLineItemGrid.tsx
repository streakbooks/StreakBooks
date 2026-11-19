"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { lineGridColumnStyle, lineGridTableMinWidth } from "@/lib/ui/line-grid-layout";
import { cn } from "@/lib/utils";

export type EditableLineItemColumn = {
  id: string;
  header: ReactNode;
  /** Preferred pixel width for fixed columns. */
  widthPx?: number;
  widthClassName?: string;
  align?: "left" | "right" | "center";
  resizable?: boolean;
  minWidthPx?: number;
  /**
   * Fluid columns absorb leftover container width so the grid fills 100%
   * without abandoned blank space (typically Description / Item).
   */
  fluid?: boolean;
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
  footerStart,
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
  /** Secondary controls beside Add line (Columns, Attachments, etc.). */
  footerStart?: ReactNode;
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

  const totalMinWidth = lineGridTableMinWidth(columns);

  return (
    <div
      data-slot="editable-line-item-grid"
      className={cn(
        "lb-editable-line-item-grid w-full min-w-0 overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
      {toolbar ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2">
          {toolbar}
        </div>
      ) : null}

      <div className="w-full min-w-0" data-slot="line-grid-scroll">
        <Table
          aria-label={ariaLabel}
          className="lb-spreadsheet-table border-collapse"
          style={{
            tableLayout: "fixed",
            width: "100%",
            minWidth: totalMinWidth,
          }}
        >
          <TableHeader className="sticky top-0 z-10 bg-muted/90 backdrop-blur-sm">
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => {
                const style = lineGridColumnStyle({
                  ...(column.widthPx !== undefined ? { widthPx: column.widthPx } : {}),
                  ...(column.minWidthPx !== undefined ? { minWidthPx: column.minWidthPx } : {}),
                  ...(column.fluid ? { fluid: true } : {}),
                });
                return (
                  <TableHead
                    key={column.id}
                    data-fluid={column.fluid ? "true" : undefined}
                    className={cn(
                      "relative select-none whitespace-nowrap",
                      column.widthClassName,
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                    )}
                    style={style}
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
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>{children}</TableBody>
        </Table>
      </div>

      {empty ? <div className="border-t border-border px-4 py-8">{empty}</div> : null}

      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {onAddRow ? (
            <Button type="button" variant="ghost" size="sm" onClick={onAddRow} className="gap-1.5">
              <Plus className="size-4" aria-hidden />
              {addRowLabel}
            </Button>
          ) : null}
          {footerStart}
        </div>
        {footer ? <div className="ml-auto min-w-[14rem]">{footer}</div> : null}
      </div>
    </div>
  );
}

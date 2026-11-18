"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type SplitButtonItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

/**
 * Primary action + overflow menu (e.g. Save | Save & Close | Save & Add Another).
 * Items must call real handlers — never invent success.
 */
export function SplitButton({
  label,
  onClick,
  items,
  disabled,
  busy,
  variant = "default",
  size = "default",
  className,
  menuLabel = "More save options",
}: {
  label: React.ReactNode;
  onClick: () => void;
  items: readonly SplitButtonItem[];
  disabled?: boolean;
  busy?: boolean;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  menuLabel?: string;
}) {
  const hasMenu = items.length > 0;

  return (
    <div data-slot="split-button" className={cn("inline-flex items-stretch", className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        onClick={onClick}
        className={cn(hasMenu && "rounded-r-none border-r border-primary-foreground/20")}
      >
        {label}
      </Button>
      {hasMenu ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant={variant}
              size={size}
              disabled={disabled || busy}
              aria-label={menuLabel}
              className="rounded-l-none px-2"
            >
              <ChevronDown className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[12rem]">
            {items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                disabled={item.disabled || busy}
                className={item.destructive ? "text-destructive focus:text-destructive" : undefined}
                onSelect={() => {
                  item.onSelect();
                }}
              >
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

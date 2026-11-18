import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-[var(--lb-control-height)] pointer-coarse:h-[var(--lb-control-height-coarse)] w-full min-w-0 rounded-lg border border-input bg-background px-3 py-1 text-base shadow-xs transition-[border-color,background-color,box-shadow] duration-[var(--lb-duration-fast)] motion-reduce:transition-none file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-destructive/20 disabled:cursor-not-allowed disabled:bg-muted/40 disabled:opacity-60 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };

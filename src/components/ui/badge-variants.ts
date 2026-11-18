import { cva } from "class-variance-authority";
export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-info-soft text-info-ink",
        secondary: "border-transparent bg-neutral-soft text-neutral-ink",
        destructive: "border-transparent bg-destructive-soft text-destructive-ink",
        outline: "border-border text-foreground bg-card",
        /* Soft semantic variants (AA contrast on their own surface, light and dark). */
        success: "border-transparent bg-success-soft text-success-ink",
        complete: "border-transparent bg-complete-soft text-complete-ink",
        warning: "border-transparent bg-warning-soft text-warning-ink",
        info: "border-transparent bg-info-soft text-info-ink",
        danger: "border-transparent bg-destructive-soft text-destructive-ink",
        neutral: "border-transparent bg-neutral-soft text-neutral-ink",
        ai: "border-transparent bg-ai-soft text-ai-ink",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

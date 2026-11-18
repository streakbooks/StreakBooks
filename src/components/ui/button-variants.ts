import { cva } from "class-variance-authority";
export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-[background-color,border-color,color,box-shadow] duration-[var(--lb-duration-fast)] ease-out motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed aria-busy:cursor-wait [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
        destructive: "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        /* Success/warning are semantic action variants — use only when the outcome matches. */
        success: "bg-success text-success-foreground shadow-sm hover:bg-success/90",
        warning: "bg-warning text-warning-foreground shadow-sm hover:bg-warning/90",
        outline:
          "border border-input bg-background shadow-xs hover:border-primary/30 hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-[var(--lb-control-height)] px-3.5 py-1.5 pointer-coarse:min-h-[var(--lb-control-height-coarse)]",
        sm: "h-[var(--lb-control-height)] rounded-md px-2.5 text-sm pointer-coarse:min-h-[var(--lb-control-height-coarse)]",
        lg: "h-10 rounded-md px-6 pointer-coarse:min-h-[var(--lb-control-height-coarse)]",
        icon: "h-[var(--lb-control-height)] w-[var(--lb-control-height)] pointer-coarse:min-h-[var(--lb-control-height-coarse)] pointer-coarse:min-w-[var(--lb-control-height-coarse)]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

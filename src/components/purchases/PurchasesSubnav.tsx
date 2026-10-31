import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

import { PURCHASES_SECTIONS as items } from "@/lib/document-sections";

export function PurchasesSubnav() {
  return (
    <nav
      aria-label="Purchases sections"
      className="mb-6 flex gap-1 overflow-x-auto border-b border-border print:hidden"
    >
      {items.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          activeOptions={{ exact: "exact" in item ? item.exact : false }}
          className={cn(
            "shrink-0 -mb-px rounded-t-md border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground pointer-coarse:py-3",
          )}
          activeProps={{
            className: "border-primary text-foreground",
          }}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

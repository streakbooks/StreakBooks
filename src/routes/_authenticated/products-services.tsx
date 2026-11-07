import { createFileRoute } from "@tanstack/react-router";

import { ProductsPage } from "@/screens/products-services";
import { parseProductSection } from "@/lib/products/catalogue-navigation";

export const Route = createFileRoute("/_authenticated/products-services")({
  validateSearch: (raw: Record<string, unknown>) => ({
    section: parseProductSection(raw["section"]),
  }),
  head: () => ({
    meta: [
      { title: "Products & Services — LinkBooks" },
      {
        name: "description",
        content: "Catalogue items with default accounts and tax for invoices and bills.",
      },
    ],
  }),
  component: ProductsPage,
});

import { createFileRoute } from "@tanstack/react-router";

import { ProductsPage } from "@/screens/products-services";

export const Route = createFileRoute("/_authenticated/products-services")({
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

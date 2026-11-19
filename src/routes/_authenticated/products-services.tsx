import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ProductsPage } from "@/screens/products-services";
import { parseCatalogueSearch } from "@/lib/products/catalogue-navigation";

export const Route = createFileRoute("/_authenticated/products-services")({
  validateSearch: (search: Record<string, unknown>) =>
    ({...parseCatalogueSearch(search), ...z
      .object({
        create: z.union([z.boolean(), z.literal("true"), z.literal("1")]).optional(),
      })
      .parse({
        create:
          search["create"] === true ||
          search["create"] === "true" ||
          search["create"] === "1" ||
          search["create"] === 1
            ? true
            : undefined,
      })}),
  head: () => ({
    meta: [
      { title: "Products & Services — LinkBooks" },
      {
        name: "description",
        content: "Catalogue items with default accounts and tax for invoices and bills.",
      },
    ],
  }),
  component: ProductsPageRoute,
});

function ProductsPageRoute() {
  const { create } = Route.useSearch();
  return <ProductsPage forceCreate={Boolean(create)} />;
}

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { ProductsPage } from "@/screens/products-services";

export const Route = createFileRoute("/_authenticated/products-services")({
  validateSearch: (search: Record<string, unknown>) =>
    z
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
  component: ProductsPageRoute,
});

function ProductsPageRoute() {
  const { create } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ProductsPage
      forceCreate={Boolean(create)}
      onForceCreateConsumed={() => {
        void navigate({ search: { create: undefined }, replace: true });
      }}
    />
  );
}

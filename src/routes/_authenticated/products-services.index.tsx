import { createFileRoute } from "@tanstack/react-router";

import { ProductsPage } from "@/screens/products-services";
import { parseCatalogueSearch, type CatalogueSearch } from "@/lib/products/catalogue-navigation";
import { parseCreateSearchFlag } from "@/lib/navigation/create-search";

export const Route = createFileRoute("/_authenticated/products-services/")({
  validateSearch: (
    search: Record<string, unknown>,
  ): CatalogueSearch & { create?: boolean | undefined } => ({
    ...parseCatalogueSearch(search),
    ...(parseCreateSearchFlag(search) ? { create: true } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Products & Services — StreakBooks" },
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
      onCreateClosed={() => {
        void navigate({
          search: (prev) => {
            const { create: _create, ...rest } = prev;
            return rest;
          },
          replace: true,
        });
      }}
    />
  );
}

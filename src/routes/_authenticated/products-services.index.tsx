import { createFileRoute } from "@tanstack/react-router";

import { ProductsPage } from "@/screens/products-services";
import { parseCreateSearchFlag } from "@/lib/navigation/create-search";

export const Route = createFileRoute("/_authenticated/products-services/")({
  validateSearch: (search: Record<string, unknown>): { create?: boolean } =>
    parseCreateSearchFlag(search) ? { create: true } : {},
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

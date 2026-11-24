import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ProductsPage } from "@/screens/products-services";

export const Route = createFileRoute("/_authenticated/products-services/new")({
  head: () => ({
    meta: [{ title: "New product / service — StreakBooks" }],
  }),
  component: ProductsNewRoute,
});

function ProductsNewRoute() {
  const navigate = useNavigate();
  return (
    <ProductsPage
      forceCreate
      onCreateClosed={() => {
        void navigate({ to: "/products-services" });
      }}
    />
  );
}

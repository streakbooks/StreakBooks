import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PurchaseOrderDetailScreen } from "../../src/screens/purchases/orders.detail";
import { Toaster } from "../../src/components/ui/sonner";
import "../../src/styles.css";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <main className="p-4">
      <PurchaseOrderDetailScreen companyId="company" orderId="order" />
    </main>
    <Toaster />
  </QueryClientProvider>,
);

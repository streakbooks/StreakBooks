import { createFileRoute } from "@tanstack/react-router";
import { useActiveCompany } from "@/hooks/use-active-company";
import { EmptyState } from "@/components/common/states";
import { PurchaseOrderDetailScreen } from "@/screens/purchases/orders.detail";

export const Route = createFileRoute("/_authenticated/purchases/orders/$orderId")({
  component: PurchaseOrderPage,
});
function PurchaseOrderPage() {
  const { orderId } = Route.useParams();
  const { company } = useActiveCompany();
  return company ? (
    <PurchaseOrderDetailScreen
      key={`${company.id}:${orderId}`}
      companyId={company.id}
      orderId={orderId}
    />
  ) : (
    <EmptyState title="No organisation" description="Select a company." />
  );
}

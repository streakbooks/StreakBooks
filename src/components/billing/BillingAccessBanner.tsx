import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { getBillingOverview } from "@/lib/billing/billing.functions";

export function BillingAccessBanner({ companyId }: { companyId: string }) {
  const fetchOverview = useServerFn(getBillingOverview);
  const overview = useQuery({
    queryKey: ["billing-overview", companyId],
    queryFn: () => fetchOverview({ data: { companyId } }),
  });
  if (overview.isError) {
    return (
      <div className="border-b px-4 py-2 print:hidden md:px-6">
        <QueryErrorState queries={[overview]} title="Could not verify billing access" />
      </div>
    );
  }
  const data = overview.data;
  if (!data) return null;

  if (data.subscription?.status === "past_due") {
    return (
      <div role="status" className="border-b bg-warning/15 px-4 py-2 text-sm print:hidden md:px-6">
        A subscription payment failed. You keep access during the grace period — update the card to
        avoid interruption.{" "}
        <Link to="/settings" search={{ section: "subscription" }} className="font-medium underline">
          Fix billing
        </Link>
      </div>
    );
  }

  if (data.access !== "read_only") return null;
  return (
    <div
      role="status"
      className="border-b bg-destructive/10 px-4 py-2 text-sm print:hidden md:px-6"
    >
      This organisation is read-only until a plan is chosen. Reports stay available.{" "}
      <Link to="/settings" search={{ section: "subscription" }} className="font-medium underline">
        Open subscription
      </Link>
    </div>
  );
}

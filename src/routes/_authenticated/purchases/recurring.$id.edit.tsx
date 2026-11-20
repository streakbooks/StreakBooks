import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { getRecurringBill } from "@/lib/purchases/purchases.functions";
import { EmptyState, LoadingState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import { NewBill, type RecurringBillSeed } from "@/screens/purchases/bills.new";

export const Route = createFileRoute("/_authenticated/purchases/recurring/$id/edit")({
  head: () => ({ meta: [{ title: "Edit recurring bill — LinkBooks" }] }),
  component: EditRecurringBillRoute,
});

function EditRecurringBillRoute() {
  const { id } = Route.useParams();
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const fetchTemplate = useServerFn(getRecurringBill);

  const templateQ = useQuery({
    queryKey: ["recurring-bill-template", companyId, id],
    enabled: Boolean(companyId && id),
    queryFn: () => fetchTemplate({ data: { companyId: companyId!, recurringId: id } }),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;
  if (templateQ.isPending) return <LoadingState />;
  if (templateQ.isError) {
    return (
      <div className="space-y-3">
        <QueryErrorState queries={[templateQ]} title="Could not load recurring bill" />
        <Button size="sm" variant="outline" asChild>
          <Link to="/purchases/recurring">Back to recurring bills</Link>
        </Button>
      </div>
    );
  }
  if (!templateQ.isSuccess) return <LoadingState />;
  if (!templateQ.data) {
    return (
      <EmptyState
        title="Template not found"
        description="This recurring bill may have been archived."
        action={
          <Button size="sm" asChild>
            <Link to="/purchases/recurring">Back to recurring bills</Link>
          </Button>
        }
      />
    );
  }

  return <NewBill key={id} mode="template" seed={templateQ.data as RecurringBillSeed} />;
}

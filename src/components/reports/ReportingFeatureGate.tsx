import type { ReactNode } from "react";
import { useReportingAccess } from "@/hooks/use-reporting-access";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
export function ReportingFeatureGate({
  companyId,
  children,
}: {
  companyId: string;
  children: ReactNode;
}) {
  const access = useReportingAccess(companyId);
  if (access.isPending) return <LoadingState />;
  if (access.isError)
    return <QueryErrorState queries={[access]} title="Could not verify reporting access" />;
  if (!access.isSuccess || !access.data) return <LoadingState />;
  if (!access.data.allowed)
    return (
      <section role="status" className="space-y-2 rounded border p-5">
        <h2 className="font-semibold">Reporting workspace is currently unavailable</h2>
        <p className="text-sm">{access.data.reason}</p>
        <p className="text-xs text-muted-foreground">
          Access source: {access.data.source} ({access.data.scope}). Saved reports and approved
          history are retained. Standard financial reports remain in the Standard reports tab.
        </p>
        <Button asChild variant="outline">
          <Link to="/reports" search={{ tab: "standard" }}>
            Open standard reports
          </Link>
        </Button>
      </section>
    );
  return (
    <>
      <p className="text-xs text-muted-foreground">
        Reporting access: enabled · Source: {access.data.source}
      </p>
      {children}
    </>
  );
}

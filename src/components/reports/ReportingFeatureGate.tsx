import type { ReactNode } from "react";
import { useReportingAccess } from "@/hooks/use-reporting-access";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { LoadingState, ErrorState } from "@/components/common/states";
import { friendlyAuthError } from "@/lib/auth-helpers";
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
    return (
      <ErrorState
        title="Could not verify reporting access"
        description={friendlyAuthError(access.error)}
        onRetry={() => void access.refetch()}
      />
    );
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

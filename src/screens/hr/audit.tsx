import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HrSubnav } from "@/components/hr/HrSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { TableCard } from "@/components/common/table-card";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listHrAuditEvents } from "@/lib/hr/hr.functions";
import type { HrAuditEvent } from "@/lib/hr/types";

export function HrAuditPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.audit.view");
  const fetchAudit = useServerFn(listHrAuditEvents);

  const auditQ = useQuery({
    queryKey: ["hr-audit", company?.id],
    queryFn: async (): Promise<{ items: HrAuditEvent[] }> => {
      const result = await fetchAudit({ data: { companyId: company!.id, limit: 100 } });
      return result as { items: HrAuditEvent[] };
    },
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="HR Audit Trail" description="Sensitive change history">
        <EmptyState title="No audit access" description="Ask an administrator for hr.audit.view." />
      </ListWorkspace>
    );
  }

  return (
    <ListWorkspace
      title="HR Audit Trail"
      description="Actor, timestamp and summary for sensitive HR changes."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Audit" }]}
    >
      <HrSubnav current="audit" />

      {auditQ.isPending ? (
        <LoadingState />
      ) : auditQ.isError ? (
        <ErrorState
          title="Could not load audit trail"
          description={friendlyAuthError(auditQ.error)}
          onRetry={() => auditQ.refetch()}
        />
      ) : !auditQ.data?.items.length ? (
        <EmptyState
          title="No audit events yet"
          description="Saving settings, organisation units or employee profiles will create audit rows."
        />
      ) : (
        <TableCard>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {auditQ.data.items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {new Date(row.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell>{row.action}</TableCell>
                  <TableCell>
                    {row.entityType}
                    {row.entityId ? ` · ${row.entityId.slice(0, 8)}` : ""}
                  </TableCell>
                  <TableCell>{row.summary}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableCard>
      )}
    </ListWorkspace>
  );
}

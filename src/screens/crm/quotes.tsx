import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CrmStatusBadge } from "@/components/crm/CrmStatusBadge";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCan } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  createCrmOpportunityQuote,
  getCrmSettings,
  listCrmOpportunities,
} from "@/lib/crm/crm.functions";
import { formatCrmMinor } from "@/lib/crm/format";
import type { Permission } from "@/lib/permissions";
import { toast } from "sonner";

export function CrmQuotesPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const canBridge =
    can("crm.opportunities.manage" as Permission) && can("sales.draft" as Permission);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchOpps = useServerFn(listCrmOpportunities);
  const createQuote = useServerFn(createCrmOpportunityQuote);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const opps = useQuery({
    queryKey: ["crm-opportunities", company?.id, "quote-bridge"],
    queryFn: () => fetchOpps({ data: { companyId: company!.id, limit: 200 } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: async (opportunityId: string) => {
      if (!company) throw new Error("No organisation");
      return createQuote({ data: { companyId: company.id, opportunityId } });
    },
    onSuccess: async (result) => {
      toast.success(result.created ? "Sales quote draft created" : "Opening linked quote");
      await queryClient.invalidateQueries({ queryKey: ["crm-opportunities", company?.id] });
      await navigate({ to: "/sales/quotes/$quoteId", params: { quoteId: result.quoteId } });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace title="Quotes & Proposals" description="Bridge CRM deals into Sales quotes.">
        <EmptyState title="No CRM access" description="Ask an administrator for crm.view." />
      </ListWorkspace>
    );
  }

  const rows = opps.data ?? [];

  return (
    <ListWorkspace
      title="Quotes & Proposals"
      description="Create Sales quote drafts from opportunities. Invoicing and GL posting stay in Sales."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "Quotes & Proposals" }]}
      actions={
        <Button asChild variant="secondary">
          <Link to="/sales/quotes">Open Sales quotes</Link>
        </Button>
      }
      subnav={<CrmSubnav current="quotes" />}
    >
      {settings.isLoading ? <LoadingState /> : null}
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load CRM settings" />
      ) : null}
      {settings.data && !settings.data.enabled ? (
        <EmptyState title="CRM is disabled" description="Enable CRM before bridging quotes." />
      ) : null}

      {settings.data?.enabled ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>Accounting boundary</AlertTitle>
            <AlertDescription>
              This action drafts a Sales quote only. Converting a quote to an invoice uses the
              existing Sales workflow so journals are never posted twice from CRM.
            </AlertDescription>
          </Alert>

          {opps.isLoading ? <LoadingState /> : null}
          {opps.isError ? (
            <QueryErrorState queries={[opps]} title="Could not load opportunities" />
          ) : null}
          {opps.isSuccess && rows.length === 0 ? (
            <EmptyState
              title="No opportunities yet"
              description="Create or convert a lead into an opportunity first."
              action={
                <Button asChild size="sm">
                  <Link to="/crm/$section" params={{ section: "opportunities" }}>
                    Open opportunities
                  </Link>
                </Button>
              }
            />
          ) : null}
          {rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Opportunity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Quote</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((opp) => (
                    <TableRow key={opp.id}>
                      <TableCell>
                        <div className="font-medium">{opp.opportunityNumber}</div>
                        <div className="text-sm text-muted-foreground">{opp.name}</div>
                      </TableCell>
                      <TableCell>
                        <CrmStatusBadge status={opp.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatCrmMinor(opp.amountMinor, opp.currencyCode)}
                      </TableCell>
                      <TableCell>
                        {opp.quoteId ? (
                          <Link
                            to="/sales/quotes/$quoteId"
                            params={{ quoteId: opp.quoteId }}
                            className="text-primary underline-offset-4 hover:underline"
                          >
                            Open quote
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">Not linked</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {canBridge ? (
                          <Button
                            type="button"
                            size="sm"
                            variant={opp.quoteId ? "secondary" : "default"}
                            disabled={mutation.isPending || !opp.contactId || opp.amountMinor <= 0}
                            title={
                              !opp.contactId
                                ? "Link a Contact first"
                                : opp.amountMinor <= 0
                                  ? "Set a positive amount first"
                                  : undefined
                            }
                            onClick={() => mutation.mutate(opp.id)}
                          >
                            {opp.quoteId ? "Open / reuse" : "Create quote"}
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Needs crm.opportunities.manage and sales.draft
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </div>
      ) : null}
    </ListWorkspace>
  );
}

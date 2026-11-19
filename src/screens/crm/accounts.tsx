import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { getCrmSettings, listCrmAccountOverlay } from "@/lib/crm/crm.functions";
import { formatCrmMinor } from "@/lib/crm/format";
import type { Permission } from "@/lib/permissions";

export function CrmAccountsPage({ current = "accounts" }: { current?: "accounts" | "contacts" }) {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchAccounts = useServerFn(listCrmAccountOverlay);
  const [q, setQ] = useState("");
  const [crmOnly, setCrmOnly] = useState(false);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const accounts = useQuery({
    queryKey: ["crm-accounts-overlay", company?.id, q, crmOnly],
    queryFn: () =>
      fetchAccounts({
        data: {
          companyId: company!.id,
          q,
          crmOnly,
        },
      }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace
        title={current === "contacts" ? "CRM Contacts" : "Accounts"}
        description="Customer accounts with CRM pipeline context."
      >
        <EmptyState title="No CRM access" description="Ask an administrator for crm.view." />
      </ListWorkspace>
    );
  }

  const isPeopleView = current === "contacts";
  const pageTitle = isPeopleView ? "CRM Contacts" : "Accounts";

  return (
    <ListWorkspace
      title={pageTitle}
      description={
        isPeopleView
          ? "Customer contacts with linked pipeline activity. The full people directory remains in Contacts."
          : "Contacts remain the customer master. This view attaches open pipeline facts without duplicating records."
      }
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: pageTitle }]}
      actions={
        <Button asChild variant="secondary">
          <Link to="/contacts">Open Contacts</Link>
        </Button>
      }
      subnav={<CrmSubnav current={current} />}
    >
      {settings.isLoading ? <LoadingState /> : null}
      {settings.data && !settings.data.enabled ? (
        <EmptyState
          title="CRM is disabled"
          description="Enable CRM in settings before reviewing account pipeline context."
          action={
            can("crm.admin" as Permission) ? (
              <Button asChild>
                <Link to="/crm/$section" params={{ section: "settings" }}>
                  CRM Settings
                </Link>
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {settings.data?.enabled ? (
        <div className="space-y-4">
          <Alert>
            <AlertTitle>No second customer master</AlertTitle>
            <AlertDescription>
              CRM rows reuse the existing Contacts master (customers). CRM only shows linked leads
              and open opportunity totals by their original currencies — accounting postings stay in
              Sales and Banking.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-2">
              <Label htmlFor="crm-account-search">
                {isPeopleView ? "Search customer contacts" : "Search accounts"}
              </Label>
              <Input
                id="crm-account-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, email or phone"
                className="w-64"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={crmOnly}
                onChange={(e) => setCrmOnly(e.target.checked)}
              />
              Only accounts with CRM links
            </label>
          </div>

          {accounts.isLoading ? <LoadingState /> : null}
          {accounts.isError ? (
            <ErrorState
              title="Could not load CRM accounts"
              description={friendlyAuthError(accounts.error)}
              onRetry={() => accounts.refetch()}
            />
          ) : null}
          {accounts.isSuccess && accounts.data.length === 0 ? (
            <EmptyState
              title={isPeopleView ? "No matching CRM contacts" : "No matching accounts"}
              description="Create or activate a customer in Contacts, then convert a lead or open an opportunity."
              action={
                <Button asChild>
                  <Link to="/contacts">Go to Contacts</Link>
                </Button>
              }
            />
          ) : null}
          {accounts.data && accounts.data.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Open deals</TableHead>
                    <TableHead className="text-right">Pipeline by currency</TableHead>
                    <TableHead className="text-right">Linked leads</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.data.map((row) => (
                    <TableRow key={row.contactId}>
                      <TableCell>
                        <Link
                          to="/contacts/$contactId"
                          params={{ contactId: row.contactId }}
                          className="font-medium text-primary underline-offset-4 hover:underline"
                        >
                          {row.name}
                        </Link>
                      </TableCell>
                      <TableCell>{row.email ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.openOpportunityCount}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.pipelineByCurrency.length > 0 ? (
                          <div className="flex flex-col items-end gap-1">
                            {row.pipelineByCurrency.map((total) => (
                              <span key={total.currencyCode}>
                                {formatCrmMinor(total.amountMinor, total.currencyCode)}
                              </span>
                            ))}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.linkedLeadCount}
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

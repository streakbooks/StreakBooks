import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CrmSubnav } from "@/components/crm/CrmSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Badge } from "@/components/ui/badge";
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

import { getCrmSettings, listCrmContactPeople } from "@/lib/crm/crm.functions";
import type { Permission } from "@/lib/permissions";

/**
 * A person-level read-only CRM view of the existing Contacts master.
 * All reads remain company-scoped and the server checks CRM authorization.
 */
export function CrmContactsPage() {
  const { company, isPending } = useActiveCompany();
  const { can } = useCan();
  const canView = can("crm.view" as Permission) || can("crm.admin" as Permission);
  const canEditMaster = can("contacts.manage" as Permission);
  const [search, setSearch] = useState("");
  const fetchSettings = useServerFn(getCrmSettings);
  const fetchPeople = useServerFn(listCrmContactPeople);

  const settings = useQuery({
    queryKey: ["crm-settings", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });
  const people = useQuery({
    queryKey: ["crm-contact-people", company?.id],
    queryFn: () => fetchPeople({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView && settings.data?.enabled === true,
    retry: false,
  });

  if (isPending) return <LoadingState />;
  if (!company)
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  if (!canView)
    return (
      <ListWorkspace title="CRM Contacts" description="People linked to your customer accounts.">
        <EmptyState
          title="No CRM access"
          description="Ask an administrator for crm.view permission."
        />
      </ListWorkspace>
    );

  const term = search.trim().toLocaleLowerCase();
  const rows = (people.data ?? []).filter(
    (person) =>
      !term ||
      [
        person.displayName,
        person.accountName,
        person.jobTitle ?? "",
        person.email ?? "",
        person.phone ?? "",
      ].some((value) => value.toLocaleLowerCase().includes(term)),
  );

  return (
    <ListWorkspace
      title="CRM Contacts"
      description="Find people in customer organisations. Records remain owned by the shared Contacts module."
      breadcrumbs={[{ label: "CRM", to: "/crm" }, { label: "CRM Contacts" }]}
      actions={
        canEditMaster ? (
          <Button asChild variant="secondary">
            <Link to="/contacts">Manage Contacts</Link>
          </Button>
        ) : undefined
      }
      subnav={<CrmSubnav current="contacts" />}
    >
      {settings.isLoading ? <LoadingState /> : null}
      {settings.isError ? (
        <QueryErrorState queries={[settings]} title="Could not load CRM settings" />
      ) : null}
      {settings.isSuccess && settings.data && !settings.data.enabled ? (
        <EmptyState
          title="CRM is disabled"
          description="An administrator must enable CRM in settings."
        />
      ) : null}
      {settings.isSuccess && settings.data?.enabled ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="crm-contact-person-search">Find a person</Label>
            <Input
              id="crm-contact-person-search"
              type="search"
              placeholder="Name, account, title, email or phone"
              className="w-full sm:max-w-md"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <p role="status" className="text-xs text-muted-foreground">
              Showing {rows.length} of {people.data?.length ?? 0} loaded people. This view currently
              loads up to 500 people belonging to the first 200 customer accounts. Enterprise
              pagination is still pending.
            </p>
          </div>
          {people.isLoading ? <LoadingState /> : null}
          {people.isError ? (
            <QueryErrorState queries={[people]} title="Could not load CRM people" />
          ) : null}
          {people.isSuccess && rows.length === 0 ? (
            <EmptyState
              title={term ? "No matching people in loaded records" : "No customer people found"}
              description={
                term
                  ? "Try a different search, or open Contacts for the complete customer master."
                  : "Add a person to a customer account in Contacts, then refresh this view."
              }
              action={
                <Button asChild size="sm">
                  <Link to="/contacts">{term ? "Open Contacts" : "Manage Contacts"}</Link>
                </Button>
              }
            />
          ) : null}
          {people.isSuccess && rows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Person</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Job title</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((person) => (
                    <TableRow key={person.id}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to="/contacts/$contactId"
                            params={{ contactId: person.contactId }}
                            className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {person.displayName}
                          </Link>
                          {person.isPrimary ? <Badge variant="success">Primary</Badge> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link
                          to="/contacts/$contactId"
                          params={{ contactId: person.contactId }}
                          className="underline-offset-4 hover:underline"
                        >
                          {person.accountName}
                        </Link>
                      </TableCell>
                      <TableCell>{person.jobTitle ?? "—"}</TableCell>
                      <TableCell>
                        {person.email ? (
                          <a
                            className="text-primary underline-offset-4 hover:underline"
                            href={`mailto:${person.email}`}
                          >
                            {person.email}
                          </a>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {person.phone ? (
                          <a
                            className="text-primary underline-offset-4 hover:underline"
                            href={`tel:${person.phone}`}
                          >
                            {person.phone}
                          </a>
                        ) : (
                          "—"
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

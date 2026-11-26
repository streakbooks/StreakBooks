import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import { listFirmEngagements } from "@/lib/firm/firm-workflows.functions";
import {
  linkFirmEngagementInvoice,
  listEngagementInvoiceLinks,
  listPracticeBillingInvoices,
  unlinkFirmEngagementInvoice,
} from "@/lib/firm/firm-billing.functions";
import { getFirmPracticePulse } from "@/lib/firm/firm-analytics.functions";
import { FirmRecurringBillingPanel } from "@/components/firm/FirmRecurringBillingPanel";
import { LookupSelect } from "@/components/lookup";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState, EmptyState } from "@/components/common/states";

export function FirmBillingPanel({
  firmId,
  clients,
  canManage,
  activeCompanyId,
  activeCompanyName,
}: {
  firmId: string;
  clients: FirmClientRow[];
  canManage: boolean;
  activeCompanyId: string;
  activeCompanyName: string;
}) {
  const accessible = clients.filter((c) => Boolean(c.companies));
  const [selected, setSelected] = useState("");
  const companyId = accessible.some((c) => c.company_id === selected)
    ? selected
    : (accessible[0]?.company_id ?? "");
  const [engagementId, setEngagementId] = useState("");
  const [invoiceId, setInvoiceId] = useState("");
  const loadEngagements = useServerFn(listFirmEngagements);
  const loadInvoices = useServerFn(listPracticeBillingInvoices);
  const loadLinks = useServerFn(listEngagementInvoiceLinks);
  const linkInvoice = useServerFn(linkFirmEngagementInvoice);
  const unlinkInvoice = useServerFn(unlinkFirmEngagementInvoice);
  const qc = useQueryClient();
  const validBillingCompany = Boolean(
    companyId && activeCompanyId && companyId !== activeCompanyId,
  );
  const engagementsQ = useQuery({
    queryKey: ["firm-engagements", firmId, companyId],
    enabled: Boolean(companyId),
    queryFn: () => loadEngagements({ data: { firmId, companyId } }),
  });
  const engagements = engagementsQ.data ?? [];
  const currentEngagementId = engagements.some((e) => e.id === engagementId)
    ? engagementId
    : (engagements[0]?.id ?? "");
  const invoicesQ = useQuery({
    queryKey: ["firm-billing-invoices", firmId, companyId, activeCompanyId],
    enabled: validBillingCompany,
    queryFn: () =>
      loadInvoices({
        data: {
          firmId,
          companyId,
          billingCompanyId: activeCompanyId,
        },
      }),
  });
  const invoices = invoicesQ.data ?? [];
  const currentInvoiceId = invoices.some((i) => i.id === invoiceId)
    ? invoiceId
    : (invoices[0]?.id ?? "");
  const linksQ = useQuery({
    queryKey: ["firm-engagement-invoice-links", firmId, companyId, currentEngagementId],
    enabled: Boolean(companyId && currentEngagementId),
    queryFn: () => loadLinks({ data: { firmId, companyId, engagementId: currentEngagementId } }),
  });
  const linkM = useMutation({
    mutationFn: () =>
      linkInvoice({
        data: {
          firmId,
          companyId,
          engagementId: currentEngagementId,
          invoiceId: currentInvoiceId,
          billingCompanyId: activeCompanyId,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["firm-engagement-invoice-links", firmId, companyId, currentEngagementId],
      });
      toast.success("Existing practice invoice linked to engagement");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const unlinkM = useMutation({
    mutationFn: (link: { invoice_id: string; billing_company_id: string }) =>
      unlinkInvoice({
        data: {
          firmId,
          companyId,
          engagementId: currentEngagementId,
          invoiceId: link.invoice_id,
          billingCompanyId: link.billing_company_id,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({
        queryKey: ["firm-engagement-invoice-links", firmId, companyId, currentEngagementId],
      });
      toast.success("Invoice reference unlinked; invoice unchanged");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  return (
    <section className="space-y-4" aria-label="Practice engagement billing">
      <div>
        <h2 className="text-lg font-semibold">Engagement invoice references</h2>
        <p className="text-sm text-muted-foreground">
          Reuse StreakBooks' existing Sales invoices in your practice billing company. Linking a
          reference does not create, post, send, void or modify an invoice. Never invoice practice
          fees from a client's accounting organisation.
        </p>
      </div>
      {!companyId ? (
        <EmptyState
          title="No clients"
          description="Link a client before tracking engagement billing."
        />
      ) : (
        <>
          <div className="max-w-md space-y-1">
            <Label>Client organisation</Label>
            <LookupSelect
              ariaLabel="Client for engagement billing"
              allowClear={false}
              value={companyId}
              onChange={(v) => {
                setSelected(v);
                setEngagementId("");
                setInvoiceId("");
              }}
              searchPlaceholder="Search clients"
              options={accessible.map((c) => ({
                id: c.company_id,
                name: getFirmClientName(c),
                label: getFirmClientName(c),
              }))}
            />
          </div>
          {!validBillingCompany ? (
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
              Select your practice's billing organisation in the main company switcher before
              linking an invoice. The active organisation cannot be the client.
            </div>
          ) : (
            <div className="rounded-lg border bg-card p-4 text-sm">
              Active billing organisation: <strong>{activeCompanyName}</strong>.{" "}
              <Link to="/sales/invoices/new" className="underline">
                Create an invoice using the existing Sales workflow
              </Link>
              .
            </div>
          )}
          {engagementsQ.isPending ? (
            <LoadingState rows={2} />
          ) : engagementsQ.isError ? (
            <QueryErrorState queries={[engagementsQ]} title="Could not load engagements" />
          ) : !engagementsQ.isSuccess ? (
            <LoadingState rows={2} />
          ) : !engagements.length ? (
            <EmptyState
              title="No engagements"
              description="Create an engagement before linking practice invoices."
            />
          ) : (
            <>
              <div className="max-w-md space-y-1">
                <Label>Engagement</Label>
                <RecordLookupSelect
                  required
                  value={currentEngagementId}
                  onValueChange={setEngagementId}
                >
                  <SelectTrigger aria-label="Choose engagement">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {engagements.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </RecordLookupSelect>
              </div>
              {linksQ.isPending ? (
                <LoadingState rows={2} />
              ) : linksQ.isError ? (
                <QueryErrorState queries={[linksQ]} title="Could not load linked invoices" />
              ) : !linksQ.isSuccess ? (
                <LoadingState rows={2} />
              ) : (linksQ.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No linked practice invoices for this engagement.
                </p>
              ) : (
                (linksQ.data ?? []).map((link) => (
                  <div
                    key={link.invoice_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">
                        {link.sales_invoices?.invoice_number ?? "Invoice reference"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {link.sales_invoices?.status ?? "Status unavailable"} ·{" "}
                        {link.sales_invoices?.currency_code ?? ""}{" "}
                        {link.sales_invoices?.total_minor === undefined
                          ? ""
                          : "Amount stored in minor units: " + link.sales_invoices.total_minor}
                      </p>
                    </div>
                    {canManage ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={unlinkM.isPending}
                        onClick={() => {
                          if (
                            window.confirm("Remove this reference? The invoice is not changed.")
                          ) {
                            unlinkM.mutate(link);
                          }
                        }}
                      >
                        Unlink
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
              {canManage && validBillingCompany ? (
                invoicesQ.isPending ? (
                  <LoadingState rows={2} />
                ) : invoicesQ.isError ? (
                  <QueryErrorState queries={[invoicesQ]} title="Could not list practice invoices" />
                ) : !invoicesQ.isSuccess ? (
                  <LoadingState rows={2} />
                ) : !invoices.length ? (
                  <p className="text-sm text-muted-foreground">
                    No recent invoices in the active billing company.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
                    <div className="min-w-56 flex-1 space-y-1">
                      <Label>Existing invoice in {activeCompanyName}</Label>
                      <RecordLookupSelect
                        required
                        value={currentInvoiceId}
                        onValueChange={setInvoiceId}
                      >
                        <SelectTrigger aria-label="Practice invoice">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {invoices.map((i) => (
                            <SelectItem key={i.id} value={i.id}>
                              {i.invoice_number} · {i.status} · {i.invoice_date}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </RecordLookupSelect>
                    </div>
                    <Button
                      disabled={!currentInvoiceId || !currentEngagementId || linkM.isPending}
                      onClick={() => linkM.mutate()}
                    >
                      Link invoice
                    </Button>
                  </div>
                )
              ) : null}
            </>
          )}
        </>
      )}
      <FirmRecurringBillingPanel
        firmId={firmId}
        clients={clients}
        canManage={canManage}
        billingCompanyId={activeCompanyId}
      />
    </section>
  );
}

export function FirmAnalyticsPanel({ firmId }: { firmId: string }) {
  const get = useServerFn(getFirmPracticePulse);
  const pulse = useQuery({
    queryKey: ["firm-practice-pulse", firmId],
    enabled: Boolean(firmId),
    queryFn: () => get({ data: { firmId } }),
  });
  if (pulse.isPending) return <LoadingState />;
  if (pulse.isError)
    return <QueryErrorState queries={[pulse]} title="Could not load practice insights" />;
  if (!pulse.isSuccess || !pulse.data) return <LoadingState />;
  const item = pulse.data;
  const metrics = [
    { label: "Clients I can access", value: item.accessibleClients },
    { label: "Open work tasks", value: item.openWork },
    { label: "Overdue work tasks", value: item.overdueWork },
    { label: "Tasks assigned to me", value: item.myWork },
    { label: "Onboarding steps pending", value: item.incompleteOnboarding },
    { label: "Active engagements", value: item.activeEngagements },
    { label: "Open requests visible to me", value: item.openDocumentRequestsVisibleToMe },
    { label: "Practice invoices linked and visible", value: item.invoiceReferencesVisibleToMe },
  ];
  return (
    <section className="space-y-4" aria-label="Practice insights">
      <div>
        <h2 className="text-lg font-semibold">Practice insights</h2>
        <p className="text-sm text-muted-foreground">
          Accurate operational counts from authorised StreakBooks records, as of {item.asOfUtc} UTC.
          Access-restricted records are excluded; no unverified financial totals are combined.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">{metric.label}</p>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{metric.value}</p>
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={() => pulse.refetch()}>
        Refresh insights
      </Button>
      <p className="text-xs text-muted-foreground">
        Current portfolio view supports up to 200 linked clients. For very large practices, use the
        client-level accounting workspace for complete operational detail.
      </p>
    </section>
  );
}

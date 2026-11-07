import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { getFirmClientName, type FirmClientRow } from "@/lib/firm/client-portfolio";
import { listFirmEngagements } from "@/lib/firm/firm-workflows.functions";
import {
  generateFirmEngagementDraft,
  linkFirmEngagementRecurring,
  listFirmEngagementRecurringLinks,
  listFirmPracticeRecurringTemplates,
  unlinkFirmEngagementRecurring,
} from "@/lib/firm/firm-recurring-billing.functions";
import { compatiblePracticeRecurring, practiceDraftDue } from "@/lib/firm/practice-recurring-rules";
import { LookupSelect } from "@/components/lookup";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";

export function FirmRecurringBillingPanel({
  firmId,
  clients,
  canManage,
  billingCompanyId,
}: {
  firmId: string;
  clients: FirmClientRow[];
  canManage: boolean;
  billingCompanyId: string;
}) {
  const available = clients.filter((client) => Boolean(client.companies));
  const [selected, setSelected] = useState("");
  const companyId = available.some((c) => c.company_id === selected)
    ? selected
    : (available[0]?.company_id ?? "");
  const [engagementId, setEngagementId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const validBillingCompany = Boolean(
    companyId && billingCompanyId && companyId !== billingCompanyId,
  );
  const getEngagements = useServerFn(listFirmEngagements);
  const getTemplates = useServerFn(listFirmPracticeRecurringTemplates);
  const getLinks = useServerFn(listFirmEngagementRecurringLinks);
  const link = useServerFn(linkFirmEngagementRecurring);
  const unlink = useServerFn(unlinkFirmEngagementRecurring);
  const generate = useServerFn(generateFirmEngagementDraft);
  const qc = useQueryClient();
  const engagementsQ = useQuery({
    queryKey: ["firm-engagements", firmId, companyId],
    enabled: Boolean(companyId),
    queryFn: () => getEngagements({ data: { firmId, companyId } }),
  });
  const engagements = engagementsQ.data ?? [];
  const currentEngagementId = engagements.some((item) => item.id === engagementId)
    ? engagementId
    : (engagements[0]?.id ?? "");
  const engagement = engagements.find((item) => item.id === currentEngagementId);
  const templatesQ = useQuery({
    queryKey: ["firm-recurring-templates", firmId, companyId, billingCompanyId],
    enabled: validBillingCompany,
    queryFn: () => getTemplates({ data: { firmId, companyId, billingCompanyId } }),
  });
  const eligible = engagement
    ? (templatesQ.data ?? []).filter((tpl) => compatiblePracticeRecurring(engagement, tpl))
    : [];
  const currentTemplateId = eligible.some((item) => item.id === templateId)
    ? templateId
    : (eligible[0]?.id ?? "");
  const linkKey = [
    "firm-recurring-links",
    firmId,
    companyId,
    billingCompanyId,
    currentEngagementId,
  ];
  const linksQ = useQuery({
    queryKey: linkKey,
    enabled: Boolean(validBillingCompany && currentEngagementId),
    queryFn: () =>
      getLinks({
        data: { firmId, companyId, billingCompanyId, engagementId: currentEngagementId },
      }),
  });
  const linkM = useMutation({
    mutationFn: () =>
      link({
        data: {
          firmId,
          companyId,
          billingCompanyId,
          engagementId: currentEngagementId,
          recurringId: currentTemplateId,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: linkKey });
      toast.success("Recurring invoice template linked");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const unlinkM = useMutation({
    mutationFn: (recurringId: string) =>
      unlink({
        data: {
          firmId,
          companyId,
          billingCompanyId,
          engagementId: currentEngagementId,
          recurringId,
        },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: linkKey });
      toast.success("Recurring reference unlinked; template unchanged");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const generateM = useMutation({
    mutationFn: (recurringId: string) =>
      generate({
        data: {
          firmId,
          companyId,
          billingCompanyId,
          engagementId: currentEngagementId,
          recurringId,
        },
      }),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: linkKey });
      await qc.invalidateQueries({
        queryKey: ["firm-engagement-invoice-links", firmId, companyId, currentEngagementId],
      });
      await qc.invalidateQueries({
        queryKey: ["firm-recurring-templates", firmId, companyId, billingCompanyId],
      });
      if (result.linked) {
        toast.success("Practice invoice draft generated and linked");
      } else {
        toast.warning(
          "Invoice created in the practice billing company, but reference linking failed. Open Sales to locate it.",
        );
      }
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  return (
    <section className="space-y-4 border-t pt-5" aria-label="Recurring practice billing">
      <h3 className="text-lg font-semibold">Recurring practice billing</h3>
      <p className="text-sm text-muted-foreground">
        Connect an active engagement to an existing Sales recurring invoice template in your
        practice billing company. All amounts, tax codes and invoice generation remain with
        LinkBooks' existing Sales engine. Automatic authorization is blocked in this workflow.
      </p>
      <Link to="/sales/recurring" className="text-sm underline">
        Configure recurring Sales invoices
      </Link>
      {!available.length ? (
        <EmptyState
          title="No linked clients"
          description="Link a client to use recurring billing."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Client</Label>
              <LookupSelect
                ariaLabel="Client for recurring billing"
                allowClear={false}
                value={companyId}
                onChange={(value) => {
                  setSelected(value);
                  setEngagementId("");
                  setTemplateId("");
                }}
                options={available.map((item) => ({
                  id: item.company_id,
                  name: getFirmClientName(item),
                  label: getFirmClientName(item),
                }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Engagement</Label>
              <RecordLookupSelect
                required
                value={currentEngagementId}
                onValueChange={setEngagementId}
              >
                <SelectTrigger aria-label="Engagement for recurring billing">
                  <SelectValue placeholder="Select engagement" />
                </SelectTrigger>
                <SelectContent>
                  {engagements.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
          </div>
          {!validBillingCompany ? (
            <p className="text-sm text-muted-foreground">
              Switch to your separate practice billing company to manage recurring fees.
            </p>
          ) : engagementsQ.isPending || templatesQ.isPending ? (
            <LoadingState rows={2} />
          ) : engagementsQ.isError || templatesQ.isError ? (
            <ErrorState
              title="Cannot load recurring billing"
              description={friendlyAuthError(engagementsQ.error ?? templatesQ.error)}
              onRetry={() => {
                void engagementsQ.refetch();
                void templatesQ.refetch();
              }}
            />
          ) : (
            <>
              {linksQ.isPending ? <LoadingState rows={2} /> : null}
              {linksQ.isError ? (
                <ErrorState
                  onRetry={() => void linksQ.refetch()}
                  title="Cannot load recurring links"
                  description={friendlyAuthError(linksQ.error)}
                />
              ) : null}
              {(linksQ.data ?? []).map((item) => {
                const schedule = item.sales_recurring_invoices;
                return (
                  <div
                    key={item.recurring_id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{schedule?.name ?? "Recurring invoice"}</p>
                      <p className="text-xs text-muted-foreground">
                        Next due {schedule?.next_due_date ?? "unknown"} ·{" "}
                        {schedule?.frequency ?? ""}
                      </p>
                      <Badge variant="outline">
                        {schedule?.is_active ? "Active template" : "Inactive template"}
                      </Badge>
                    </div>
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={
                            generateM.isPending ||
                            !engagement ||
                            !schedule ||
                            !compatiblePracticeRecurring(engagement, schedule) ||
                            !practiceDraftDue(schedule, new Date().toISOString().slice(0, 10))
                          }
                          onClick={() => {
                            if (
                              window.confirm(
                                "Generate a due DRAFT Sales invoice in the practice billing company? No client books will be changed.",
                              )
                            ) {
                              generateM.mutate(item.recurring_id);
                            }
                          }}
                        >
                          Generate due draft
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={unlinkM.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Unlink the recurring reference without deleting its template?",
                              )
                            )
                              unlinkM.mutate(item.recurring_id);
                          }}
                        >
                          Unlink
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {canManage && engagement && eligible.length ? (
                <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
                  <div className="min-w-64 flex-1 space-y-1">
                    <Label>Eligible recurring Sales template</Label>
                    <RecordLookupSelect
                      required
                      value={currentTemplateId}
                      onValueChange={setTemplateId}
                    >
                      <SelectTrigger aria-label="Recurring invoice template">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {eligible.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} · {item.frequency} · due {item.next_due_date}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </RecordLookupSelect>
                  </div>
                  <Button
                    disabled={linkM.isPending || !currentTemplateId}
                    onClick={() => linkM.mutate()}
                  >
                    Link recurring template
                  </Button>
                </div>
              ) : null}
              {canManage && engagement && !eligible.length ? (
                <p className="text-sm text-muted-foreground">
                  No active draft-only recurring template matches this engagement's frequency and
                  currency. Create one in Sales first.
                </p>
              ) : null}
            </>
          )}
        </>
      )}
    </section>
  );
}

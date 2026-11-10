import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsSubnav } from "@/components/advisors/AdvisorsSubnav";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  archivePlanInPayload,
  defaultAdminCatalogue,
  formatStartingLabel,
  upsertPlanInPayload,
  validateAdminPayload,
  type AdvisorAdminPlan,
  type AdvisorAdminService,
  type AdvisorCataloguePayload,
} from "@/lib/advisors/admin-catalogue";
import {
  getAdvisorsCatalogueAdmin,
  publishAdvisorsCatalogueDraft,
  restoreAdvisorsCatalogueVersion,
  saveAdvisorsCatalogueDraft,
} from "@/lib/advisors/admin.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";

function clonePayload(payload: AdvisorCataloguePayload): AdvisorCataloguePayload {
  return structuredClone(payload);
}

function PlanEditor({
  service,
  plan,
  canEdit,
  onChange,
  onArchive,
}: {
  service: AdvisorAdminService;
  plan: AdvisorAdminPlan;
  canEdit: boolean;
  onChange: (plan: AdvisorAdminPlan) => void;
  onArchive: () => void;
}) {
  return (
    <article className="space-y-3 rounded-xl border border-border/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{plan.name}</h3>
          <p className="text-xs text-muted-foreground">{plan.code}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {plan.isArchived ? <Badge variant="secondary">Archived</Badge> : null}
          {!plan.isEnabled ? <Badge variant="outline">Disabled</Badge> : null}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={`${plan.code}-name`}>Name</Label>
          <Input
            id={`${plan.code}-name`}
            value={plan.name}
            disabled={!canEdit || plan.isArchived}
            onChange={(event) => onChange({ ...plan, name: event.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${plan.code}-price`}>Price (minor units)</Label>
          <Input
            id={`${plan.code}-price`}
            type="number"
            min={0}
            value={plan.amountMinor}
            disabled={!canEdit || plan.isArchived}
            onChange={(event) =>
              onChange({ ...plan, amountMinor: Number(event.target.value) || 0 })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${plan.code}-currency`}>Currency</Label>
          <Input
            id={`${plan.code}-currency`}
            value={plan.currency}
            disabled={!canEdit || plan.isArchived}
            onChange={(event) => onChange({ ...plan, currency: event.target.value.toUpperCase() })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${plan.code}-cadence`}>Cadence</Label>
          <select
            id={`${plan.code}-cadence`}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={plan.cadence}
            disabled={!canEdit || plan.isArchived}
            onChange={(event) =>
              onChange({
                ...plan,
                cadence: event.target.value === "session" ? "session" : "month",
              })
            }
          >
            <option value="month">Monthly</option>
            <option value="session">Per session</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${plan.code}-annual`}>Annual price (minor units)</Label>
          <Input
            id={`${plan.code}-annual`}
            type="number"
            min={0}
            value={plan.annualAmountMinor ?? ""}
            disabled={!canEdit || plan.isArchived}
            onChange={(event) =>
              onChange({
                ...plan,
                annualAmountMinor:
                  event.target.value === "" ? null : Number(event.target.value) || 0,
              })
            }
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${plan.code}-duration`}>Session duration (minutes)</Label>
          <Input
            id={`${plan.code}-duration`}
            type="number"
            min={15}
            max={240}
            value={plan.sessionDurationMinutes ?? ""}
            disabled={!canEdit || plan.isArchived}
            onChange={(event) =>
              onChange({
                ...plan,
                sessionDurationMinutes:
                  event.target.value === "" ? null : Number(event.target.value) || null,
              })
            }
          />
        </div>
        {service.code === "bookkeeping" ? (
          <>
            <div className="space-y-1">
              <Label htmlFor={`${plan.code}-tx`}>Transaction allowance</Label>
              <Input
                id={`${plan.code}-tx`}
                type="number"
                min={0}
                value={plan.transactionLimit ?? ""}
                disabled={!canEdit || plan.isArchived}
                onChange={(event) =>
                  onChange({
                    ...plan,
                    transactionLimit:
                      event.target.value === "" ? null : Number(event.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${plan.code}-accounts`}>Account allowance</Label>
              <Input
                id={`${plan.code}-accounts`}
                type="number"
                min={0}
                value={plan.accountLimit ?? ""}
                disabled={!canEdit || plan.isArchived}
                onChange={(event) =>
                  onChange({
                    ...plan,
                    accountLimit:
                      event.target.value === "" ? null : Number(event.target.value) || 0,
                  })
                }
              />
            </div>
          </>
        ) : (
          <div className="space-y-1">
            <Label htmlFor={`${plan.code}-sessions`}>Sessions included</Label>
            <Input
              id={`${plan.code}-sessions`}
              type="number"
              min={0}
              value={plan.sessionsIncluded ?? ""}
              disabled={!canEdit || plan.isArchived}
              onChange={(event) =>
                onChange({
                  ...plan,
                  sessionsIncluded:
                    event.target.value === "" ? null : Number(event.target.value) || 0,
                })
              }
            />
          </div>
        )}
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${plan.code}-summary`}>Customer-facing summary</Label>
        <Textarea
          id={`${plan.code}-summary`}
          value={plan.summary}
          disabled={!canEdit || plan.isArchived}
          onChange={(event) => onChange({ ...plan, summary: event.target.value })}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={`${plan.code}-inclusions`}>Inclusions (one per line)</Label>
        <Textarea
          id={`${plan.code}-inclusions`}
          value={plan.inclusions.join("\n")}
          disabled={!canEdit || plan.isArchived}
          onChange={(event) =>
            onChange({
              ...plan,
              inclusions: event.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
        />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={plan.isEnabled && !plan.isArchived}
            disabled={!canEdit || plan.isArchived}
            onCheckedChange={(checked) => onChange({ ...plan, isEnabled: checked })}
          />
          Enabled for sale
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={plan.isPublished && !plan.isArchived}
            disabled={!canEdit || plan.isArchived}
            onCheckedChange={(checked) => onChange({ ...plan, isPublished: checked })}
          />
          Visible when published
        </label>
        {canEdit && !plan.isArchived ? (
          <Button type="button" variant="outline" onClick={onArchive}>
            Archive plan
          </Button>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground">
        Preview:{" "}
        {formatStartingLabel(plan.amountMinor, plan.currency, plan.cadence).replace(
          "Starting from ",
          "",
        )}
      </p>
    </article>
  );
}

export function AdvisorsServicesPricingPage() {
  const qc = useQueryClient();
  const load = useServerFn(getAdvisorsCatalogueAdmin);
  const saveDraft = useServerFn(saveAdvisorsCatalogueDraft);
  const publishDraft = useServerFn(publishAdvisorsCatalogueDraft);
  const restoreVersion = useServerFn(restoreAdvisorsCatalogueVersion);
  const query = useQuery({
    queryKey: ["advisors-catalogue-admin"],
    queryFn: () => load(),
    retry: false,
  });
  const [draft, setDraft] = useState<AdvisorCataloguePayload>(defaultAdminCatalogue());
  const [label, setLabel] = useState("Working draft");
  const [reason, setReason] = useState("");
  const [selectedService, setSelectedService] = useState("bookkeeping");
  const [newPlanCode, setNewPlanCode] = useState("");

  useEffect(() => {
    if (!query.data) return;
    setDraft(clonePayload(query.data.draft?.payload ?? query.data.live));
    setLabel(query.data.draft?.label || "Working draft");
  }, [query.data]);

  const canEdit = query.data?.role === "platform_owner" || query.data?.role === "platform_finance";
  const activeService = useMemo(
    () => draft.services.find((service) => service.code === selectedService) ?? draft.services[0],
    [draft.services, selectedService],
  );

  const saveM = useMutation({
    mutationFn: () =>
      saveDraft({
        data: { payload: draft, label, reason },
      }),
    onSuccess: async () => {
      toast.success("Draft saved. Customer pages are unchanged until you publish.");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["advisors-catalogue-admin"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const publishM = useMutation({
    mutationFn: () => publishDraft({ data: { reason } }),
    onSuccess: async (result) => {
      toast.success(result.note || "Catalogue published.");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["advisors-catalogue-admin"] });
      await qc.invalidateQueries({ queryKey: ["public-advisor-services"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const restoreM = useMutation({
    mutationFn: (versionId: string) =>
      restoreVersion({
        data: { versionId, reason: reason || "Restore previous catalogue version" },
      }),
    onSuccess: async () => {
      toast.success("Previous version restored into the draft. Publish when ready.");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["advisors-catalogue-admin"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const mutationPending = saveM.isPending || publishM.isPending || restoreM.isPending;

  if (query.isPending) return <main className="mx-auto max-w-6xl space-y-6 p-6"><AdvisorsSubnav /><div role="status" aria-live="polite"><LoadingState /></div></main>;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <PageHeader
          title="Services & Pricing"
          description="Manage LinkBooks Advisors plans without a code deployment."
        />
        <AdvisorsSubnav />
        <div role="alert"><ErrorState
          title="Advisors admin unavailable"
          description={friendlyAuthError(query.error)}
          onRetry={() => void query.refetch()}
        /></div>
      </main>
    );
  }

  const validation = validateAdminPayload(draft);

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Services & Pricing"
        description="Save draft, preview, publish and restore Advisors catalogue versions. Publishing does not change existing subscriptions or invoices."
      />
      <AdvisorsSubnav />
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        Signed in as {query.data.role}. Live catalogue is what visitors see on `/advisors`.
      </p>

      <section className="grid gap-3 rounded-xl border border-border/70 p-4 sm:grid-cols-[1fr_auto_auto]">
        <div className="space-y-1">
          <Label htmlFor="advisors-reason">Change reason</Label>
          <Input
            id="advisors-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why are you changing pricing or copy?"
            maxLength={5000}
            disabled={!canEdit || mutationPending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="advisors-label">Draft label</Label>
          <Input
            id="advisors-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={200}
            disabled={!canEdit || mutationPending}
          />
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={
              !canEdit || mutationPending || reason.trim().length < 3 || validation.length > 0
            }
            onClick={() => saveM.mutate()}
          >
            Save Draft
          </Button>
          <Button
            type="button"
            disabled={!canEdit || mutationPending || reason.trim().length < 3 || validation.length > 0}
            onClick={() => {
              if (
                window.confirm(
                  "Publish this draft to the public Advisors pages? Existing subscriptions stay on their current terms.",
                )
              ) {
                publishM.mutate();
              }
            }}
          >
            Publish Changes
          </Button>
        </div>
      </section>

      {validation.length > 0 ? (
        <p className="text-sm text-destructive" role="alert">
          {validation[0]}
        </p>
      ) : null}

      {!canEdit ? (
        <EmptyState
          title="View only"
          description="Platform owner or finance access with MFA is required to edit Advisors pricing."
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {draft.services.map((service) => (
          <Button
            key={service.code}
            type="button"
            size="sm"
            variant={service.code === activeService?.code ? "default" : "outline"}
            aria-pressed={service.code === activeService?.code}
            disabled={mutationPending}
            onClick={() => setSelectedService(service.code)}
          >
            {service.name}
          </Button>
        ))}
      </div>

      {activeService ? (
        <section className="space-y-4 rounded-xl border border-border/70 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="service-name">Service name</Label>
              <Input
                id="service-name"
                value={activeService.name}
                disabled={!canEdit}
                onChange={(event) =>
                  setDraft((current) => ({
                    services: current.services.map((service) =>
                      service.code === activeService.code
                        ? { ...service, name: event.target.value, headline: event.target.value }
                        : service,
                    ),
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="service-starting">Starting label</Label>
              <Input
                id="service-starting"
                value={activeService.startingLabel}
                disabled={!canEdit}
                onChange={(event) =>
                  setDraft((current) => ({
                    services: current.services.map((service) =>
                      service.code === activeService.code
                        ? { ...service, startingLabel: event.target.value }
                        : service,
                    ),
                  }))
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="service-description">Description</Label>
            <Textarea
              id="service-description"
              value={activeService.description}
              disabled={!canEdit}
              onChange={(event) =>
                setDraft((current) => ({
                  services: current.services.map((service) =>
                    service.code === activeService.code
                      ? { ...service, description: event.target.value }
                      : service,
                  ),
                }))
              }
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="service-welcome">Chatbot welcome message</Label>
            <Textarea
              id="service-welcome"
              value={activeService.chatWelcome}
              disabled={!canEdit}
              onChange={(event) =>
                setDraft((current) => ({
                  services: current.services.map((service) =>
                    service.code === activeService.code
                      ? { ...service, chatWelcome: event.target.value }
                      : service,
                  ),
                }))
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={activeService.isEnabled}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    services: current.services.map((service) =>
                      service.code === activeService.code
                        ? { ...service, isEnabled: checked }
                        : service,
                    ),
                  }))
                }
              />
              Service enabled
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={activeService.isPublished}
                disabled={!canEdit}
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    services: current.services.map((service) =>
                      service.code === activeService.code
                        ? { ...service, isPublished: checked }
                        : service,
                    ),
                  }))
                }
              />
              Published on landing page
            </label>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="new-plan-code">Add plan code</Label>
                <Input
                  id="new-plan-code"
                  value={newPlanCode}
                  disabled={!canEdit}
                  placeholder="e.g. premium_books"
                  onChange={(event) => setNewPlanCode(event.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!canEdit || !newPlanCode.trim()}
                onClick={() => {
                  const code = newPlanCode.trim().toLowerCase().replace(/\s+/g, "_");
                  setDraft((current) =>
                    upsertPlanInPayload(current, activeService.code, {
                      code: code as AdvisorAdminPlan["code"],
                      serviceCode: activeService.code,
                      name: code,
                      audience: "",
                      summary: "",
                      amountMinor: activeService.startingAmountMinor,
                      currency: activeService.currency,
                      cadence: activeService.cadence,
                      sortOrder: (activeService.plans.at(-1)?.sortOrder ?? 0) + 10,
                      inclusions: [],
                      isPublished: false,
                      isEnabled: true,
                      isArchived: false,
                      sessionDurationMinutes: activeService.code === "coaching" ? 45 : null,
                      transactionLimit: null,
                      accountLimit: null,
                      sessionsIncluded: activeService.code === "coaching" ? 1 : null,
                      annualAmountMinor:
                        activeService.cadence === "month"
                          ? activeService.startingAmountMinor * 10
                          : null,
                      features: [],
                    }),
                  );
                  setNewPlanCode("");
                }}
              >
                Add plan
              </Button>
            </div>
            {activeService.plans.map((plan) => (
              <PlanEditor
                key={plan.code}
                service={activeService}
                plan={plan}
                canEdit={canEdit}
                onChange={(next) =>
                  setDraft((current) => upsertPlanInPayload(current, activeService.code, next))
                }
                onArchive={() =>
                  setDraft((current) =>
                    archivePlanInPayload(current, activeService.code, plan.code),
                  )
                }
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Version history</h2>
        {query.data.versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No versions yet.</p>
        ) : (
          <ul className="space-y-2">
            {query.data.versions.map((version) => (
              <li
                key={version.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">
                    v{version.versionNumber} · {version.label || "Untitled"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {version.status}
                    {version.publishedAt ? ` · published ${version.publishedAt}` : ""}
                  </p>
                </div>
                {canEdit && version.status !== "draft" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={mutationPending}
                    onClick={() => restoreM.mutate(version.id)}
                  >
                    Restore to draft
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Audit log</h2>
        {query.data.audit.length === 0 ? (
          <p className="text-sm text-muted-foreground">No catalogue changes recorded yet.</p>
        ) : (
          <ul className="space-y-2">
            {query.data.audit.map((entry) => (
              <li key={entry.id} className="rounded-lg border border-border/70 px-3 py-2 text-sm">
                <span className="font-medium">{entry.action}</span>
                <span className="text-muted-foreground"> · {entry.reason}</span>
                <div className="text-xs text-muted-foreground">{entry.createdAt}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-xl border border-dashed border-border p-4">
        <h2 className="text-lg font-semibold">Preview Changes</h2>
        <p className="text-sm text-muted-foreground">
          Public visitors continue to see the live catalogue until publish. Open{" "}
          <a className="underline" href="/advisors" target="_blank" rel="noreferrer">
            /advisors
          </a>{" "}
          after publishing to verify.
        </p>
        <pre className="max-h-64 overflow-auto rounded-md bg-muted/50 p-3 text-xs">
          {JSON.stringify(draft, null, 2)}
        </pre>
      </section>
    </main>
  );
}

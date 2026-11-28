import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getCompanyTrialDetail,
  getTrialLifecycleAdmin,
  setTrialCountryRule,
  setTrialLifecyclePolicy,
  setTrialReminderConfig,
} from "@/lib/billing/trial-admin.functions";
import { extendPlatformCompanyTrial } from "@/lib/billing/subscription-admin.functions";

type Props = { canEdit: boolean };

const PRESET_DAYS = [7, 14, 30, 60, 90] as const;

export function TrialManagementAdmin({ canEdit }: Props) {
  const load = useServerFn(getTrialLifecycleAdmin);
  const savePolicy = useServerFn(setTrialLifecyclePolicy);
  const saveReminder = useServerFn(setTrialReminderConfig);
  const saveCountry = useServerFn(setTrialCountryRule);
  const detailFn = useServerFn(getCompanyTrialDetail);
  const extendFn = useServerFn(extendPlatformCompanyTrial);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["platform-trial-lifecycle"],
    queryFn: () => load(),
    retry: false,
  });

  const [reason, setReason] = useState("Trial policy update");
  const [companyId, setCompanyId] = useState("");
  const [extraDays, setExtraDays] = useState("30");
  const [countryCode, setCountryCode] = useState("IN");
  const [countryDays, setCountryDays] = useState("30");

  const detail = useQuery({
    queryKey: ["platform-company-trial", companyId],
    queryFn: () => detailFn({ data: { companyId } }),
    enabled: /^[0-9a-f-]{36}$/i.test(companyId),
    retry: false,
  });

  if (query.isLoading) {
    return (
      <section className="rounded-xl border bg-card p-5 text-sm" role="status">
        Loading trial management…
      </section>
    );
  }
  if (query.isError) {
    return (
      <section className="rounded-xl border bg-card p-5 text-sm text-destructive" role="alert">
        {(query.error as Error).message}
      </section>
    );
  }

  const policy = query.data?.policy;
  const reminders = query.data?.reminders ?? [];
  const plans = query.data?.plans ?? [];
  const countries = query.data?.countryRules ?? [];

  return (
    <section className="space-y-6 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Trial Management</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Configure no-card trial policy, reminder schedule, and per-customer extensions. Paid
          Stripe/Razorpay renewals are never silently changed — after purchase use complimentary
          grants for an extra free month.
        </p>
      </div>

      {policy ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            className="space-y-3 rounded-lg border p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!canEdit) return;
              const form = new FormData(event.currentTarget);
              savePolicy({
                data: {
                  enabled: form.get("enabled") === "on",
                  defaultDays: Number(form.get("defaultDays")),
                  requirePaymentMethod: form.get("requirePaymentMethod") === "on",
                  firstTimeOnly: form.get("firstTimeOnly") === "on",
                  allowReuse: form.get("allowReuse") === "on",
                  allowManualGrant: form.get("allowManualGrant") === "on",
                  readOnlyAfterExpiry: form.get("readOnlyAfterExpiry") === "on",
                  reason,
                },
              })
                .then((result) => {
                  toast.success(`Trial policy saved (v${result.version})`);
                  void queryClient.invalidateQueries({ queryKey: ["platform-trial-lifecycle"] });
                })
                .catch((error: unknown) =>
                  toast.error(error instanceof Error ? error.message : "Save failed"),
                );
            }}
          >
            <h3 className="font-medium">Global policy</h3>
            <p className="text-xs text-muted-foreground">Version {policy.version}</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                name="enabled"
                type="checkbox"
                defaultChecked={policy.enabled}
                disabled={!canEdit}
              />
              Trials enabled
            </label>
            <div className="space-y-1">
              <Label htmlFor="defaultDays">Default duration (days)</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_DAYS.map((days) => (
                  <Button
                    key={days}
                    type="button"
                    size="sm"
                    variant={policy.defaultDays === days ? "default" : "outline"}
                    disabled={!canEdit}
                    onClick={() => {
                      const input = document.getElementById(
                        "defaultDays",
                      ) as HTMLInputElement | null;
                      if (input) input.value = String(days);
                    }}
                  >
                    {days}
                  </Button>
                ))}
              </div>
              <Input
                id="defaultDays"
                name="defaultDays"
                type="number"
                min={1}
                max={365}
                defaultValue={policy.defaultDays}
                disabled={!canEdit}
                required
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                name="requirePaymentMethod"
                type="checkbox"
                defaultChecked={policy.requirePaymentMethod}
                disabled={!canEdit}
              />
              Require payment method (provider trial — not default)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                name="firstTimeOnly"
                type="checkbox"
                defaultChecked={policy.firstTimeOnly}
                disabled={!canEdit}
              />
              First-time customers preferred
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                name="allowReuse"
                type="checkbox"
                defaultChecked={policy.allowReuse}
                disabled={!canEdit}
              />
              Allow trial reuse
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                name="allowManualGrant"
                type="checkbox"
                defaultChecked={policy.allowManualGrant}
                disabled={!canEdit}
              />
              Allow admin manual grant / extend
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                name="readOnlyAfterExpiry"
                type="checkbox"
                defaultChecked={policy.readOnlyAfterExpiry}
                disabled={!canEdit}
              />
              Read-only after expiry (preserve data)
            </label>
            <div className="space-y-1">
              <Label htmlFor="policy-reason">Reason</Label>
              <Input
                id="policy-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!canEdit}
                minLength={3}
                required
              />
            </div>
            {canEdit ? <Button type="submit">Save global policy</Button> : null}
          </form>

          <div className="space-y-4">
            <div className="rounded-lg border p-4">
              <h3 className="font-medium">Reminder schedule</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {reminders.map((row) => (
                  <li key={row.kind} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <code>{row.kind}</code>
                      {row.daysBeforeExpiry != null ? ` · ${row.daysBeforeExpiry}d before` : ""}
                      {!row.enabled ? " · off" : ""}
                    </span>
                    {canEdit ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          saveReminder({
                            data: {
                              kind: row.kind as "welcome" | "d7" | "d3" | "d1" | "expired",
                              enabled: !row.enabled,
                              emailEnabled: row.emailEnabled,
                              inappEnabled: row.inappEnabled,
                              reason: `Toggle ${row.kind} reminder`,
                            },
                          })
                            .then(() => {
                              toast.success("Reminder updated");
                              void queryClient.invalidateQueries({
                                queryKey: ["platform-trial-lifecycle"],
                              });
                            })
                            .catch((error: unknown) =>
                              toast.error(error instanceof Error ? error.message : "Failed"),
                            );
                        }}
                      >
                        {row.enabled ? "Disable" : "Enable"}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border p-4">
              <h3 className="font-medium">Plan trial settings</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {plans.map((plan) => (
                  <li key={plan.code}>
                    <strong>{plan.code}</strong>:{" "}
                    {plan.trialEnabled ? `${plan.trialDays} days` : "disabled"}
                    {!plan.active ? " (inactive)" : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">
                Plan enable/days use existing <code>platform_set_plan_trial</code> / billing
                settings.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="space-y-3 rounded-lg border p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canEdit) return;
            saveCountry({
              data: {
                countryCode,
                enabled: true,
                trialDays: Number(countryDays),
                requirePaymentMethod: false,
                reason,
              },
            })
              .then(() => {
                toast.success("Country rule saved");
                void queryClient.invalidateQueries({ queryKey: ["platform-trial-lifecycle"] });
              })
              .catch((error: unknown) =>
                toast.error(error instanceof Error ? error.message : "Failed"),
              );
          }}
        >
          <h3 className="font-medium">Country override</h3>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                maxLength={2}
                disabled={!canEdit}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="country-days">Days</Label>
              <Input
                id="country-days"
                type="number"
                min={1}
                max={365}
                value={countryDays}
                onChange={(e) => setCountryDays(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>
          {countries.length ? (
            <ul className="text-xs text-muted-foreground">
              {countries.map((row) => (
                <li key={row.countryCode}>
                  {row.countryCode}: {row.trialDays ?? "—"}d{row.enabled === false ? " (off)" : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {canEdit ? <Button type="submit">Save country rule</Button> : null}
        </form>

        <div className="space-y-3 rounded-lg border p-4">
          <h3 className="font-medium">Customer trial</h3>
          <div className="space-y-1">
            <Label htmlFor="trial-company">Company ID</Label>
            <Input
              id="trial-company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value.trim())}
              placeholder="uuid"
            />
          </div>
          {detail.isSuccess ? (
            <div className="space-y-2 text-sm">
              <p>
                <strong>{detail.data.company.name}</strong>
              </p>
              <p>
                {detail.data.subscription?.planCode ?? "—"} ·{" "}
                {detail.data.subscription?.status ?? "—"} ·{" "}
                {detail.data.subscription?.remainingDays ?? "—"} day(s) left
              </p>
              <p className="text-xs text-muted-foreground">
                Reminders: {detail.data.reminders.length} · Extensions:{" "}
                {detail.data.extensions.length}
              </p>
              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  {PRESET_DAYS.map((days) => (
                    <Button
                      key={days}
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        extendFn({
                          data: {
                            companyId,
                            extraDays: days,
                            newEndsAt: null,
                            reason: `Extend trial by ${days} days`,
                            notes: "",
                          },
                        })
                          .then((result) => {
                            toast.success(`Trial now ends ${result.trialEndsAt}`);
                            void queryClient.invalidateQueries({
                              queryKey: ["platform-company-trial", companyId],
                            });
                          })
                          .catch((error: unknown) =>
                            toast.error(error instanceof Error ? error.message : "Extend failed"),
                          );
                      }}
                    >
                      +{days}d
                    </Button>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input
                      className="w-24"
                      type="number"
                      min={1}
                      max={366}
                      value={extraDays}
                      onChange={(e) => setExtraDays(e.target.value)}
                    />
                    <Button
                      type="button"
                      onClick={() => {
                        extendFn({
                          data: {
                            companyId,
                            extraDays: Number(extraDays),
                            newEndsAt: null,
                            reason: `Extend trial by ${extraDays} days`,
                            notes: "",
                          },
                        })
                          .then((result) => {
                            toast.success(`Trial now ends ${result.trialEndsAt}`);
                            void queryClient.invalidateQueries({
                              queryKey: ["platform-company-trial", companyId],
                            });
                          })
                          .catch((error: unknown) =>
                            toast.error(error instanceof Error ? error.message : "Extend failed"),
                          );
                      }}
                    >
                      Extend
                    </Button>
                  </div>
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                After paid purchase, grant an extra free month from Customer subscription
                administration (complimentary grant) — not by changing provider renewal dates.
              </p>
            </div>
          ) : null}
          {detail.isError ? (
            <p className="text-sm text-destructive">{(detail.error as Error).message}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

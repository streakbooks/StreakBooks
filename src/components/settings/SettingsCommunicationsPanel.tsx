import { useEffect, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CheckCircle2,
  Mail,
  Send,
  ShieldCheck,
  AlertTriangle,
  Clock,
  RefreshCw,
} from "lucide-react";
import {
  getOrganisationConfig,
  upsertOrganisationConfig,
} from "@/lib/settings/settings-centre.functions";
import {
  getCommunicationsStatus,
  sendCommunicationsTest,
  sendCommunicationsDigest,
} from "@/lib/notifications/communications.functions";
import { notificationsConfigSchema } from "@/lib/settings/registry";
import { NotificationPreferences } from "@/components/notifications/NotificationPreferences";
import { DigestPreferences } from "@/components/notifications/DigestPreferences";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { notify } from "@/lib/notify";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Config = ReturnType<typeof notificationsConfigSchema.parse>;
const DEFAULTS: Config = notificationsConfigSchema.parse({});

export function SettingsCommunicationsPanel({
  companyId,
  canEdit,
}: {
  companyId: string;
  canEdit: boolean;
}) {
  const getConfig = useServerFn(getOrganisationConfig);
  const saveConfig = useServerFn(upsertOrganisationConfig);
  const getStatus = useServerFn(getCommunicationsStatus);
  const sendTest = useServerFn(sendCommunicationsTest);
  const sendDigest = useServerFn(sendCommunicationsDigest);
  const client = useQueryClient();
  const [doc, setDoc] = useState<Config>(DEFAULTS);
  const [dirty, setDirty] = useState(false);
  const [loadedVersion, setLoadedVersion] = useState<number | null>(null);

  const config = useQuery({
    queryKey: ["organisation-config", companyId, "notifications"],
    queryFn: () => getConfig({ data: { companyId, category: "notifications" } }),
  });
  const status = useQuery({
    queryKey: ["communications-status", companyId],
    queryFn: () => getStatus({ data: { companyId } }),
  });
  useEffect(() => {
    if (!config.data || dirty) return;
    const parsed = notificationsConfigSchema.safeParse(config.data.document);
    if (parsed.success) {
      setDoc(parsed.data);
      setLoadedVersion(config.data.version);
    }
  }, [config.data, dirty]);

  const navigationBlocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  });

  const serverChanged = Boolean(dirty && config.data && loadedVersion !== config.data.version);
  const validatedDoc = notificationsConfigSchema.safeParse(doc);
  const validationErrors = validatedDoc.success ? null : validatedDoc.error.flatten().fieldErrors;
  const resetDraft = () => {
    if (!config.data) return;
    const parsed = notificationsConfigSchema.safeParse(config.data.document);
    if (!parsed.success) return;
    setDoc(parsed.data);
    setLoadedVersion(config.data.version);
    setDirty(false);
  };

  const save = useMutation({
    mutationFn: () => {
      if (!config.data || serverChanged || !dirty) {
        throw new Error("Reload the latest settings before saving.");
      }
      const validated = notificationsConfigSchema.parse(doc);
      return saveConfig({
        data: {
          companyId,
          category: "notifications",
          document: validated,
          expectedVersion: loadedVersion ?? config.data.version,
          reason: "Notifications & Communications preferences updated",
        },
      });
    },
    onSuccess: async (result) => {
      const parsed = notificationsConfigSchema.safeParse(result.document);
      if (parsed.success) setDoc(parsed.data);
      client.setQueryData(["organisation-config", companyId, "notifications"], result);
      setLoadedVersion(result.version);
      setDirty(false);
      await client.invalidateQueries({
        queryKey: ["organisation-config", companyId, "notifications"],
      });
      notify.success("Communication settings saved");
    },
    onError: (error) => notify.error(error, "Could not save settings"),
  });
  const test = useMutation({
    mutationFn: () => sendTest({ data: { companyId } }),
    onSuccess: async ({ recipient }) => {
      notify.success("Test email accepted by provider", recipient);
      await client.invalidateQueries({ queryKey: ["communications-status", companyId] });
    },
    onError: (error) => notify.error(error, "Test email failed"),
  });
  const digest = useMutation({
    mutationFn: () => sendDigest({ data: { companyId } }),
    onSuccess: async ({ recipient, count }) => {
      notify.success(`Digest accepted by provider (${count} actions)`, recipient);
      await client.invalidateQueries({ queryKey: ["communications-status", companyId] });
    },
    onError: (error) => notify.error(error, "Digest could not be sent"),
  });
  const savingBlocked =
    !canEdit || save.isPending || config.isPending || config.isError || serverChanged;
  const providerReady = Boolean(status.data?.configured);
  const canTest = Boolean(providerReady && status.data?.canSend && status.data?.recipient);
  const canDigest = Boolean(providerReady && status.data?.canDigest && status.data?.recipient);
  const set = <K extends keyof Config>(key: K, value: Config[K]) => {
    setDirty(true);
    setDoc((old) => ({ ...old, [key]: value }));
  };
  return (
    <section className="space-y-4" aria-label="Notifications and communications settings">
      <div>
        <h2 className="text-lg font-semibold">Notifications & Communications</h2>
        <p className="text-sm text-muted-foreground">
          Real notification delivery settings, email provider readiness and per-user channel
          preferences. Accounting approvals and posting permissions are not affected.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="outline">
          <Link to="/notifications">Open Action Center</Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void client.invalidateQueries({ queryKey: ["communications-status", companyId] });
          }}
          disabled={status.isFetching}
        >
          <RefreshCw className="mr-1 size-4" />
          Refresh provider status
        </Button>
      </div>
      {status.isPending && (
        <p className="text-sm text-muted-foreground">Checking email delivery configuration…</p>
      )}
      {status.isError ? (
        <QueryErrorState queries={[status]} title="Status check failed" />
      ) : null}
      {status.data && (
        <Alert variant={providerReady ? "default" : "destructive"}>
          {providerReady ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <AlertTriangle className="size-4" />
          )}
          <AlertTitle>
            {status.data.configured
              ? "Email provider configured — delivery verification available"
              : "Email provider not configured"}
          </AlertTitle>
          <AlertDescription className="space-y-1">
            <p>Transport: {status.data.provider === "resend" ? "Resend" : status.data.provider}.</p>
            {status.data.verifiedSender && (
              <p>Server-controlled sender: {status.data.verifiedSender}</p>
            )}
            {status.data.domainCheck && (
              <p>
                Sender domain {status.data.domainCheck.domain}:{" "}
                <strong>{status.data.domainCheck.state}</strong> — {status.data.domainCheck.detail}
              </p>
            )}
            {!status.data.configured && (
              <p>
                Server configuration required: {status.data.missingConfiguration.join(", ")}. Store
                secrets in the server environment, never in this page.
              </p>
            )}
            {status.data.demoBlocked && (
              <p>
                Demo safeguard: only a test email to your own verified address is allowed. Customer
                document emails and financial digests remain disabled.
              </p>
            )}
            {status.data.recentSuccessfulTest && (
              <p>
                Provider accepted a previous test message:{" "}
                {new Date(status.data.recentSuccessfulTest).toLocaleString()}. Check your inbox for
                actual delivery.
              </p>
            )}
            <p>
              Sender-domain DNS verification and mailbox delivery must be completed with the
              provider. Configured does not mean verified.
            </p>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Email identity and quiet hours</CardTitle>
          <CardDescription>
            Saved per organisation with version conflict detection. Changing sender name does not
            alter the verified FROM email address.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid max-w-xl gap-4">
          {config.isError ? (
            <QueryErrorState queries={[config]} title="Could not load communication settings" />
          ) : null}
          {serverChanged && (
            <Alert variant="destructive">
              <AlertTitle>These settings changed in another session</AlertTitle>
              <AlertDescription className="space-y-2">
                <p>Your unsaved edits are preserved. Reload the latest values before saving.</p>
                <Button size="sm" variant="outline" onClick={resetDraft}>
                  Reload latest settings
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label htmlFor="communication-from-name">Email From Name</Label>
            <Input
              id="communication-from-name"
              value={doc.email_from_name}
              maxLength={120}
              aria-invalid={Boolean(validationErrors?.email_from_name?.length)}
              aria-describedby={
                validationErrors?.email_from_name?.length
                  ? "communication-from-name-error"
                  : undefined
              }
              disabled={savingBlocked}
              placeholder="e.g. LinkBooks Accounts"
              onChange={(e) => set("email_from_name", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Used on actual outgoing document and digest emails, subject to provider settings.
            </p>
            {validationErrors?.email_from_name?.[0] ? (
              <p id="communication-from-name-error" className="text-xs text-destructive">
                {validationErrors.email_from_name[0]}
              </p>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="communication-reply-to">Reply To</Label>
            <Input
              id="communication-reply-to"
              type="email"
              value={doc.reply_to}
              aria-invalid={Boolean(validationErrors?.reply_to?.length)}
              aria-describedby={
                validationErrors?.reply_to?.length ? "communication-reply-to-error" : undefined
              }
              disabled={savingBlocked}
              placeholder="accounts@example.com"
              onChange={(e) => set("reply_to", e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Replies to LinkBooks document emails and notification digests are directed here when
              set.
            </p>
            {validationErrors?.reply_to?.[0] ? (
              <p id="communication-reply-to-error" className="text-xs text-destructive">
                {validationErrors.reply_to[0]}
              </p>
            ) : null}
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="communication-quiet">Quiet Hours Enabled</Label>
              <p className="text-xs text-muted-foreground">
                Pauses non-urgent digest delivery. Manually sent financial documents remain
                available.
              </p>
            </div>
            <Switch
              id="communication-quiet"
              checked={doc.quiet_hours_enabled}
              disabled={savingBlocked}
              onCheckedChange={(checked) => set("quiet_hours_enabled", checked)}
            />
          </div>
          {doc.quiet_hours_enabled && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="communication-quiet-start">Start</Label>
                <Input
                  id="communication-quiet-start"
                  type="time"
                  value={doc.quiet_hours_start}
                  disabled={savingBlocked}
                  onChange={(e) => set("quiet_hours_start", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="communication-quiet-end">End</Label>
                <Input
                  id="communication-quiet-end"
                  type="time"
                  value={doc.quiet_hours_end}
                  disabled={savingBlocked}
                  onChange={(e) => set("quiet_hours_end", e.target.value)}
                />
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                Company timezone: {status.data?.timezone ?? "Loading…"}. Critical in-app accounting
                alerts are never suppressed.
              </p>
            </div>
          )}
          {save.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {friendlyAuthError(save.error)}
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3 border-t pt-4">
            <Button
              disabled={savingBlocked || !dirty || !validatedDoc.success}
              onClick={() => save.mutate()}
            >
              {save.isPending ? "Saving…" : "Save communication settings"}
            </Button>
            <Button variant="outline" disabled={!dirty || save.isPending} onClick={resetDraft}>
              Discard changes
            </Button>
            <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
              {!canEdit
                ? "Read-only"
                : serverChanged
                  ? "Server version changed"
                  : dirty
                    ? "Unsaved changes"
                    : "All changes saved"}
            </span>
          </div>
        </CardContent>
      </Card>
      {status.data?.userId && (
        <>
          <NotificationPreferences companyId={companyId} userId={status.data.userId} />
          {!status.data.demoBlocked && (
            <DigestPreferences
              companyId={companyId}
              userId={status.data.userId}
              timezone={status.data.timezone}
              providerConfigured={status.data.configured}
            />
          )}
        </>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="size-4" />
            Email delivery & on-demand digests
          </CardTitle>
          <CardDescription>
            Test messages and summaries go only to your own verified account email. They never
            approve or modify accounting records.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            Recipient:{" "}
            <strong>{status.data?.recipient ?? "No verified email on your account"}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!canTest || test.isPending || digest.isPending}
              onClick={() => test.mutate()}
            >
              <Send className="mr-1 size-4" />
              {test.isPending ? "Sending test…" : "Send test email"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!canDigest || digest.isPending || test.isPending}
              onClick={() => digest.mutate()}
            >
              <Clock className="mr-1 size-4" />
              {digest.isPending ? "Sending digest…" : "Email my Action Center digest now"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Test emails are limited to one attempt per five minutes. Manual digests are limited to
            one attempt per hour, respect quiet hours and include only actionable records you are
            permitted to see.
          </p>
          <Alert>
            <ShieldCheck className="size-4" />
            <AlertTitle>Automated delivery</AlertTitle>
            <AlertDescription>
              Scheduled unattended email digests require an authenticated background worker and
              verified email transport. They are not marked operational in this build. The on-demand
              digest above is a real send when the provider is configured. In-app accounting alerts
              continue to work independently.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
      {status.data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Actual email delivery attempts</CardTitle>
            <CardDescription>
              Accepted or rejected messages returned by the configured provider; not sample or
              simulated history.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {status.data.history.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No test or digest email attempts have been recorded.
              </p>
            )}
            {status.data.history.map((entry) => (
              <div key={entry.id} className="rounded-md border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>
                    {entry.template === "notification_test"
                      ? "Test email"
                      : entry.template === "notification_digest"
                        ? "Action digest"
                        : entry.template}
                  </strong>
                  <span
                    className={
                      entry.status === "sent"
                        ? "text-green-700 dark:text-green-400"
                        : "text-destructive"
                    }
                  >
                    {entry.status === "sent" ? "Provider accepted" : "Failed"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {new Date(entry.created_at).toLocaleString()} · {entry.to_addresses.join(", ")}
                </p>
                {entry.error ? (
                  <p className="mt-1 text-xs text-destructive">{friendlyAuthError(entry.error)}</p>
                ) : null}
                {entry.provider_message_id && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Provider ID: {entry.provider_message_id}
                  </p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      <AlertDialog
        open={navigationBlocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && navigationBlocker.status === "blocked") navigationBlocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved notification settings?</AlertDialogTitle>
            <AlertDialogDescription>
              Unsaved sender identity and notification preferences will be discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (navigationBlocker.status === "blocked") navigationBlocker.reset();
              }}
            >
              Stay and keep editing
            </Button>
            <Button
              variant="destructive"
              disabled={save.isPending}
              onClick={() => {
                if (navigationBlocker.status === "blocked") navigationBlocker.proceed();
              }}
            >
              Discard and leave
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

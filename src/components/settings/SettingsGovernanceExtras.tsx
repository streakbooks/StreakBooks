import { getIntegrationHealth } from "@/lib/settings/integration-health.functions";
import { integrationStatusLabel } from "@/lib/settings/integration-health";
import { useEffect, useState } from "react";
import { Link, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getWorkflowSettings,
  upsertWorkflowSettings,
} from "@/lib/settings/workflow-settings.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { QueryErrorState } from "@/components/common/QueryErrorState";
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Props = { companyId: string; canEdit: boolean };

export function SettingsAutomationPanel({ companyId, canEdit }: Props) {
  const qc = useQueryClient();
  const fetch = useServerFn(getWorkflowSettings);
  const save = useServerFn(upsertWorkflowSettings);
  const q = useQuery({
    queryKey: ["workflow-settings", companyId],
    queryFn: () => fetch({ data: { companyId } }),
  });

  const [requireMemo, setRequireMemo] = useState(false);
  const [csvFmt, setCsvFmt] = useState("YYYY-MM-DD");
  const [dirty, setDirty] = useState(false);
  const navigationBlocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  });

  useEffect(() => {
    if (!q.isSuccess || !q.data || dirty) return;
    setRequireMemo(q.data.accounting_require_journal_memo);
    setCsvFmt(q.data.banking_csv_date_format);
  }, [q.isSuccess, q.data, dirty]);

  const reset = () => {
    if (!q.data) return;
    setRequireMemo(q.data.accounting_require_journal_memo);
    setCsvFmt(q.data.banking_csv_date_format);
    setDirty(false);
  };

  const saveM = useMutation({
    mutationFn: () => {
      if (!q.data) throw new Error("Workflow settings are not loaded.");
      return save({
        data: {
          companyId,
          accountingRequireJournalMemo: requireMemo,
          bankingCsvDateFormat: csvFmt,
        },
      });
    },
    onSuccess: async () => {
      setDirty(false);
      await qc.invalidateQueries({ queryKey: ["workflow-settings", companyId] });
      toast.success("Automation defaults saved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (q.isPending) return <Skeleton className="h-64 w-full" />;
  if (q.isError) {
    return <QueryErrorState queries={[q]} title="Could not load workflow defaults" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Automation & defaults</CardTitle>
        <CardDescription>
          Organisation-wide workflow defaults. Sales and Purchases module settings remain
          authoritative for document-specific preferences —{" "}
          <Link to="/sales/settings" className="underline">
            Sales settings
          </Link>
          ,{" "}
          <Link to="/purchases/settings" className="underline">
            Purchases settings
          </Link>
          .
        </CardDescription>
      </CardHeader>
      <CardContent className="grid max-w-xl gap-4">
        <div className="space-y-1">
          <Label htmlFor="workflow-csv-date">Banking CSV date format</Label>
          <Select
            value={csvFmt}
            onValueChange={(value) => {
              setCsvFmt(value);
              setDirty(true);
            }}
            disabled={!canEdit || saveM.isPending}
          >
            <SelectTrigger id="workflow-csv-date">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
              <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Require memo on manual journals</span>
          <Switch
            checked={requireMemo}
            disabled={!canEdit || saveM.isPending}
            onCheckedChange={(value) => {
              setRequireMemo(value);
              setDirty(true);
            }}
          />
        </label>
        <p className="text-xs text-muted-foreground">
          Journal memo requirement is enforced server-side when posting manual journals.
        </p>
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          <Button
            size="sm"
            disabled={!canEdit || !dirty || saveM.isPending || !q.isSuccess || q.isError}
            onClick={() => saveM.mutate()}
          >
            {saveM.isPending ? "Saving…" : "Save automation defaults"}
          </Button>
          <Button variant="outline" size="sm" disabled={!dirty || saveM.isPending} onClick={reset}>
            Discard changes
          </Button>
          <span aria-live="polite" className="text-xs text-muted-foreground">
            {dirty ? "Unsaved changes" : "All changes saved"}
          </span>
        </div>
      </CardContent>
      <AlertDialog
        open={navigationBlocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && navigationBlocker.status === "blocked") navigationBlocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved workflow defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              Unsaved payment terms, banking CSV preferences or workflow rules will be discarded.
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
              disabled={saveM.isPending}
              onClick={() => {
                if (navigationBlocker.status === "blocked") navigationBlocker.proceed();
              }}
            >
              Discard and leave
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function SettingsIntegrationsPanel({ companyId }: { companyId: string }) {
  const fetch = useServerFn(getIntegrationHealth);
  const health = useQuery({
    queryKey: ["integration-health", companyId],
    queryFn: () => fetch({ data: { companyId } }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Integrations</CardTitle>
        <CardDescription>
          Connection status for external services used by this organisation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {health.isPending ? (
          <p role="status">Checking integration configuration…</p>
        ) : health.isError ? (
          <QueryErrorState queries={[health]} title="Could not check integration health" />
        ) : !health.isSuccess ? (
          <p role="status">Checking integration configuration…</p>
        ) : (
          health.data.map((integration) => (
            <IntegrationRow
              key={integration.key}
              name={integration.name}
              status={integrationStatusLabel(integration.status)}
              detail={integration.detail}
            />
          ))
        )}
        <Button
          variant="outline"
          size="sm"
          disabled={health.isFetching}
          onClick={() => void health.refetch()}
        >
          Refresh status
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to="/settings" search={{ section: "notifications" }}>
            Check email delivery
          </Link>
        </Button>
        <IntegrationRow
          name="Address autocomplete"
          status="Not configured"
          detail="Manual address entry remains available on contacts and documents."
        />
      </CardContent>
    </Card>
  );
}

function IntegrationRow({
  name,
  status,
  detail,
}: {
  name: string;
  status: string;
  detail: string;
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="font-medium">{name}</span>
        <Badge variant="secondary">{status}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

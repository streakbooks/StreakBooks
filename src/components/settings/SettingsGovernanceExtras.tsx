import { getIntegrationHealth } from "@/lib/settings/integration-health.functions";
import { integrationStatusLabel } from "@/lib/settings/integration-health";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getWorkflowSettings,
  upsertWorkflowSettings,
} from "@/lib/settings/workflow-settings.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { parsePaymentTermsDays } from "@/lib/settings/workflow-defaults-validation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

  const [salesTerms, setSalesTerms] = useState("30");
  const [purchTerms, setPurchTerms] = useState("30");
  const [requirePo, setRequirePo] = useState(false);
  const [requireMemo, setRequireMemo] = useState(false);
  const [csvFmt, setCsvFmt] = useState("YYYY-MM-DD");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!q.data || dirty) return;
    setSalesTerms(String(q.data.sales_default_payment_terms_days));
    setPurchTerms(String(q.data.purchases_default_payment_terms_days));
    setRequirePo(q.data.purchases_require_po);
    setRequireMemo(q.data.accounting_require_journal_memo);
    setCsvFmt(q.data.banking_csv_date_format);
  }, [q.data, dirty]);

  const parsedSalesTerms = parsePaymentTermsDays(salesTerms);
  const parsedPurchaseTerms = parsePaymentTermsDays(purchTerms);
  const reset = () => {
    if (!q.data) return;
    setSalesTerms(String(q.data.sales_default_payment_terms_days));
    setPurchTerms(String(q.data.purchases_default_payment_terms_days));
    setRequirePo(q.data.purchases_require_po);
    setRequireMemo(q.data.accounting_require_journal_memo);
    setCsvFmt(q.data.banking_csv_date_format);
    setDirty(false);
  };

  const saveM = useMutation({
    mutationFn: () => {
      if (!q.data || parsedSalesTerms === null || parsedPurchaseTerms === null) {
        throw new Error("Enter whole-day payment terms between 0 and 3650.");
      }
      return save({
        data: {
          companyId,
          salesDefaultPaymentTermsDays: parsedSalesTerms,
          purchasesDefaultPaymentTermsDays: parsedPurchaseTerms,
          purchasesRequirePo: requirePo,
          accountingRequireJournalMemo: requireMemo,
          bankingCsvDateFormat: csvFmt,
          // The shared workflow save endpoint persists an entire record.
          // Preserve module-owned sales and purchase settings on this save.
          salesDefaultNotes: q.data.sales_default_notes ?? "",
          salesPaymentInstructions: q.data.sales_payment_instructions ?? "",
          salesQuoteValidityDays: q.data.sales_quote_validity_days,
          salesPricesIncludeTax: q.data.sales_prices_include_tax,
          purchasesDefaultNotes: q.data.purchases_default_notes ?? "",
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
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Could not load workflow defaults</CardTitle>
          <CardDescription>{friendlyAuthError(q.error)}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" size="sm" onClick={() => void q.refetch()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
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
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="workflow-sales-terms">Default sales payment terms (days)</Label>
            <Input
              id="workflow-sales-terms"
              inputMode="numeric"
              value={salesTerms}
              disabled={!canEdit || saveM.isPending}
              aria-invalid={parsedSalesTerms === null}
              aria-describedby={parsedSalesTerms === null ? "workflow-sales-error" : undefined}
              onChange={(e) => {
                setSalesTerms(e.target.value);
                setDirty(true);
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="workflow-purchase-terms">Default purchase payment terms (days)</Label>
            <Input
              id="workflow-purchase-terms"
              inputMode="numeric"
              value={purchTerms}
              disabled={!canEdit || saveM.isPending}
              aria-invalid={parsedPurchaseTerms === null}
              aria-describedby={
                parsedPurchaseTerms === null ? "workflow-purchases-error" : undefined
              }
              onChange={(e) => {
                setPurchTerms(e.target.value);
                setDirty(true);
              }}
            />
          </div>
        </div>
        {parsedSalesTerms === null ? (
          <p id="workflow-sales-error" className="text-sm text-destructive">
            Sales terms must be a whole number from 0 to 3650.
          </p>
        ) : null}
        {parsedPurchaseTerms === null ? (
          <p id="workflow-purchases-error" className="text-sm text-destructive">
            Purchase terms must be a whole number from 0 to 3650.
          </p>
        ) : null}
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
          <span>Require purchase order reference on bills</span>
          <Switch
            checked={requirePo}
            disabled={!canEdit || saveM.isPending}
            onCheckedChange={(value) => {
              setRequirePo(value);
              setDirty(true);
            }}
          />
        </label>
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
            disabled={
              !canEdit ||
              !dirty ||
              saveM.isPending ||
              parsedSalesTerms === null ||
              parsedPurchaseTerms === null
            }
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
          <p role="alert">{friendlyAuthError(health.error)}</p>
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

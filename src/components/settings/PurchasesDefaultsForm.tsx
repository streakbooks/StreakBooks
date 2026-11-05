import { useId, useEffect, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getWorkflowSettings,
  upsertWorkflowSettings,
} from "@/lib/settings/workflow-settings.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { useCanDo } from "@/hooks/use-can";
import { parsePurchasesDefaultsDraft } from "@/lib/settings/workflow-defaults-drafts";
import { LoadingState, ErrorState } from "@/components/common/states";
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
import { Textarea } from "@/components/ui/textarea";

export function PurchasesDefaultsForm({ companyId }: { companyId: string }) {
  const uiId = useId();
  const canEdit = useCanDo("company.settings.edit");
  const queryClient = useQueryClient();
  const fetch = useServerFn(getWorkflowSettings);
  const save = useServerFn(upsertWorkflowSettings);
  const q = useQuery({
    queryKey: ["workflow-settings", companyId],
    queryFn: () => fetch({ data: { companyId } }),
  });
  const [terms, setTerms] = useState("30");
  const [notes, setNotes] = useState("");
  const [requirePo, setRequirePo] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [baseline, setBaseline] = useState("");

  useEffect(() => {
    if (!q.data || dirty) return;
    setBaseline(JSON.stringify(q.data));
    setTerms(String(q.data.purchases_default_payment_terms_days));
    setNotes(q.data.purchases_default_notes ?? "");
    setRequirePo(q.data.purchases_require_po);
  }, [q.data, dirty]);

  const parsed = parsePurchasesDefaultsDraft({ terms, notes, requirePo });
  const serverChanged = Boolean(dirty && q.data && JSON.stringify(q.data) !== baseline);
  const navigationBlocker = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: dirty,
    withResolver: true,
  });
  const discard = () => {
    if (!q.data) return;
    setTerms(String(q.data.purchases_default_payment_terms_days));
    setNotes(q.data.purchases_default_notes ?? "");
    setRequirePo(q.data.purchases_require_po);
    setBaseline(JSON.stringify(q.data));
    setDirty(false);
  };

  const mut = useMutation({
    mutationFn: () => {
      if (!q.data || serverChanged || !parsed.ok) {
        throw new Error("Review the latest purchases defaults before saving.");
      }
      const data: Parameters<typeof save>[0]["data"] = {
        companyId,
        ...parsed.value,
      };
      if (q.data) {
        data.salesDefaultPaymentTermsDays = q.data.sales_default_payment_terms_days;
        if (q.data.sales_default_notes) data.salesDefaultNotes = q.data.sales_default_notes;
        if (q.data.sales_payment_instructions) {
          data.salesPaymentInstructions = q.data.sales_payment_instructions;
        }
        data.salesQuoteValidityDays = q.data.sales_quote_validity_days;
        data.salesPricesIncludeTax = q.data.sales_prices_include_tax;
        data.bankingCsvDateFormat = q.data.banking_csv_date_format;
        data.accountingRequireJournalMemo = q.data.accounting_require_journal_memo;
      }
      return save({ data });
    },
    onSuccess: async () => {
      setDirty(false);
      toast.success("Purchases settings saved");
      await queryClient.invalidateQueries({ queryKey: ["workflow-settings", companyId] });
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (q.isPending) return <LoadingState />;
  if (q.isError)
    return (
      <ErrorState
        title="Could not load defaults"
        description={friendlyAuthError(q.error)}
        onRetry={() => q.refetch()}
      />
    );

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle className="text-base">Purchases defaults</CardTitle>
        <CardDescription>Applies to new bills — does not rewrite posted history.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-1">
          <Label htmlFor={`${uiId}-supplier-terms`}>Default supplier payment terms (days)</Label>
          <Input
            id={`${uiId}-supplier-terms`}
            inputMode="numeric"
            value={terms}
            disabled={!canEdit || mut.isPending}
            aria-invalid={Boolean(!parsed.ok && parsed.errors.terms)}
            onChange={(e) => {
              setTerms(e.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${uiId}-req-po`}>Prefer purchase order before bill</Label>
          <Switch
            id={`${uiId}-req-po`}
            checked={requirePo}
            disabled={!canEdit || mut.isPending}
            onCheckedChange={(checked) => {
              setRequirePo(checked);
              setDirty(true);
            }}
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`${uiId}-bill-notes`}>Default bill notes</Label>
          <Textarea
            id={`${uiId}-bill-notes`}
            value={notes}
            disabled={!canEdit || mut.isPending}
            onChange={(e) => {
              setNotes(e.target.value);
              setDirty(true);
            }}
            rows={3}
          />
        </div>
        {!parsed.ok ? (
          <p role="alert" className="text-sm text-destructive">
            {Object.values(parsed.errors).join(" ")}
          </p>
        ) : null}
        {serverChanged ? (
          <p role="alert" className="text-sm text-destructive">
            Purchases defaults changed elsewhere. Reload the latest values before saving.
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 border-t pt-3">
          <Button
            onClick={() => mut.mutate()}
            disabled={!canEdit || !dirty || !parsed.ok || serverChanged || mut.isPending}
          >
            {mut.isPending ? "Saving…" : "Save purchases settings"}
          </Button>
          <Button variant="outline" disabled={!dirty || mut.isPending} onClick={discard}>
            {serverChanged ? "Reload latest" : "Discard changes"}
          </Button>
          <span role="status" aria-live="polite" className="text-xs text-muted-foreground">
            {!canEdit ? "Read-only settings" : dirty ? "Unsaved changes" : "All changes saved"}
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
            <AlertDialogTitle>Leave with unsaved purchases defaults?</AlertDialogTitle>
            <AlertDialogDescription>
              Your unsaved supplier terms and bill preferences will be discarded.
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
              disabled={mut.isPending}
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

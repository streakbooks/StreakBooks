import { useId, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getWorkflowSettings,
  upsertWorkflowSettings,
} from "@/lib/settings/workflow-settings.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState, ErrorState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export function PurchasesDefaultsForm({ companyId }: { companyId: string }) {
  const uiId = useId();
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

  useEffect(() => {
    if (!q.data) return;
    setTerms(String(q.data.purchases_default_payment_terms_days));
    setNotes(q.data.purchases_default_notes ?? "");
    setRequirePo(q.data.purchases_require_po);
  }, [q.data]);

  const mut = useMutation({
    mutationFn: () => {
      const data: Parameters<typeof save>[0]["data"] = {
        companyId,
        purchasesDefaultPaymentTermsDays: Number(terms),
        purchasesDefaultNotes: notes,
        purchasesRequirePo: requirePo,
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
          <Label>Default supplier payment terms (days)</Label>
          <Input type="number" value={terms} onChange={(e) => setTerms(e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor={`${uiId}-req-po`}>Prefer purchase order before bill</Label>
          <Switch id={`${uiId}-req-po`} checked={requirePo} onCheckedChange={setRequirePo} />
        </div>
        <div className="grid gap-1">
          <Label>Default bill notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>
        <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? "Saving…" : "Save purchases settings"}
        </Button>
      </CardContent>
    </Card>
  );
}

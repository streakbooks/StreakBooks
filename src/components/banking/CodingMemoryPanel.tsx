import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { recordCodingFeedback, setCodingMemoryPreference } from "@/lib/banking/memory.functions";
import type { MemoryPreference } from "@/lib/banking/memory";
import type { Suggestion } from "@/lib/banking/suggestions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

type Props = {
  companyId: string;
  transactionId: string;
  preferences: MemoryPreference[];
  suggestions: Suggestion[];
  available: boolean;
  onSelect: (accountId: string) => void;
};

/** Feedback is an intention; only a linked posted journal becomes approved learning. */
export function CodingMemoryPanel({
  companyId,
  transactionId,
  preferences,
  suggestions,
  available,
  onSelect,
}: Props) {
  const [lastOperation, setLastOperation] = useState<"feedback" | "preference">("feedback");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const canCode = useCanDo("banking.categorise");
  const qc = useQueryClient();
  const sendFeedback = useServerFn(recordCodingFeedback);
  const setPreference = useServerFn(setCodingMemoryPreference);
  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["bank-suggest", companyId, transactionId] });
  const feedback = useMutation({
    onMutate: () => {
      setLastOperation("feedback");
    },
    mutationFn: (input: {
      historyId: string;
      state: "accepted" | "rejected";
      requestId: string;
      accountId: string;
    }) =>
      sendFeedback({
        data: {
          companyId,
          bankTransactionId: transactionId,
          historyId: input.historyId,
          state: input.state,
          requestId: input.requestId,
        },
      }),
    retry: 1,
    onSuccess: (_result, input) => {
      if (!mounted.current) return;
      if (input.state === "accepted") onSelect(input.accountId);
      toast.success(
        input.state === "accepted"
          ? "Suggestion selected. Review and post to confirm coding."
          : "Rejection recorded. No learning was added.",
      );
      void refresh();
    },
  });
  const preference = useMutation({
    onMutate: () => {
      setLastOperation("preference");
    },
    mutationFn: (input: { historyId: string; enabled: boolean }) =>
      setPreference({ data: { companyId, bankTransactionId: transactionId, ...input } }),
    retry: 1,
    onSuccess: () => {
      if (!mounted.current) return;
      toast.success("Coding Memory preference saved");
      void refresh();
    },
  });
  const pending = feedback.isPending || preference.isPending;
  const error = lastOperation === "feedback" ? feedback.error : preference.error;
  if (!available)
    return (
      <p role="status" className="text-xs text-muted-foreground">
        Approved Coding Memory is unavailable until its database update is applied. Bank rules
        remain available.
      </p>
    );
  return (
    <div className="space-y-2 text-xs">
      <p className="text-muted-foreground">
        Coding Memory uses linked, unreversed postings for this bank account and currency. Selecting
        a suggestion does not post or approve an entry.
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            {friendlyAuthError(error)}{" "}
            <Button
              size="sm"
              variant="link"
              disabled={pending}
              onClick={() => {
                if (lastOperation === "feedback" && feedback.variables)
                  feedback.mutate(feedback.variables);
                else if (preference.variables) preference.mutate(preference.variables);
              }}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {suggestions
        .filter((s) => s.historyId)
        .map((s) => (
          <div key={s.historyId!} className="flex flex-wrap items-center gap-2 rounded border p-2">
            <span>
              {[s.accountCode, s.accountName].filter(Boolean).join(" ")} · {s.reason}
              {s.conflictingHistory ? " · conflicting classifications: review" : ""}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={!canCode || pending}
              onClick={() =>
                feedback.mutate({
                  historyId: s.historyId!,
                  state: "accepted",
                  requestId: crypto.randomUUID(),
                  accountId: s.offsetAccountId,
                })
              }
            >
              Use suggestion
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!canCode || pending}
              onClick={() =>
                feedback.mutate({
                  historyId: s.historyId!,
                  state: "rejected",
                  requestId: crypto.randomUUID(),
                  accountId: s.offsetAccountId,
                })
              }
            >
              Reject
            </Button>
          </div>
        ))}
      {preferences.length ? (
        <details>
          <summary className="cursor-pointer">Supporting history and preferences</summary>
          <ul className="space-y-2 pt-2">
            {preferences.map((p) => (
              <li key={p.history_id} className="flex flex-wrap items-center gap-2">
                <span>
                  {p.payee_normalized} → {p.account_code} {p.account_name}: {p.times_used} approved
                  posting(s), {p.direction}, last approved{" "}
                  {new Date(p.last_approved_at).toLocaleDateString()}.{" "}
                  {p.enabled ? "Enabled" : "Disabled"}.
                </span>
                <Link
                  to="/banking/journal/$journalId"
                  params={{ journalId: p.latest_journal_id }}
                  className="underline"
                >
                  View latest posting
                </Link>
                {p.last_feedback ? (
                  <span>
                    Last feedback: {p.last_feedback.state} (
                    {p.last_feedback.posted ? "posted account decision" : "selection only"}).
                  </span>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!canCode || pending}
                  onClick={() =>
                    preference.mutate({ historyId: p.history_id, enabled: !p.enabled })
                  }
                >
                  {p.enabled ? "Disable preference" : "Re-enable preference"}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {pending ? <p role="status">Saving Coding Memory feedback…</p> : null}
    </div>
  );
}

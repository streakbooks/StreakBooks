import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CANCELLATION_REASONS,
  lifecycleEventLabel,
  type CancellationReason,
} from "@/lib/billing/domain/lifecycle";
import {
  cancelSubscription,
  getSubscriptionState,
  reverseCancellation,
  type SubscriptionState,
} from "@/lib/billing/subscription-lifecycle.functions";

const lifecycleKey = (companyId: string) => ["billing-lifecycle", companyId] as const;

function longDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error || typeof error === "string" ? friendlyAuthError(error) : fallback;
}

export function SubscriptionLifecycle({ companyId }: { companyId: string }) {
  const load = useServerFn(getSubscriptionState);
  const query = useQuery({
    queryKey: lifecycleKey(companyId),
    queryFn: () => load({ data: { companyId } }),
    retry: false,
  });
  if (query.isLoading) return null;
  if (query.isError) {
    return <QueryErrorState queries={[query]} title="Could not load subscription lifecycle" />;
  }
  if (!query.data?.status) return null;
  return <LifecyclePanel companyId={companyId} state={query.data} />;
}

function LifecyclePanel({ companyId, state }: { companyId: string; state: SubscriptionState }) {
  const queryClient = useQueryClient();
  const reverse = useServerFn(reverseCancellation);
  const [open, setOpen] = useState(false);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: lifecycleKey(companyId) });
    void queryClient.invalidateQueries({ queryKey: ["billing-overview", companyId] });
  };
  const keep = useMutation({
    mutationFn: () => reverse({ data: { companyId } }),
    onSuccess: () => {
      toast.success("Cancellation withdrawn. Your subscription continues.");
      refresh();
    },
    onError: (error) => toast.error(errorText(error, "The cancellation could not be withdrawn.")),
  });
  const scheduled = state.cancellation;
  const eligibility = state.eligibility;

  return (
    <section
      className="space-y-4 rounded-xl border bg-card px-5 py-4"
      aria-labelledby="lifecycle-heading"
    >
      <h2 id="lifecycle-heading" className="text-base font-semibold">
        Subscription status
      </h2>
      {scheduled ? (
        <div className="flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>
            Your subscription ends on <strong>{longDate(scheduled.effectiveAt)}</strong>. You keep
            full access until then.
          </p>
          {state.canManage && scheduled.reversible ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={keep.isPending}
              onClick={() => keep.mutate()}
            >
              Keep my subscription
            </Button>
          ) : null}
        </div>
      ) : eligibility.allowed ? (
        state.canManage ? (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted-foreground">
              Cancelling keeps full access until {longDate(eligibility.effectiveAt)}.
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
              Cancel subscription
            </Button>
          </div>
        ) : null
      ) : state.status !== "complimentary" ? (
        <p className="text-sm text-muted-foreground">{eligibility.reason}</p>
      ) : null}

      <History state={state} />

      {eligibility.allowed && open ? (
        <CancelDialog
          companyId={companyId}
          state={state}
          effectiveAt={eligibility.effectiveAt}
          onClose={() => setOpen(false)}
          onDone={() => {
            setOpen(false);
            refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function History({ state }: { state: SubscriptionState }) {
  const [expanded, setExpanded] = useState(false);
  if (state.events.length === 0) return null;
  const rows = expanded ? state.events : state.events.slice(0, 3);
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">History</h3>
      <ol className="space-y-1 text-sm">
        {rows.map((event, index) => (
          <li key={`${event.occurredAt}-${index}`} className="flex flex-wrap justify-between gap-2">
            <span>
              {lifecycleEventLabel(event.type)}
              {event.toPlan && event.fromPlan && event.toPlan !== event.fromPlan
                ? ` · ${event.fromPlan} → ${event.toPlan}`
                : ""}
              {event.source === "platform" ? " · by StreakBooks" : ""}
            </span>
            <time className="text-muted-foreground" dateTime={event.occurredAt}>
              {new Date(event.occurredAt).toLocaleString()}
            </time>
          </li>
        ))}
      </ol>
      {state.events.length > 3 ? (
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : `Show all ${state.events.length} events`}
        </button>
      ) : null}
    </div>
  );
}

function CancelDialog({
  companyId,
  state,
  effectiveAt,
  onClose,
  onDone,
}: {
  companyId: string;
  state: SubscriptionState;
  effectiveAt: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const cancel = useServerFn(cancelSubscription);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState<CancellationReason | "">("");
  const [note, setNote] = useState("");
  const immediate = Date.parse(effectiveAt) <= Date.now() + 60_000;
  const mutation = useMutation({
    mutationFn: () =>
      cancel({
        data: {
          companyId,
          confirm: true,
          policyDocumentId: state.policy?.id ?? null,
          reasonCode: reason || null,
          reasonText: note.trim() || null,
        },
      }),
    onSuccess: (result) => {
      toast.success(
        result.status === "effective"
          ? "Your subscription has ended. Records stay available."
          : `Cancellation scheduled for ${longDate(result.effectiveAt)}.${
              result.notice === "sent" ? " A confirmation e-mail is on its way." : ""
            }`,
      );
      onDone();
    },
    onError: (error) => toast.error(errorText(error, "The subscription could not be cancelled.")),
  });

  return (
    <Dialog open onOpenChange={(value) => (!value && !mutation.isPending ? onClose() : null)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cancel subscription</DialogTitle>
          <DialogDescription>
            {immediate
              ? "Your subscription ends now. Records stay available to view and export."
              : `Your subscription ends on ${longDate(effectiveAt)}. You keep full access until then and can withdraw the cancellation before that date. Records stay available afterwards.`}
          </DialogDescription>
        </DialogHeader>
        {state.policy ? (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              {state.policy.title} (version {state.policy.version})
            </h3>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm">
              {state.policy.body}
            </div>
          </div>
        ) : null}
        <div className="space-y-1">
          <Label htmlFor="cancel-reason">Reason (optional)</Label>
          <select
            id="cancel-reason"
            className="flex h-9 w-full rounded-md border bg-transparent px-2 text-sm"
            value={reason}
            onChange={(event) => setReason(event.target.value as CancellationReason | "")}
          >
            <option value="">Prefer not to say</option>
            {/* lookup-fixed-enum: Cancellation reason is a fixed presentation enumeration. */}
            {CANCELLATION_REASONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="cancel-note">Anything we should know? (optional)</Label>
          <Textarea
            id="cancel-note"
            maxLength={1000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={confirmed}
            onCheckedChange={(value) => setConfirmed(value === true)}
            aria-label="Confirm cancellation"
          />
          <span>
            {state.policy
              ? `I have read the ${state.policy.title} and want to cancel.`
              : "I understand that my subscription will end and want to cancel."}
          </span>
        </label>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>
            Keep subscription
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={!confirmed || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Cancelling…" : "Cancel subscription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

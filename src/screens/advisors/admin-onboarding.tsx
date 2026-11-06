import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsSubnav } from "@/components/advisors/AdvisorsSubnav";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listAdvisorsOnboarding,
  setAdvisorsOnboardingTask,
} from "@/lib/advisors/engagements.functions";
import type { AdvisorsOnboardingTaskStatus } from "@/lib/advisors/engagements";
import { friendlyAuthError } from "@/lib/auth-helpers";

export function AdvisorsAdminOnboardingPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdvisorsOnboarding);
  const setTask = useServerFn(setAdvisorsOnboardingTask);
  const [reason, setReason] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["advisors-onboarding"],
    queryFn: () => list({ data: {} }),
    retry: false,
  });

  const selected = query.data?.find((item) => item.id === selectedId) ?? query.data?.[0] ?? null;

  const updateM = useMutation({
    mutationFn: (input: { taskId: string; status: AdvisorsOnboardingTaskStatus }) =>
      setTask({
        data: {
          taskId: input.taskId,
          status: input.status,
          reason: reason || `Marked onboarding task ${input.status}`,
        },
      }),
    onSuccess: async () => {
      toast.success("Onboarding task updated");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["advisors-onboarding"] });
      await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
      await qc.invalidateQueries({ queryKey: ["advisors-engagements"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <PageHeader title="Onboarding" description="Track Advisors customer onboarding tasks." />
        <ErrorState
          title="Onboarding unavailable"
          description={friendlyAuthError(query.error)}
          onRetry={() => void query.refetch()}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <PageHeader
        title="Onboarding"
        description="Progress checklist after agreement acceptance. Completing all tasks moves the engagement to active. Paid subscription start remains AD-07."
      />
      <AdvisorsSubnav />

      <div className="space-y-1">
        <Label htmlFor="onboarding-reason">Change reason</Label>
        <Input
          id="onboarding-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why are you updating this task?"
          className="max-w-xl"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <section className="space-y-2">
          {query.data.length === 0 ? (
            <EmptyState
              title="No onboarding in progress"
              description="Customers enter onboarding after accepting a service agreement."
            />
          ) : (
            query.data.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-xl border p-4 text-left transition ${
                  selected?.id === item.id
                    ? "border-primary bg-primary/5"
                    : "border-border/70 hover:border-primary/40"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {item.clientName || item.clientEmail}
                    </p>
                  </div>
                  <Badge variant="secondary">{item.status}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.onboardingDone ?? 0}/{item.onboardingTotal ?? item.tasks.length} tasks
                  complete · {item.serviceCode}
                </p>
              </button>
            ))
          )}
        </section>

        <section className="space-y-3 rounded-xl border border-border/70 p-4">
          {!selected ? (
            <EmptyState
              title="Select an engagement"
              description="Choose an onboarding engagement to update task status."
            />
          ) : (
            <>
              <div>
                <h2 className="font-semibold">{selected.title}</h2>
                <p className="text-sm text-muted-foreground">
                  {selected.clientName || selected.clientEmail} · {selected.status}
                </p>
              </div>
              <ul className="space-y-3">
                {selected.tasks.map((task) => (
                  <li key={task.id} className="rounded-lg border border-border/50 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{task.title}</p>
                        <p className="text-sm text-muted-foreground">{task.description}</p>
                        {task.requiresDocument ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Document requested: {task.documentLabel || "Customer upload"}
                          </p>
                        ) : null}
                      </div>
                      <Badge variant="outline">{task.status}</Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(["in_progress", "blocked", "done", "skipped"] as const).map((next) => (
                        <Button
                          key={next}
                          type="button"
                          size="sm"
                          variant={task.status === next ? "default" : "outline"}
                          disabled={updateM.isPending}
                          onClick={() => updateM.mutate({ taskId: task.id, status: next })}
                        >
                          {next}
                        </Button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

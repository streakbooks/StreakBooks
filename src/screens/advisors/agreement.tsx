import { useState } from "react";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  acceptPublicAdvisorsAgreement,
  getPublicAdvisorsAgreement,
} from "@/lib/advisors/engagements.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState } from "@/components/common/states";

export function AdvisorsAgreementPage({ token }: { token: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getPublicAdvisorsAgreement);
  const accept = useServerFn(acceptPublicAdvisorsAgreement);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);

  const query = useQuery({
    queryKey: ["advisors-public-agreement", token],
    queryFn: () => load({ data: { token } }),
    retry: false,
  });

  const acceptM = useMutation({
    mutationFn: () =>
      accept({
        data: { token, name, email, consent: true as const },
      }),
    onSuccess: async () => {
      toast.success("Agreement accepted. Onboarding can begin.");
      await qc.invalidateQueries({ queryKey: ["advisors-public-agreement", token] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <QueryErrorState queries={[query]} title="Agreement unavailable" />
      </main>
    );
  }
  if (!query.isSuccess || !query.data) return null;
  const agreement = query.data;
  const open = agreement.status === "presented";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          StreakBooks Advisors
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{agreement.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {agreement.engagementTitle || "Service agreement"}
          {agreement.serviceCode ? ` · ${agreement.serviceCode}` : ""}
        </p>
      </div>

      <section className="rounded-xl border border-border/70 p-5">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{agreement.bodyText}</pre>
      </section>

      {!open ? (
        <section className="rounded-xl border border-border/70 p-5">
          <p className="font-medium">Status: {agreement.status}</p>
          {agreement.acceptedAt ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Accepted by {agreement.acceptedName} on{" "}
              {new Date(agreement.acceptedAt).toLocaleString()}. Onboarding tasks are ready for your
              advisor. No paid subscription was started by this acceptance.
            </p>
          ) : null}
        </section>
      ) : (
        <section className="space-y-3 rounded-xl border border-border/70 p-5">
          <h2 className="font-semibold">Accept agreement</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="agreement-name">Full legal name</Label>
              <Input
                id="agreement-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="agreement-email">Email</Label>
              <Input
                id="agreement-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              I have read these terms and explicitly consent to StreakBooks Advisors beginning
              onboarding for the selected service. I understand this does not by itself start a paid
              subscription.
            </span>
          </label>
          <Button
            type="button"
            disabled={acceptM.isPending || !consent || !name || !email}
            onClick={() => acceptM.mutate()}
          >
            Accept and start onboarding
          </Button>
        </section>
      )}
    </main>
  );
}

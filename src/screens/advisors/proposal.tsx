import { useState } from "react";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getPublicAdvisorsProposal,
  respondPublicAdvisorsProposal,
} from "@/lib/advisors/engagements.functions";
import { agreementPublicPath, formatAdvisorsMoney } from "@/lib/advisors/engagements";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState } from "@/components/common/states";

export function AdvisorsProposalPage({ token }: { token: string }) {
  const qc = useQueryClient();
  const load = useServerFn(getPublicAdvisorsProposal);
  const respond = useServerFn(respondPublicAdvisorsProposal);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");

  const query = useQuery({
    queryKey: ["advisors-public-proposal", token],
    queryFn: () => load({ data: { token } }),
    retry: false,
  });

  const respondM = useMutation({
    mutationFn: (decision: "accept" | "decline") =>
      respond({
        data: { token, decision, name, email, note: note || undefined },
      }),
    onSuccess: async (proposal) => {
      await qc.invalidateQueries({ queryKey: ["advisors-public-proposal", token] });
      if (proposal.status === "accepted" && proposal.agreementToken) {
        toast.success("Proposal accepted. Continue to the service agreement.");
        window.location.href = agreementPublicPath(proposal.agreementToken);
        return;
      }
      toast.success(proposal.status === "declined" ? "Proposal declined" : "Response recorded");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <QueryErrorState queries={[query]} title="Proposal unavailable" />
      </main>
    );
  }
  if (!query.isSuccess || !query.data) return null;
  const proposal = query.data;
  const open = proposal.status === "sent";

  return (
    <main className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold tracking-[0.16em] text-primary uppercase">
          StreakBooks Advisors
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{proposal.title}</h1>
        <p className="mt-2 text-muted-foreground">
          {proposal.engagementTitle || "Service proposal"} · {proposal.serviceCode}
          {proposal.planCode ? ` · ${proposal.planCode}` : ""}
        </p>
      </div>

      <section className="space-y-3 rounded-xl border border-border/70 p-5">
        <p className="text-2xl font-semibold">
          {formatAdvisorsMoney(proposal.amountMinor, proposal.currency)}
          {proposal.billingInterval ? (
            <span className="text-base font-normal text-muted-foreground">
              {" "}
              / {proposal.billingInterval}
            </span>
          ) : null}
        </p>
        {proposal.summary ? <p className="whitespace-pre-wrap">{proposal.summary}</p> : null}
        {proposal.scopeText ? (
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase">Scope</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm">{proposal.scopeText}</p>
          </div>
        ) : null}
        {proposal.exclusionsText ? (
          <div>
            <h2 className="text-sm font-semibold tracking-wide uppercase">Exclusions</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">
              {proposal.exclusionsText}
            </p>
          </div>
        ) : null}
        {proposal.validUntil ? (
          <p className="text-xs text-muted-foreground">
            Valid until {new Date(proposal.validUntil).toLocaleString()}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Accepting this proposal does not charge a card or start a paid subscription.
        </p>
      </section>

      {!open ? (
        <section className="rounded-xl border border-border/70 p-5">
          <p className="font-medium">Status: {proposal.status}</p>
          {proposal.agreementToken ? (
            <Button asChild className="mt-3">
              <a href={agreementPublicPath(proposal.agreementToken)}>Open service agreement</a>
            </Button>
          ) : null}
        </section>
      ) : (
        <section className="space-y-3 rounded-xl border border-border/70 p-5">
          <h2 className="font-semibold">Your response</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="proposal-name">Full name</Label>
              <Input
                id="proposal-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="proposal-email">Email</Label>
              <Input
                id="proposal-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="proposal-note">Note (optional)</Label>
              <Textarea
                id="proposal-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={3}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={respondM.isPending || !name || !email}
              onClick={() => respondM.mutate("accept")}
            >
              Accept proposal
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={respondM.isPending || !name || !email}
              onClick={() => respondM.mutate("decline")}
            >
              Decline
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}

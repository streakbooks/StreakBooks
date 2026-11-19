import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normaliseReferralCode, REFERRAL_STORAGE_KEY } from "@/lib/billing/domain/partners";
import { getReferralStatus, recordReferral } from "@/lib/billing/partner-program.functions";

function storedCode(): string {
  try {
    return normaliseReferralCode(window.localStorage.getItem(REFERRAL_STORAGE_KEY)) ?? "";
  } catch {
    return "";
  }
}

/** Customers link their organisation to a CA partner after reading the partner disclosure. */
export function ReferralPanel({ companyId }: { companyId: string }) {
  const load = useServerFn(getReferralStatus);
  const save = useServerFn(recordReferral);
  const queryClient = useQueryClient();
  const queryKey = ["billing-referral", companyId] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => load({ data: { companyId } }),
    retry: false,
  });
  const [code, setCode] = useState("");
  const [accepted, setAccepted] = useState(false);
  useEffect(() => setCode((current) => current || storedCode()), []);
  const mutation = useMutation({
    mutationFn: () => {
      const disclosure = query.data?.disclosure;
      const normalised = normaliseReferralCode(code);
      if (!disclosure || !normalised) throw new Error("Enter the partner's referral code.");
      if (!accepted) throw new Error("Confirm you have read the partner disclosure.");
      return save({
        data: { companyId, code: normalised, disclosureId: disclosure.id, accepted: true },
      });
    },
    onSuccess: (result) => {
      try {
        window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
      } catch {
        // Storage may be unavailable; the referral itself is saved.
      }
      toast.success(
        result.result === "attributed"
          ? `Linked to ${result.partnerName}.`
          : "Your organisation stays linked to its existing partner.",
      );
      setAccepted(false);
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "The referral could not be saved."),
  });

  if (query.isError) {
    return <QueryErrorState queries={[query]} title="Could not load referral status" />;
  }
  const data = query.data;
  if (!data || (!data.programOpen && !data.attribution)) return null;
  const locked = data.attribution?.locked && data.attribution.status === "active";
  return (
    <section
      className="space-y-3 rounded-xl border bg-card px-5 py-4"
      aria-labelledby="referral-heading"
    >
      <h2 id="referral-heading" className="text-base font-semibold">
        Accountant referral
      </h2>
      {data.attribution ? (
        <p className="text-sm">
          {data.attribution.status === "active"
            ? `Referred by ${data.attribution.partnerName} on ${new Date(
                data.attribution.attributedAt,
              ).toLocaleDateString()}.`
            : `A referral from ${data.attribution.partnerName} has ended.`}
        </p>
      ) : null}
      {data.programOpen && data.disclosure && !locked ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <label className="block max-w-xs text-sm">
            Referral code from your accountant
            <Input
              className="mt-1"
              value={code}
              autoComplete="off"
              onChange={(event) => setCode(event.target.value.toUpperCase())}
            />
          </label>
          <details className="rounded-md border px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">
              {data.disclosure.title} (version {data.disclosure.version})
            </summary>
            <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{data.disclosure.body}</p>
          </details>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            I have read the partner disclosure and agree to link this organisation to the partner.
          </label>
          <Button type="submit" size="sm" disabled={mutation.isPending || !accepted || !code}>
            Link partner
          </Button>
        </form>
      ) : null}
    </section>
  );
}

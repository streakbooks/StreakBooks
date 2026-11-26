import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listFirmPartnerTiers, saveFirmPartnerTier } from "@/lib/firm/partner-tiers.functions";

export function FirmPartnerTiersAdmin({ canEdit }: { canEdit: boolean }) {
  const list = useServerFn(listFirmPartnerTiers);
  const save = useServerFn(saveFirmPartnerTier);
  const query = useQuery({
    queryKey: ["platform-firm-partner-tiers"],
    queryFn: () => list(),
    retry: false,
  });
  const [tierCode, setTierCode] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [discount, setDiscount] = useState("0");
  const mutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          tierCode,
          minimumActivePaidClients: Number(minimum),
          discountBps: Math.round(Number(discount) * 100),
        },
      }),
    onSuccess: () => {
      toast.success("Partner tier saved.");
      setTierCode("");
      void query.refetch();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-lg font-semibold">Advisor partner tiers</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Tiers count active paid clients with a company member sign-in in the last 120 days. Trials
          and dormant clients do not count. Discounts are owner-configured and shown here as a
          percentage.
        </p>
      </div>
      {query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load partner tiers" />
      ) : null}
      {query.isLoading ? <p className="text-sm text-muted-foreground">Loading tiers…</p> : null}
      {query.data?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th className="py-2 pr-4 font-medium">Tier</th>
                <th className="py-2 pr-4 font-medium">Active paid clients</th>
                <th className="py-2 font-medium">Discount</th>
              </tr>
            </thead>
            <tbody>
              {query.data.map((tier) => (
                <tr className="border-b last:border-0" key={tier.tier_code}>
                  <td className="py-2 pr-4 font-medium">{tier.tier_code}</td>
                  <td className="py-2 pr-4">{tier.minimum_active_paid_clients}</td>
                  <td className="py-2">{(tier.discount_bps / 100).toLocaleString()}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {canEdit ? (
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="firm-tier-code">Tier code</Label>
            <Input
              id="firm-tier-code"
              required
              minLength={2}
              maxLength={32}
              value={tierCode}
              onChange={(event) => setTierCode(event.target.value)}
              placeholder="silver"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="firm-tier-clients">Minimum active paid clients</Label>
            <Input
              id="firm-tier-clients"
              type="number"
              min="0"
              step="1"
              required
              value={minimum}
              onChange={(event) => setMinimum(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="firm-tier-discount">Discount percent</Label>
            <Input
              id="firm-tier-discount"
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
            />
          </div>
          <Button className="sm:col-span-3 sm:w-fit" type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save partner tier"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}

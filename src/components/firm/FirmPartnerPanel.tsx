import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { LookupSelect } from "@/components/lookup";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMinorAmount } from "@/lib/billing/domain/money";
import { referralLink } from "@/lib/billing/domain/partners";
import { listPublishedLegalDocuments } from "@/lib/billing/legal-documents.functions";
import {
  applyAsPartner,
  createReferralCode,
  disableReferralCode,
  getPartnerPortal,
  type PartnerPortal,
} from "@/lib/billing/partner-program.functions";
import { ISO_COUNTRIES } from "@/lib/billing/reference/iso-reference-data";

const queryKey = ["partner-portal"] as const;
const COUNTRY_OPTIONS = ISO_COUNTRIES.map((item) => ({
  id: item.code,
  label: item.name,
  code: item.code,
}));
const ENTRY_LABEL: Record<string, string> = {
  accrual: "Commission",
  reversal: "Refund reversal",
  adjustment: "Adjustment",
  payout: "Payout",
  payout_cancelled: "Payout cancelled",
};

function money(minor: number, currency: string): string {
  return formatMinorAmount(BigInt(minor), currency);
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function FirmPartnerPanel({ firmId, canManage }: { firmId: string; canManage: boolean }) {
  const load = useServerFn(getPartnerPortal);
  const query = useQuery({ queryKey, queryFn: () => load(), retry: false });
  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (query.isError) {
    return <QueryErrorState queries={[query]} title="Could not load partner programme" />;
  }
  const portal = query.data;
  if (!portal) return null;
  const partner = portal.partners.find((item) => item.firmId === firmId);
  return (
    <section className="space-y-4" aria-labelledby="partner-heading">
      <header className="space-y-1">
        <h2 id="partner-heading" className="text-lg font-semibold">
          Partner programme
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Approved partners share referral links. Customers see a disclosure before they link their
          organisation. Commission is recorded when referred customers pay and is reversed when they
          are refunded.{" "}
          {portal.program.payoutsEnabled
            ? "Payouts are made manually after approval."
            : "Payouts are not enabled yet."}
        </p>
      </header>
      {partner ? (
        <PartnerDetails partner={partner} />
      ) : canManage ? (
        <ApplyForm firmId={firmId} />
      ) : (
        <p className="text-sm text-muted-foreground">
          A firm owner or admin can apply to join the partner programme.
        </p>
      )}
    </section>
  );
}

function ApplyForm({ firmId }: { firmId: string }) {
  const listDocs = useServerFn(listPublishedLegalDocuments);
  const apply = useServerFn(applyAsPartner);
  const queryClient = useQueryClient();
  const docs = useQuery({
    queryKey: ["published-legal-documents"],
    queryFn: () => listDocs(),
    retry: false,
  });
  const terms = (docs.data ?? []).find((doc) => doc.kind === "PARTNER_TERMS");
  const [form, setForm] = useState({ email: "", country: "IN", membership: "", accepted: false });
  const mutation = useMutation({
    mutationFn: () => {
      if (!terms) throw new Error("The partner terms are not published yet.");
      if (!form.accepted) throw new Error("Accept the partner terms to apply.");
      return apply({
        data: {
          firmId,
          contactEmail: form.email,
          countryCode: form.country,
          membershipReference: form.membership,
          termsId: terms.id,
          accepted: true,
        },
      });
    },
    onSuccess: () => {
      toast.success("Application sent. LinkBooks will verify your details.");
      void queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => toast.error(errorText(error, "The application could not be sent.")),
  });
  if (docs.isLoading) return <p className="text-sm text-muted-foreground">Loading terms…</p>;
  if (!terms) {
    return (
      <p className="text-sm text-muted-foreground">
        The partner programme is not accepting applications yet.
      </p>
    );
  }
  return (
    <form
      className="grid max-w-2xl gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <label className="text-sm">
        Contact email
        <Input
          className="mt-1"
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </label>
      <label className="text-sm">
        Country
        <LookupSelect
          options={COUNTRY_OPTIONS}
          value={form.country}
          onChange={(id) => setForm({ ...form, country: id })}
          ariaLabel="Country"
          allowClear={false}
        />
      </label>
      <label className="text-sm sm:col-span-2">
        Professional membership (for example ICAI membership number)
        <Input
          className="mt-1"
          value={form.membership}
          maxLength={60}
          onChange={(e) => setForm({ ...form, membership: e.target.value })}
        />
      </label>
      <details className="rounded-md border px-3 py-2 text-sm sm:col-span-2">
        <summary className="cursor-pointer font-medium">
          {terms.title} (version {terms.version})
        </summary>
        <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{terms.body}</p>
      </details>
      <label className="flex items-start gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          className="mt-1"
          checked={form.accepted}
          onChange={(e) => setForm({ ...form, accepted: e.target.checked })}
        />
        I accept the partner terms on behalf of this firm.
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={mutation.isPending || !form.accepted || !form.email}>
          Apply
        </Button>
      </div>
    </form>
  );
}

function PartnerDetails({ partner }: { partner: PartnerPortal["partners"][number] }) {
  const create = useServerFn(createReferralCode);
  const disable = useServerFn(disableReferralCode);
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey });
  const createM = useMutation({
    mutationFn: () => create({ data: { partnerId: partner.id } }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorText(error, "The code could not be created.")),
  });
  const disableM = useMutation({
    mutationFn: (codeId: string) => disable({ data: { codeId } }),
    onSuccess: refresh,
    onError: (error) => toast.error(errorText(error, "The code could not be disabled.")),
  });
  const isAdmin = partner.role === "admin";
  return (
    <div className="space-y-5">
      <p className="flex items-center gap-2 text-sm">
        <Badge variant={partner.status === "approved" ? "success" : "secondary"}>
          {partner.status}
        </Badge>
        {partner.status === "pending" ? "LinkBooks is verifying your application." : null}
        {partner.status === "suspended" ? "New commission is paused." : null}
      </p>
      {partner.status === "approved" ? (
        <div className="space-y-2">
          <h3 className="font-medium">Referral links</h3>
          <ul className="space-y-1 text-sm">
            {partner.codes.map((code) => {
              const link = referralLink(window.location.origin, code.code);
              return (
                <li key={code.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{code.code}</span>
                  {code.status === "active" ? (
                    <>
                      <span className="text-muted-foreground">{link}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          void navigator.clipboard
                            .writeText(link)
                            .then(() => toast.success("Link copied."))
                        }
                      >
                        Copy link
                      </Button>
                      {isAdmin ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={disableM.isPending}
                          onClick={() => disableM.mutate(code.id)}
                        >
                          Disable
                        </Button>
                      ) : null}
                    </>
                  ) : (
                    <Badge variant="secondary">disabled</Badge>
                  )}
                </li>
              );
            })}
          </ul>
          {isAdmin ? (
            <Button size="sm" disabled={createM.isPending} onClick={() => createM.mutate()}>
              New referral code
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="space-y-1">
        <h3 className="font-medium">Balances</h3>
        {partner.balances.length === 0 ? (
          <p className="text-sm text-muted-foreground">No commission yet.</p>
        ) : (
          <ul className="text-sm">
            {partner.balances.map((balance) => (
              <li key={balance.currency}>
                {balance.currency}: available {money(balance.availableMinor, balance.currency)}, on
                hold {money(balance.pendingMinor, balance.currency)}, in payout{" "}
                {money(balance.inPayoutMinor, balance.currency)}, paid{" "}
                {money(balance.paidOutMinor, balance.currency)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="font-medium">Referred organisations</h3>
        {partner.referrals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No referrals yet.</p>
        ) : (
          <ul className="text-sm">
            {partner.referrals.map((referral) => (
              <li key={`${referral.companyName}-${referral.attributedAt}`}>
                {referral.companyName} · {new Date(referral.attributedAt).toLocaleDateString()} ·{" "}
                {referral.status === "ended"
                  ? "ended"
                  : referral.locked
                    ? "paying"
                    : "not yet paid"}
              </li>
            ))}
          </ul>
        )}
      </div>
      {partner.entries.length ? (
        <table className="w-full text-sm">
          <caption className="text-left font-medium">Commission ledger</caption>
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1">Date</th>
              <th>Entry</th>
              <th>Organisation</th>
              <th className="text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {partner.entries.map((entry) => (
              <tr key={entry.id} className="border-t">
                <td className="py-1">{new Date(entry.createdAt).toLocaleDateString()}</td>
                <td>
                  {ENTRY_LABEL[entry.type] ?? entry.type}
                  {entry.memo ? ` · ${entry.memo}` : ""}
                </td>
                <td>{entry.companyName ?? ""}</td>
                <td className="text-right">{money(entry.amountMinor, entry.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {partner.payouts.length ? (
        <div className="space-y-1">
          <h3 className="font-medium">Payouts</h3>
          <ul className="text-sm">
            {partner.payouts.map((payout) => (
              <li key={payout.id}>
                {money(payout.amountMinor, payout.currency)} · {payout.status}
                {payout.paymentReference ? ` · ref ${payout.paymentReference}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

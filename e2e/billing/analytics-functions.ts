// In-memory browser adapter; the figures themselves are verified by billing-10-analytics.sql.
const params = new URLSearchParams(location.search);

export async function getBillingAnalytics({ data }: { data: { from: string; to: string } }) {
  if (params.has("error")) throw new Error("Platform permission billing.view is required");
  const empty = params.has("empty");
  return {
    range: data,
    generatedAt: "2026-11-05T00:00:00Z",
    subscriptions: {
      byStatus: empty ? {} : { active: 2, trialing: 1 },
      byPlan: empty ? {} : { pro: 2 },
      byCountry: empty ? {} : { IN: 2 },
    },
    mrr: empty ? [] : [{ currency: "INR", mrrMinor: 99900, arrMinor: 1198800, subscriptions: 1 }],
    movements: empty ? [] : [{ currency: "INR", movement: "new", count: 1, deltaMinor: 99900 }],
    lastMrrCapture: empty ? null : "2026-11-04T00:00:00Z",
    revenue: empty
      ? []
      : [
          {
            currency: "INR",
            invoices: 2,
            grossMinor: 199800,
            netMinor: 169322,
            taxMinor: 30478,
            discountMinor: 9990,
            creditNotes: 1,
            creditedMinor: 49950,
            creditedNetMinor: 42331,
            creditedTaxMinor: 7619,
            refundsMinor: 49950,
          },
        ],
    lifecycle: {
      trialsStarted: empty ? 0 : 3,
      trialsExpired: 0,
      activations: empty ? 0 : 2,
      renewals: empty ? 0 : 1,
      failedPayments: empty ? 0 : 1,
      cancellationsRequested: empty ? 0 : 4,
      cancellationsReversed: empty ? 0 : 1,
      cancelled: 0,
      cancellationReasons: empty ? {} : { too_expensive: 3, not_given: 1 },
    },
    coupons: empty ? [] : [{ code: "LAUNCH10", redemptions: 1 }],
    partners: {
      activeReferrals: empty ? 0 : 1,
      commission: empty
        ? []
        : [
            {
              currency: "INR",
              accruedMinor: 8466,
              reversedMinor: -4233,
              adjustedMinor: 0,
              paidOutMinor: 0,
            },
          ],
    },
    webhooks: {
      received: empty ? 0 : 12,
      backlog: 0,
      dead: params.has("dead") ? 2 : 0,
      oldestBacklogAt: null,
    },
    invoicesPending: 0,
  };
}

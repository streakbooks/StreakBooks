/**
 * Marketplace analytics event helpers (XP-07 foundation).
 * Persistence uses record_marketplace_analytics_event when migration is applied.
 */

export const MARKETPLACE_ANALYTICS_EVENTS = [
  "catalogue_view",
  "app_detail_view",
  "install_requested",
  "search",
  "category_browse",
] as const;

export type MarketplaceAnalyticsEvent = (typeof MARKETPLACE_ANALYTICS_EVENTS)[number];

export function buildMarketplaceAnalyticsPayload(input: {
  event: MarketplaceAnalyticsEvent;
  appCode?: string | null;
  query?: string | null;
  category?: string | null;
}): Record<string, string> {
  const payload: Record<string, string> = { event: input.event };
  if (input.appCode) payload["appCode"] = input.appCode;
  if (input.query) payload["query"] = input.query.slice(0, 120);
  if (input.category) payload["category"] = input.category;
  return payload;
}

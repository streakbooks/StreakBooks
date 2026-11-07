export {
  assertRealDataAccessAllowed,
  canActivateMarketplaceApp,
  evaluateActivation,
  marketplaceAppActivationGates,
  type ActivationDecision,
  type ActivationSecurityGates,
} from "@/lib/app-store/security/activation";
export {
  evaluateSecurityReview,
  SECURITY_REVIEW_CHECKLIST,
  type SecurityReviewDecision,
} from "@/lib/app-store/security/approval";
export {
  deriveCatalogueFingerprint,
  issueBotChallenge,
  validateBotChallenge,
} from "@/lib/app-store/security/bot-challenge";
export {
  assertNoServiceRoleEnvLeak,
  sanitizeAuditDetails,
} from "@/lib/app-store/security/client-guards";
export { decideConsentGrant, type ConsentGrantDecision } from "@/lib/app-store/security/consent";
export {
  evaluateRateLimit,
  scoreSuspiciousActivity,
  type RateLimitDecision,
} from "@/lib/app-store/security/rate-limit";
export {
  assertSameCompany,
  CrossTenantAccessError,
  detectDangerousScopeEscalation,
  filterToCompany,
} from "@/lib/app-store/security/tenant-isolation";
export {
  containsRawTokenMaterial,
  respondToTokenCompromise,
} from "@/lib/app-store/security/token-compromise";
export {
  validateWebhookEnvelope,
  type WebhookPayloadValidation,
} from "@/lib/app-store/security/webhook-payload";
export {
  buildMarketplaceAbuseAlert,
  type MarketplaceAlertDraft,
  type MarketplaceAlertType,
} from "@/lib/app-store/security/abuse-alert";


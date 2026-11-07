/** Marketplace trust, certification and compatibility helpers (XP-04, XP-09, XP-10). */

export const CERTIFICATION_STATUSES = [
  "none",
  "candidate",
  "certified",
  "recertification_due",
  "revoked",
] as const;

export type CertificationStatus = (typeof CERTIFICATION_STATUSES)[number];

export type MarketplaceTrustFields = {
  publisherVerified: boolean;
  certificationStatus: CertificationStatus;
  certificationTier: string | null;
  certificationExpiresAt: string | null;
  privacyDisclosure: string | null;
  suspended: boolean;
  apiVersion: string;
  minLinkbooksApi: string | null;
  deprecationAt: string | null;
  breakingChangeNotes: string | null;
};

export const DEFAULT_TRUST_FIELDS: MarketplaceTrustFields = {
  publisherVerified: false,
  certificationStatus: "none",
  certificationTier: null,
  certificationExpiresAt: null,
  privacyDisclosure: null,
  suspended: false,
  apiVersion: "v1",
  minLinkbooksApi: null,
  deprecationAt: null,
  breakingChangeNotes: null,
};

export function certificationLabel(status: CertificationStatus): string {
  switch (status) {
    case "none":
      return "Not certified";
    case "candidate":
      return "Certification candidate";
    case "certified":
      return "LinkBooks Certified";
    case "recertification_due":
      return "Recertification due";
    case "revoked":
      return "Certification revoked";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function isCertified(status: CertificationStatus): boolean {
  return status === "certified";
}

export function hasCompatibilityWarning(trust: MarketplaceTrustFields): boolean {
  return Boolean(trust.deprecationAt || trust.breakingChangeNotes);
}

export function parseTrustFields(row: Record<string, unknown>): MarketplaceTrustFields {
  const statusRaw = row["certificationStatus"] ?? row["certification_status"];
  const certificationStatus = CERTIFICATION_STATUSES.includes(statusRaw as CertificationStatus)
    ? (statusRaw as CertificationStatus)
    : "none";
  return {
    publisherVerified: Boolean(row["publisherVerified"] ?? row["publisher_verified"] ?? false),
    certificationStatus,
    certificationTier:
      typeof row["certificationTier"] === "string"
        ? row["certificationTier"]
        : typeof row["certification_tier"] === "string"
          ? row["certification_tier"]
          : null,
    certificationExpiresAt:
      typeof row["certificationExpiresAt"] === "string"
        ? row["certificationExpiresAt"]
        : typeof row["certification_expires_at"] === "string"
          ? row["certification_expires_at"]
          : null,
    privacyDisclosure:
      typeof row["privacyDisclosure"] === "string"
        ? row["privacyDisclosure"]
        : typeof row["privacy_disclosure"] === "string"
          ? row["privacy_disclosure"]
          : null,
    suspended: Boolean(row["suspended"] ?? false),
    apiVersion:
      typeof row["apiVersion"] === "string"
        ? row["apiVersion"]
        : typeof row["api_version"] === "string"
          ? row["api_version"]
          : "v1",
    minLinkbooksApi:
      typeof row["minLinkbooksApi"] === "string"
        ? row["minLinkbooksApi"]
        : typeof row["min_linkbooks_api"] === "string"
          ? row["min_linkbooks_api"]
          : null,
    deprecationAt:
      typeof row["deprecationAt"] === "string"
        ? row["deprecationAt"]
        : typeof row["deprecation_at"] === "string"
          ? row["deprecation_at"]
          : null,
    breakingChangeNotes:
      typeof row["breakingChangeNotes"] === "string"
        ? row["breakingChangeNotes"]
        : typeof row["breaking_change_notes"] === "string"
          ? row["breaking_change_notes"]
          : null,
  };
}

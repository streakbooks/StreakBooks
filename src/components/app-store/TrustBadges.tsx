import { Badge } from "@/components/ui/badge";
import {
  certificationLabel,
  hasCompatibilityWarning,
  isCertified,
  type MarketplaceTrustFields,
} from "@/lib/app-store/trust";

export function TrustBadges({ trust }: { trust: MarketplaceTrustFields }) {
  return (
    <div className="flex flex-wrap gap-1">
      {trust.publisherVerified ? (
        <Badge variant="outline">Verified publisher</Badge>
      ) : (
        <Badge variant="secondary">Unverified publisher</Badge>
      )}
      {isCertified(trust.certificationStatus) ? (
        <Badge>LinkBooks Certified</Badge>
      ) : (
        <Badge variant="secondary">{certificationLabel(trust.certificationStatus)}</Badge>
      )}
      {trust.suspended ? <Badge variant="destructive">Suspended</Badge> : null}
      {hasCompatibilityWarning(trust) ? (
        <Badge variant="outline">Compatibility notice</Badge>
      ) : null}
      <Badge variant="outline">API {trust.apiVersion}</Badge>
    </div>
  );
}

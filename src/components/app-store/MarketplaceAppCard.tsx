import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrustBadges } from "@/components/app-store/TrustBadges";
import type { MarketplaceAppDefinition } from "@/lib/app-store/catalogue";
import { connectorStatusLabel } from "@/lib/app-store/connector-status";
import { cn } from "@/lib/utils";

export function MarketplaceAppCard({
  app,
  className,
}: {
  app: MarketplaceAppDefinition;
  className?: string;
}) {
  return (
    <Link
      to="/app-store/apps/$appCode"
      params={{ appCode: app.code }}
      className={cn(
        "block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Card className="h-full transition-colors hover:border-primary/40">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-lg">{app.name}</CardTitle>
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">
                {app.kind === "native"
                  ? "Native"
                  : app.kind === "partner_api"
                    ? "Partner API"
                    : "Hybrid"}
              </Badge>
              <Badge variant="secondary">{connectorStatusLabel(app.implementationStatus)}</Badge>
            </div>
          </div>
          <CardDescription>{app.headline}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <TrustBadges trust={app} />
          <p className="text-sm text-muted-foreground line-clamp-3">{app.description}</p>
          <p className="text-xs text-muted-foreground">
            {app.publisherName}
            {app.nativePriority != null ? ` · Native priority ${app.nativePriority}` : null}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

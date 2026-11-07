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
  const realDataLocked = !app.realCustomerDataEnabled;

  return (
    <Link
      to="/app-store/apps/$appCode"
      params={{ appCode: app.code }}
      className={cn(
        "group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Card
        className={cn(
          "h-full overflow-hidden border-border/80 bg-card/90 backdrop-blur-[2px]",
          "transition-[border-color,transform,box-shadow] duration-300",
          "motion-safe:group-hover:-translate-y-0.5 group-hover:border-primary/35",
          "group-hover:shadow-[0_12px_40px_-24px_color-mix(in_oklch,var(--primary)_45%,transparent)]",
        )}
      >
        <div
          aria-hidden
          className="h-1 w-full bg-gradient-to-r from-primary/70 via-info/40 to-transparent opacity-80 transition-opacity group-hover:opacity-100"
        />
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-lg tracking-tight">{app.name}</CardTitle>
            <div className="flex flex-wrap justify-end gap-1">
              <Badge variant="outline">
                {app.kind === "native"
                  ? "Native"
                  : app.kind === "partner_api"
                    ? "Partner API"
                    : "Hybrid"}
              </Badge>
              <Badge variant="secondary">{connectorStatusLabel(app.implementationStatus)}</Badge>
              {realDataLocked ? (
                <Badge variant="outline" className="border-warning/40 text-warning-ink">
                  Data locked
                </Badge>
              ) : null}
            </div>
          </div>
          <CardDescription className="leading-relaxed">{app.headline}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <TrustBadges trust={app} />
          <p className="text-sm text-muted-foreground line-clamp-3">{app.description}</p>
          <p className="text-xs text-muted-foreground">
            {app.publisherName}
            {app.nativePriority != null ? ` · Native priority ${app.nativePriority}` : null}
            {app.securityReviewPassed ? " · Security review passed" : " · Security review pending"}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}

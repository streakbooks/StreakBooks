import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DeveloperPortalSectionShell } from "@/screens/developer/portal-section";

export function DeveloperSupportPage() {
  return (
    <DeveloperPortalSectionShell
      sectionKey="support"
      description="Support channels for publishers integrating with the LinkBooks public API."
      alertTitle="Support without credential exposure"
      alertBody="Never send service-role keys or customer tokens through support channels. Use hashed client identifiers only."
      badges={["Secrets: never share", "Docs first"]}
    >
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          Start with API Documentation for scopes, errors and rate limits. Credential issues require
          vault configuration — support cannot recover raw secrets.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link to="/developer/$section" params={{ section: "api-docs" }}>
            Open API documentation
          </Link>
        </Button>
      </div>
    </DeveloperPortalSectionShell>
  );
}

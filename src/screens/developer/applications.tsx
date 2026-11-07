import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DeveloperPortalSectionShell,
  EmptyPortalTable,
} from "@/screens/developer/portal-section";

export function DeveloperApplicationsPage() {
  return (
    <DeveloperPortalSectionShell
      sectionKey="applications"
      description="Applications owned by your publisher account. Draft apps cannot appear as Connected."
      alertTitle="No unpublished apps promoted"
      alertBody="Listings stay Draft until security review and platform approval. Install remains blocked without E2E verification."
      badges={["Lifecycle: Draft → Review → Published", "Self-publish: blocked"]}
    >
      <EmptyPortalTable
        columns={["App code", "Name", "Status", "Version"]}
        message="No applications registered yet."
      />
      <div className="mt-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/developer/$section" params={{ section: "register" }}>
            Register application
          </Link>
        </Button>
      </div>
    </DeveloperPortalSectionShell>
  );
}

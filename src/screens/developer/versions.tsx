import { DeveloperPortalSectionShell, EmptyPortalTable } from "@/screens/developer/portal-section";

export function DeveloperVersionsPage() {
  return (
    <DeveloperPortalSectionShell
      sectionKey="versions"
      description="API and app version compatibility, staged release and deprecation notices."
      alertTitle="Staged release UI"
      alertBody="Version tables exist in schema. Breaking changes require warnings before rollout; rollback stays operator-controlled."
      badges={["Breaking changes: warn first", "Self-publish prod: blocked"]}
    >
      <EmptyPortalTable
        columns={["App", "Version", "API", "Stage", "Deprecation"]}
        message="No published versions for your publisher account."
      />
    </DeveloperPortalSectionShell>
  );
}

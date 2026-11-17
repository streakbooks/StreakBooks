import { DeveloperPortalSectionShell, EmptyPortalTable } from "@/screens/developer/portal-section";

export function DeveloperPublisherPage() {
  return (
    <DeveloperPortalSectionShell
      sectionKey="publisher"
      description="Publisher legal entity, verification status and contact for marketplace listings."
      alertTitle="Publisher verification required"
      alertBody="Publishers cannot self-approve. Profile fields save after verification workflows are enabled; no fake verified badge is shown."
      badges={["Verification: pending", "Self-approve: blocked"]}
    >
      <EmptyPortalTable
        columns={["Legal name", "Country", "Website", "Status"]}
        message="No publisher profile on file. Complete registration when partner onboarding opens."
      />
    </DeveloperPortalSectionShell>
  );
}

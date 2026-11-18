import { DeveloperPortalSectionShell, EmptyPortalTable } from "@/screens/developer/portal-section";

export function DeveloperPartnerPage() {
  return (
    <DeveloperPortalSectionShell
      sectionKey="partner"
      description="Developer partner program tiers, entitlements and commercial policies."
      alertTitle="Partner program schema ready"
      alertBody="Tiers exist in the Xero-parity addendum migration. Onboarding workflows do not invent partnerships or certify apps automatically."
      badges={["Tiers: schema", "Certification: review required"]}
    >
      <EmptyPortalTable
        columns={["Tier", "API level", "Entitlements", "Status"]}
        message="You are not enrolled in a partner tier yet."
      />
    </DeveloperPortalSectionShell>
  );
}

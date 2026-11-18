import { DeveloperPortalSectionShell, EmptyPortalTable } from "@/screens/developer/portal-section";

export function DeveloperUsagePage() {
  return (
    <DeveloperPortalSectionShell
      sectionKey="usage"
      description="API quotas, rate limits and usage metering for partner clients."
      alertTitle="Metering runtime locked"
      alertBody="Quota tables are prepared. Production metering activates with issued OAuth clients — not with platform billing Stripe keys."
      badges={["Rate limits: enforced when live", "Vault: required"]}
    >
      <EmptyPortalTable
        columns={["Client", "Scope", "Calls", "Quota"]}
        message="No API usage yet. Public marketplace HTTP stays security-locked."
      />
    </DeveloperPortalSectionShell>
  );
}

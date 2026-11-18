import { DeveloperPortalSectionShell, EmptyPortalTable } from "@/screens/developer/portal-section";

export function DeveloperAnalyticsPage() {
  return (
    <DeveloperPortalSectionShell
      sectionKey="analytics"
      description="Genuine impressions, installs, activation and retention for your published apps."
      alertTitle="No fabricated analytics"
      alertBody="Event recording RPCs exist. Dashboards show empty until real marketplace events are emitted — never seed fake conversion metrics."
      badges={["Source: marketplace events", "Fabricated metrics: forbidden"]}
    >
      <EmptyPortalTable
        columns={["Metric", "Period", "Value"]}
        message="No analytics events recorded for your applications."
      />
    </DeveloperPortalSectionShell>
  );
}

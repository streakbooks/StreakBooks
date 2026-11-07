import {
  DeveloperPortalSectionShell,
  EmptyPortalTable,
} from "@/screens/developer/portal-section";

export function DeveloperSandboxPage() {
  return (
    <DeveloperPortalSectionShell
      sectionKey="sandbox"
      description="Sandbox organisations and dry-run harnesses for integration quality gates."
      alertTitle="Sandbox harness pending credentials"
      alertBody="Quality gates (XP-08) require provider sandboxes. No fake sync success is recorded here."
      badges={["Dry-run only", "E2E flip: manual after evidence"]}
    >
      <EmptyPortalTable
        columns={["Harness", "Provider", "Last run", "Result"]}
        message="No sandbox runs yet. Connectors stay non-installable until verified E2E evidence exists."
      />
    </DeveloperPortalSectionShell>
  );
}

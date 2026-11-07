import {
  DeveloperPortalSectionShell,
  EmptyPortalTable,
} from "@/screens/developer/portal-section";

export function DeveloperWebhooksPage() {
  return (
    <DeveloperPortalSectionShell
      sectionKey="webhooks"
      description="Webhook subscriptions, delivery logs and signature verification for partner apps."
      alertTitle="Webhook ingress not production-mounted"
      alertBody="Signature, replay and idempotency helpers exist in the engine. Live subscription create stays locked until OAuth clients can be issued securely."
      badges={["Signatures: required", "Replay protection: required", "Ingress: locked"]}
    >
      <EmptyPortalTable
        columns={["Endpoint", "Events", "Status", "Last delivery"]}
        message="No webhook subscriptions. Partners never receive service-role keys to poll privately."
      />
    </DeveloperPortalSectionShell>
  );
}

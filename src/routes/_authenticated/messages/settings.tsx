import { createFileRoute } from "@tanstack/react-router";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { MessagingSettingsPanel } from "@/components/messaging/MessagingSettingsPanel";
import { useActiveCompany } from "@/hooks/use-active-company";

export const Route = createFileRoute("/_authenticated/messages/settings")({
  component: MessagingSettingsRoute,
});

function MessagingSettingsRoute() {
  const { company } = useActiveCompany();
  return (
    <ListWorkspace
      title="Messaging settings"
      description="Organisation collaboration controls"
      breadcrumbs={[
        { label: "Messages", to: "/messages" },
        { label: "Settings" },
      ]}
    >
      <MessagingSettingsPanel companyId={company?.id ?? null} />
    </ListWorkspace>
  );
}

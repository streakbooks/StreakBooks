import { CircleHelp, CircleOff, Clock3, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  integrationStatusLabel,
  integrationStatusTone,
  type IntegrationHealth,
} from "@/lib/settings/integration-health";

/**
 * This visual reports configuration evidence only. It deliberately does not
 * say "Connected", "Synced" or "Verified" unless a future backend proves it.
 */
export function IntegrationHealthBadge({ status }: { status: IntegrationHealth["status"] }) {
  const Icon =
    status === "configured"
      ? Settings2
      : status === "not_configured"
        ? Clock3
        : status === "restricted"
          ? CircleOff
          : CircleHelp;
  return (
    <Badge
      variant={integrationStatusTone(status)}
      className="gap-1.5 rounded-full px-2.5 py-1 font-semibold"
      data-slot="integration-health-badge"
      data-integration-status={status}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {integrationStatusLabel(status)}
    </Badge>
  );
}

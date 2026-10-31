import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { VoiceControl } from "@/components/ai-voice/VoiceControl";
import { useActiveCompany } from "@/hooks/use-active-company";
import { permissionsForRole } from "@/lib/permissions";
import { listOrganisationFeatures } from "@/lib/settings/settings-centre.functions";

export function VoiceAssistant() {
  const { company } = useActiveCompany();
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location.href });
  const fetchFeatures = useServerFn(listOrganisationFeatures);
  const features = useQuery({
    queryKey: ["organisation-features", company?.id],
    enabled: Boolean(company),
    queryFn: () => fetchFeatures({ data: { companyId: company!.id } }),
  });
  const permissions = company?.permissions ?? permissionsForRole(company?.role);
  const enabled = features.data?.some(
    (feature) => feature.key === "voice_commands" && feature.state === "enabled_operational",
  );
  if (!company || features.isError || !enabled || !permissions.includes("company.view"))
    return null;

  return (
    <VoiceControl
      key={JSON.stringify([company.id, permissions, location])}
      permissions={permissions}
      onNavigate={(destination) => navigate({ to: destination })}
    />
  );
}

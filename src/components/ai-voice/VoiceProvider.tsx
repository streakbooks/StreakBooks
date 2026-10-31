import { useEffect, useLayoutEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { permissionsForRole } from "@/lib/permissions";
import { listOrganisationFeatures } from "@/lib/settings/settings-centre.functions";
import { browserRecognition } from "@/lib/ai-voice/browser-recognition";
import { AssistantController } from "@/lib/ai-voice/assistant-controller";

import { VoiceContext } from "./voice-context";
export function VoiceProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const { company } = useActiveCompany();
  const navigate = useNavigate();
  const router = useRouter();
  const location = useRouterState({ select: (state) => state.location.href });
  const fetchFeatures = useServerFn(listOrganisationFeatures);
  const features = useQuery({
    queryKey: ["organisation-features", company?.id],
    enabled: Boolean(company),
    queryFn: () => fetchFeatures({ data: { companyId: company!.id } }),
  });
  const permissions = company?.permissions ?? permissionsForRole(company?.role);
  const enabled =
    !features.isError &&
    Boolean(
      features.data?.some((f) => f.key === "voice_commands" && f.state === "enabled_operational"),
    );
  const [session] = useState(
    () =>
      new AssistantController({
        recognition: () =>
          typeof window !== "undefined" && window.isSecureContext
            ? browserRecognition()
            : undefined,
        navigate: (destination) => navigate({ to: destination }),
        back: () => router.history.back(),
      }),
  );
  const scope = `${userId}:${company?.id ?? ""}`;
  const permissionKey = JSON.stringify(permissions);
  useLayoutEffect(() => {
    session.setScope(scope, company?.id ?? "", JSON.parse(permissionKey), enabled);
  }, [session, scope, company?.id, permissionKey, enabled]);
  useLayoutEffect(() => {
    session.locationChanged(location);
  }, [session, location]);
  useEffect(() => {
    const environment = () => session.environment(!document.hidden, navigator.onLine);
    const pagehide = () => session.environment(false, navigator.onLine);
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === "Space") {
        event.preventDefault();
        if (session.getSnapshot().active) session.stop();
        else session.start();
      }
    };
    environment();
    document.addEventListener("visibilitychange", environment);
    window.addEventListener("online", environment);
    window.addEventListener("offline", environment);
    window.addEventListener("pagehide", pagehide);
    window.addEventListener("pageshow", environment);
    window.addEventListener("keydown", keydown);
    let cleanupPermission = () => {};
    let disposed = false;
    void navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((permission) => {
        if (disposed) return;
        const change = () => {
          if (permission.state === "denied") session.permissionDenied();
        };
        permission.addEventListener("change", change);
        cleanupPermission = () => permission.removeEventListener("change", change);
      })
      .catch(() => {
        /* Some browsers do not expose microphone permission queries. */
      });
    return () => {
      disposed = true;
      cleanupPermission();
      session.dispose();
      document.removeEventListener("visibilitychange", environment);
      window.removeEventListener("online", environment);
      window.removeEventListener("offline", environment);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", environment);
      window.removeEventListener("keydown", keydown);
    };
  }, [session]);
  return <VoiceContext.Provider value={session}>{children}</VoiceContext.Provider>;
}

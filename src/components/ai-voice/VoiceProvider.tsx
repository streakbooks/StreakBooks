import { WakeController } from "@/lib/ai-voice/wake-controller";
import { WakeContext } from "./wake-context";
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
  const [wake] = useState(() => new WakeController(session));
  const scope = `${userId}:${company?.id ?? ""}`;
  const permissionKey = JSON.stringify(permissions);
  useLayoutEffect(() => {
    wake.connect();
    session.setScope(scope, company?.id ?? "", JSON.parse(permissionKey), enabled);
    wake.setScope(
      scope,
      enabled && (JSON.parse(permissionKey) as string[]).includes("company.view"),
    );
  }, [session, wake, scope, company?.id, permissionKey, enabled]);
  useLayoutEffect(() => {
    session.locationChanged(location);
  }, [session, location]);
  useEffect(() => {
    const environment = () => {
      session.environment(!document.hidden, navigator.onLine);
      wake.environment(!document.hidden);
    };
    const pagehide = () => {
      session.environment(false, navigator.onLine);
      wake.environment(false);
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.shiftKey && event.code === "Space") {
        event.preventDefault();
        if (session.getSnapshot().active) session.stop();
        else session.start();
      }
    };
    let pointerDown = false,
      clearAfterClick = false;
    const outsideField = (target: EventTarget | null) =>
      target instanceof Element && !target.closest("[data-voice-field], .voice-signal");
    const focus = (event: FocusEvent) => {
      if (!outsideField(event.target)) return;
      // Defer pointer-driven clearing until click dispatch so rendering cannot move its target
      // between mouse-down and mouse-up. Keyboard focus clears immediately.
      if (pointerDown) clearAfterClick = true;
      else session.clearField();
    };
    const pointerStart = (event: PointerEvent) => {
      pointerDown = true;
      clearAfterClick = outsideField(event.target);
    };
    const pointerEnd = () => {
      pointerDown = false;
    };
    const click = () => {
      if (clearAfterClick) session.clearField();
      clearAfterClick = false;
    };
    const pointerCancel = () => {
      pointerDown = false;
      click();
    };
    document.addEventListener("pointerdown", pointerStart, true);
    document.addEventListener("pointerup", pointerEnd, true);
    document.addEventListener("pointercancel", pointerCancel, true);
    document.addEventListener("click", click, true);
    document.addEventListener("focusin", focus);
    const storage = (event: StorageEvent) => wake.storageChanged(event.key);
    window.addEventListener("storage", storage);
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
          if (permission.state === "denied") {
            wake.permissionDenied();
            session.permissionDenied();
          }
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
      wake.dispose();
      session.dispose();
      document.removeEventListener("focusin", focus);
      document.removeEventListener("pointerdown", pointerStart, true);
      document.removeEventListener("pointerup", pointerEnd, true);
      document.removeEventListener("pointercancel", pointerCancel, true);
      document.removeEventListener("click", click, true);
      window.removeEventListener("storage", storage);
      document.removeEventListener("visibilitychange", environment);
      window.removeEventListener("online", environment);
      window.removeEventListener("offline", environment);
      window.removeEventListener("pagehide", pagehide);
      window.removeEventListener("pageshow", environment);
      window.removeEventListener("keydown", keydown);
    };
  }, [session, wake]);
  return (
    <VoiceContext.Provider value={session}>
      <WakeContext.Provider value={wake}>{children}</WakeContext.Provider>
    </VoiceContext.Provider>
  );
}

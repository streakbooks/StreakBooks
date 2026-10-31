import { useSyncExternalStore } from "react";
import { QueryClient } from "@tanstack/react-query";
import { permissionsForRole, type Permission } from "@/lib/permissions";
import { computeFeatureState, FEATURE_CATALOG } from "@/lib/settings/feature-catalog";

type FixtureState = {
  companyId: string | null;
  permissions: readonly Permission[];
  enabled: boolean;
  featureError: boolean;
};
declare global {
  interface Window {
    voiceFixture: { setContext(patch: Partial<FixtureState>): void };
  }
}
let state: FixtureState = {
  companyId: "company-a",
  permissions: permissionsForRole("owner"),
  enabled: true,
  featureError: false,
};
const listeners = new Set<() => void>();
export const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.voiceFixture = {
  setContext(patch) {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
    void queryClient.invalidateQueries({ queryKey: ["organisation-features"] });
  },
};

export function useActiveCompany() {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => state,
  );
  return {
    company: current.companyId
      ? { id: current.companyId, role: "owner", permissions: current.permissions }
      : null,
  };
}

export async function listOrganisationFeatures() {
  if (state.featureError) throw new Error("Fixture feature lookup failed");
  const voice = FEATURE_CATALOG.find((feature) => feature.key === "voice_commands")!;
  return [computeFeatureState(voice, { enabled: state.enabled, canEdit: true })];
}

import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export type AdvisorPublicSessionState = {
  user: User | null;
  sessionChecked: boolean;
};

export const AdvisorPublicSessionContext = createContext<AdvisorPublicSessionState>({
  user: null,
  sessionChecked: false,
});

export function useAdvisorPublicSession() {
  return useContext(AdvisorPublicSessionContext);
}

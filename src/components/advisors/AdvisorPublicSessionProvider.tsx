import { useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AdvisorPublicSessionContext,
  type AdvisorPublicSessionState,
} from "@/components/advisors/advisor-public-session-context";

/** Keep the optional signed-in state stable while the customer moves through advisor routes. */
export function AdvisorPublicSessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AdvisorPublicSessionState>({
    user: null,
    sessionChecked: false,
  });

  useEffect(() => {
    let mounted = true;
    let authEventReceived = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      setState({ user: session?.user ?? null, sessionChecked: true });
    });

    void supabase.auth
      .getSession()
      .then(({ data: sessionData }) => {
        if (!mounted || authEventReceived) return;
        setState({ user: sessionData.session?.user ?? null, sessionChecked: true });
      })
      .catch(() => {
        if (!mounted || authEventReceived) return;
        setState({ user: null, sessionChecked: true });
      });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  return (
    <AdvisorPublicSessionContext.Provider value={state}>
      {children}
    </AdvisorPublicSessionContext.Provider>
  );
}

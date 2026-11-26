import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useAdvisorPublicSession } from "@/components/advisors/advisor-public-session-context";

/** Keep public advisor links public, while signed-in customers retain app navigation. */
export function AdvisorPublicLayout({ children }: { children: ReactNode }) {
  const { user, sessionChecked } = useAdvisorPublicSession();
  return sessionChecked && user ? <AppShell user={user}>{children}</AppShell> : children;
}

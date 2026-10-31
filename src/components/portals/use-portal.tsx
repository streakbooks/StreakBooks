import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listPortalAccess } from "@/lib/portals/portals.functions";

export type PortalMembership = {
  membership_id: string;
  company_id: string;
  company_name: string;
  contact_id: string;
  contact_name: string;
  role: "customer" | "supplier";
  mfa_required: boolean;
  enabled: boolean;
  locale: string | null;
  date_format: string | null;
  currency: string;
  theme_color: string | null;
};

const STORAGE_KEY = "lb.portal.membership";
const EMPTY_MEMBERSHIPS: PortalMembership[] = [];

export function usePortal() {
  const fetchAccess = useServerFn(listPortalAccess);
  const query = useQuery({
    queryKey: ["portal-access"],
    queryFn: () => fetchAccess() as Promise<PortalMembership[]>,
    retry: false,
  });
  const memberships = query.data ?? EMPTY_MEMBERSHIPS;
  const [membershipId, setMembershipId] = useState<string | null>(null);

  useEffect(() => {
    if (!memberships.length) return;
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    const chosen = memberships.find((m) => m.membership_id === stored) ?? memberships[0];
    if (chosen) setMembershipId(chosen.membership_id);
  }, [memberships]);

  const current = memberships.find((m) => m.membership_id === membershipId) ?? null;

  function select(id: string) {
    window.sessionStorage.setItem(STORAGE_KEY, id);
    setMembershipId(id);
  }

  return { ...query, memberships, current, select };
}

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getReportingFeatureAccess } from "@/lib/reports/ecosystem.functions";
export function useReportingAccess(companyId: string) {
  const getAccess = useServerFn(getReportingFeatureAccess);
  return useQuery({
    queryKey: ["reporting-feature-access", companyId],
    queryFn: async () =>
      JSON.parse(await getAccess({ data: { companyId } })) as {
        allowed: boolean;
        source: string;
        scope: string;
        reason: string;
      },
    staleTime: 30000,
    refetchInterval: 30000,
  });
}

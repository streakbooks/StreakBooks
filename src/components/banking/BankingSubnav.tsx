import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { getBankingWorkspaceCounts } from "@/lib/banking/banking.functions";
import { ModuleSubnav } from "@/components/common/ModuleSubnav";

/** Status views live in the transaction filters; these are distinct banking workspaces. */
export function BankingSubnav() {
  const { company } = useActiveCompany();
  const fetchCounts = useServerFn(getBankingWorkspaceCounts);
  const countsQ = useQuery({
    queryKey: ["banking-counts", company?.id],
    enabled: Boolean(company?.id),
    queryFn: () => fetchCounts({ data: { companyId: company!.id } }),
    staleTime: 15_000,
  });
  return (
    <ModuleSubnav
      label="Banking"
      settings={{ to: "/settings", section: "banking" }}
      items={[
        { to: "/banking", label: "Accounts", exact: true },
        {
          to: "/banking/transactions",
          label: "Transactions",
          // Omit the badge when counts fail — never imply zero uncategorised items.
          count: countsQ.isSuccess ? countsQ.data?.uncategorised : undefined,
        },
        { to: "/banking/reconcile", label: "Reconcile" },
        { to: "/banking/cash-coding", label: "Cash coding" },
        { to: "/banking/transfers", label: "Transfers" },
        { to: "/banking/receive-money", label: "Receive money" },
        { to: "/banking/spend-money", label: "Spend money" },
        { to: "/banking/money-documents", label: "Bank documents" },
        { to: "/banking/rules", label: "Rules" },
        { to: "/banking/import", label: "Import CSV" },
        { to: "/banking/feeds", label: "Feeds" },
      ]}
    />
  );
}

import type { ReportFilters } from "@/lib/reports/report-filters";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCashProfitLossTransactions } from "@/lib/reports/cash-drill.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
import { JournalLink } from "./ReportShell";

export function CashProfitLossDrill({
  companyId,
  accountId,
  report = "profit-and-loss",
  from,
  to,
  onClose,
  filters,
}: {
  companyId: string;
  accountId: string;
  report?: "profit-and-loss" | "balance-sheet";
  from: string;
  to: string;
  onClose: () => void;
  filters?: ReportFilters | undefined;
}) {
  const fetch = useServerFn(getCashProfitLossTransactions);
  const query = useQuery({
    queryKey: ["cash-profit-loss-drill", companyId, accountId, report, from, to, filters],
    queryFn: () => fetch({ data: { companyId, accountId, report, from, to, filters } }),
    retry: false,
  });
  const data = query.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Cash recognition transactions</DialogTitle>
          <DialogDescription>
            {report === "balance-sheet" ? `Through ${to}` : `${from} to ${to}`} · Cash recognition
            amounts.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <QueryErrorState queries={[query]} title="Could not load cash transactions" />
        ) : data ? (
          <>
            <p className="font-medium">
              {data.account.code} {data.account.name} · {data.currency}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-2 text-left">Cash date</th>
                    <th className="p-2 text-left">Cash journal</th>
                    <th className="p-2 text-left">Source journal</th>
                    <th className="p-2 text-right">Debit</th>
                    <th className="p-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-2">{row.date}</td>
                      <td className="p-2">
                        <JournalLink journalId={row.journalId} number={row.journalNumber} />
                      </td>
                      <td className="p-2">
                        <JournalLink journalId={row.sourceJournalId} number={row.sourceType} />
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {fromMinorUnits(BigInt(row.debit), data.currency)}
                      </td>
                      <td className="p-2 text-right tabular-nums">
                        {fromMinorUnits(BigInt(row.credit), data.currency)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold">
                    <th className="p-2 text-left" colSpan={3}>
                      Total cash recognition
                    </th>
                    <td className="p-2 text-right">
                      {fromMinorUnits(BigInt(data.debit), data.currency)}
                    </td>
                    <td className="p-2 text-right">
                      {fromMinorUnits(BigInt(data.credit), data.currency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getCashProfitLossTransactions } from "@/lib/reports/cash-drill.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LoadingState, ErrorState } from "@/components/common/states";
import { JournalLink } from "./ReportShell";

export function CashProfitLossDrill({
  companyId,
  accountId,
  from,
  to,
  onClose,
}: {
  companyId: string;
  accountId: string;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const fetch = useServerFn(getCashProfitLossTransactions);
  const query = useQuery({
    queryKey: ["cash-profit-loss-drill", companyId, accountId, from, to],
    queryFn: () => fetch({ data: { companyId, accountId, from, to } }),
    retry: false,
  });
  const data = query.data;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Cash recognition transactions</DialogTitle>
          <DialogDescription>
            {from} to {to} · Settlement amounts, distinct from the accrual General Ledger.
          </DialogDescription>
        </DialogHeader>
        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState
            title="Could not load cash transactions"
            description={friendlyAuthError(query.error)}
            onRetry={() => void query.refetch()}
          />
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
                      Total recognized in this period
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

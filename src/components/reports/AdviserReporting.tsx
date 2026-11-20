import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listMyFirms } from "@/lib/firm/firm.functions";
import { getFirmReportingPortfolio } from "@/lib/reports/ecosystem.functions";
import { LookupSelect } from "@/components/lookup";
import { PracticeWorkBoard } from "@/components/accountant/PracticeWorkBoard";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState, EmptyState } from "@/components/common/states";
export function AdviserReporting({ from, to }: { from: string; to: string }) {
  const firmsFn = useServerFn(listMyFirms),
    portfolioFn = useServerFn(getFirmReportingPortfolio);
  const firms = useQuery({ queryKey: ["reporting-my-firms"], queryFn: () => firmsFn() });
  const [chosen, setChosen] = useState("");
  const [start, setStart] = useState(from),
    [end, setEnd] = useState(to),
    [selected, setSelected] = useState<string[]>([]);
  const firmId = chosen || firms.data?.[0]?.firmId || "";
  const portfolio = useQuery({
    queryKey: ["firm-reporting", firmId, start, end],
    enabled: !!firmId,
    queryFn: () => portfolioFn({ data: { firmId, from: start, to: end } }),
    retry: false,
  });
  if (firms.isPending) return <LoadingState />;
  if (firms.isError)
    return <QueryErrorState queries={[firms]} title="Could not load accounting firms" />;
  if (!firms.data.length)
    return (
      <div className="space-y-3">
        <EmptyState
          title="No accounting firm membership"
          description="Create or join a firm and establish authorized client relationships to use adviser reporting."
        />
        <Button asChild variant="outline">
          <Link to="/firm">Open firm workspace</Link>
        </Button>
      </div>
    );
  const clients = portfolio.data ?? [];
  const selectedClients = selected.length
    ? clients.filter((c) => selected.includes(c.companyId))
    : clients;
  const totals = new Map<
    string,
    {
      currency: string;
      basis: "cash" | "accrual";
      revenue: bigint;
      profit: bigint;
      cash: bigint;
      count: number;
    }
  >();
  for (const c of selectedClients) {
    const currency = c.metrics.company.baseCurrency,
      basis = c.metrics.accountingBasis,
      key = `${currency}:${basis}`,
      total = totals.get(key) ?? {
        currency,
        basis,
        revenue: 0n,
        profit: 0n,
        cash: 0n,
        count: 0,
      };
    total.revenue += BigInt(c.metrics.metrics.revenue.value);
    total.profit += BigInt(c.metrics.metrics.net_profit.value);
    total.cash += BigInt(c.metrics.metrics.cash.value);
    total.count++;
    totals.set(key, total);
  }
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Adviser reporting portfolio</h2>
        <p className="text-sm text-muted-foreground">
          Only active firm-client relationships and company reporting permissions are included.
        </p>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-64">
          <Label>Accounting firm</Label>
          <LookupSelect
            ariaLabel="Reporting firm"
            options={firms.data.map((f) => ({ id: f.firmId, label: f.name }))}
            value={firmId}
            onChange={(id) => {
              setChosen(id);
              setSelected([]);
            }}
            allowClear={false}
          />
        </div>
        <div>
          <Label htmlFor="adviser-from">From</Label>
          <Input
            id="adviser-from"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="adviser-to">To</Label>
          <Input id="adviser-to" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        <Button variant="outline" onClick={() => void portfolio.refetch()}>
          Refresh clients
        </Button>
        <Button asChild variant="ghost">
          <Link to="/firm">Firm relationships</Link>
        </Button>
      </div>
      {portfolio.isPending ? (
        <LoadingState />
      ) : portfolio.isError ? (
        <QueryErrorState queries={[portfolio]} title="Could not load authorized client reporting" />
      ) : !portfolio.isSuccess ? (
        <LoadingState />
      ) : !clients.length ? (
        <EmptyState
          title="No authorized clients"
          description="Link client organisations in the firm workspace."
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {[...totals].map(([key, total]) => (
              <div key={key} className="rounded border p-4">
                <p className="text-sm text-muted-foreground">
                  {total.count} selected {total.currency} clients ·{" "}
                  {total.basis === "cash" ? "Cash" : "Accrual"} basis
                </p>
                <p className="font-semibold">
                  Revenue: {fromMinorUnits(total.revenue, total.currency)}
                </p>
                <p>Net profit: {fromMinorUnits(total.profit, total.currency)}</p>
                <p>Cash: {fromMinorUnits(total.cash, total.currency)}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Portfolio indicators combine the selected clients separately by currency and accounting
            basis. They do not apply intercompany eliminations or currency translation.
          </p>
          <div className="overflow-x-auto rounded border">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-3">Select</th>
                  <th className="p-3">Client</th>
                  <th className="p-3">Revenue</th>
                  <th className="p-3">Net profit</th>
                  <th className="p-3">Reporting status</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const packs = JSON.parse(c.packs_json) as Array<{
                    id: string;
                    name: string;
                    status: string;
                  }>;
                  return (
                    <tr key={c.companyId} className="border-t">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          aria-label={`Select reporting client ${c.name}`}
                          checked={selected.includes(c.companyId)}
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? [...selected, c.companyId]
                                : selected.filter((id) => id !== c.companyId),
                            )
                          }
                        />
                      </td>
                      <td className="p-3">
                        <p className="font-medium">{c.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.metrics.company.baseCurrency} ·{" "}
                          {c.metrics.accountingBasis === "cash" ? "Cash" : "Accrual"} basis ·
                          financial year end {c.metrics.company.fyEndDay}/
                          {c.metrics.company.fyEndMonth}
                        </p>
                        {!c.metrics.hasActivity && (
                          <p className="text-xs text-muted-foreground">
                            No posted activity in selected period
                          </p>
                        )}
                      </td>
                      <td className="p-3">
                        {fromMinorUnits(
                          BigInt(c.metrics.metrics.revenue.value),
                          c.metrics.company.baseCurrency,
                        )}
                      </td>
                      <td className="p-3">
                        {fromMinorUnits(
                          BigInt(c.metrics.metrics.net_profit.value),
                          c.metrics.company.baseCurrency,
                        )}
                      </td>
                      <td className="p-3">
                        {packs.length
                          ? packs.map((p) => (
                              <p key={p.id}>
                                {p.name} · {p.status.replaceAll("_", " ")}
                              </p>
                            ))
                          : "No pack prepared for this period"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <PracticeWorkBoard key={firmId} firmId={firmId} />
    </div>
  );
}

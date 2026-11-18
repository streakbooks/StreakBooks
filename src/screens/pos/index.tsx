import { PosNavigation } from "@/components/pos/PosNavigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { LoadingState, EmptyState } from "@/components/common/states";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { previewPosCatalogueCart, searchPosCatalogue } from "@/lib/pos/catalogue-quote.functions";
import { getPosWorkspace } from "@/lib/pos/registers.functions";
import { completePosCashSale, getPosRecentSales } from "@/lib/pos/cash-sale.functions";
import { posCountFromDisplay, type PosSession } from "@/lib/pos/register-contracts";
import type { PosCashSaleResult } from "@/lib/pos/cash-sale";

type CartLine = { productId: string; name: string; quantity: number };
const workspaceKey = (companyId: string) => ["pos-registers", companyId];

export function PosScreen() {
  const context = useActiveCompany();
  const canView = useCanDo("pos.view");
  if (context.isError) return <QueryErrorState queries={[context]} />;
  if (context.isPending) return <LoadingState />;
  if (!context.company)
    return (
      <CompanyEmptyState
        title="No organisation selected"
        description="Open a company to use the point of sale."
      />
    );
  if (!canView)
    return (
      <EmptyState
        title="POS access required"
        description="Ask your administrator for POS view permission."
      />
    );
  return <CatalogueCart key={context.company.id} companyId={context.company.id} />;
}

function CatalogueCart({ companyId }: { companyId: string }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [tendered, setTendered] = useState("");
  const [checkoutError, setCheckoutError] = useState<unknown>(null);
  const [lastSale, setLastSale] = useState<PosCashSaleResult | null>(null);
  const saleOperation = useRef<{ payload: string; id: string } | null>(null);
  const lookup = useServerFn(searchPosCatalogue);
  const preview = useServerFn(previewPosCatalogueCart);
  const workspaceFn = useServerFn(getPosWorkspace);
  const completeSale = useServerFn(completePosCashSale);
  const recentFn = useServerFn(getPosRecentSales);
  const client = useQueryClient();
  const workspace = useQuery({
    queryKey: workspaceKey(companyId),
    queryFn: () => workspaceFn({ data: { companyId } }),
    gcTime: 0,
  });
  const products = useQuery({
    queryKey: ["pos-catalogue", companyId, term],
    queryFn: () => lookup({ data: { companyId, q: term } }),
    gcTime: 0,
  });
  const quote = useQuery({
    queryKey: ["pos-preview", companyId, cart],
    queryFn: () =>
      preview({
        data: {
          companyId,
          lines: cart.map(({ productId, quantity }) => ({ productId, quantity })),
        },
      }),
    enabled: cart.length > 0,
    staleTime: 0,
    gcTime: 0,
  });
  const recentSales = useQuery({
    queryKey: ["pos-recent-sales", companyId],
    queryFn: () => recentFn({ data: { companyId } }),
    enabled: workspace.data?.canSell === true,
    gcTime: 0,
  });
  const openSessions = workspace.data?.openSessions ?? [];
  const selectedSession: PosSession | undefined = openSessions.find((row) => row.id === sessionId);
  const canCheckout = workspace.data?.canSell && openSessions.length > 0 && selectedSession;
  useEffect(() => {
    if (openSessions.length === 1) setSessionId(openSessions[0]!.id);
    if (openSessions.length === 0) setSessionId("");
  }, [openSessions]);
  const saleMutation = useMutation({
    mutationFn: (data: {
      sessionId: string;
      operationId: string;
      cashTenderedMinor: string;
    }) =>
      completeSale({
        data: {
          companyId,
          sessionId: data.sessionId,
          operationId: data.operationId,
          cashTenderedMinor: data.cashTenderedMinor,
          lines: cart.map(({ productId, quantity }) => ({ productId, quantity })),
        },
      }),
    onSuccess: async (result) => {
      setLastSale(result);
      setCart([]);
      setTendered("");
      saleOperation.current = null;
      await client.invalidateQueries({ queryKey: workspaceKey(companyId) });
      await client.invalidateQueries({ queryKey: ["pos-recent-sales", companyId] });
    },
  });
  function add(productId: string, name: string) {
    setLastSale(null);
    setCart((lines) => {
      const existing = lines.find((line) => line.productId === productId);
      if (existing)
        return lines.map((line) =>
          line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line,
        );
      return lines.length >= 100 ? lines : [...lines, { productId, name, quantity: 1 }];
    });
  }
  function submitSale(event: FormEvent) {
    event.preventDefault();
    if (!canCheckout || saleMutation.isPending || !quote.data) return;
    try {
      const cashTenderedMinor = posCountFromDisplay(tendered, quote.data.currency);
      const gross = BigInt(quote.data.grossMinor);
      if (BigInt(cashTenderedMinor) < gross) {
        throw new Error("Cash tendered must cover the sale total");
      }
      const payload = JSON.stringify([
        companyId,
        sessionId,
        cashTenderedMinor,
        cart.map((line) => [line.productId, line.quantity]),
      ]);
      if (saleOperation.current?.payload !== payload)
        saleOperation.current = { payload, id: crypto.randomUUID() };
      setCheckoutError(null);
      saleMutation.mutate({
        sessionId,
        operationId: saleOperation.current.id,
        cashTenderedMinor,
      });
    } catch (failure) {
      setCheckoutError(failure);
    }
  }
  const displayCurrency =
    quote.data?.currency ?? selectedSession?.currency_code ?? workspace.data?.currency ?? "USD";
  const changeMinor =
    quote.data && tendered.trim()
      ? (() => {
          try {
            const tenderedMinor = posCountFromDisplay(tendered, quote.data.currency);
            const gross = BigInt(quote.data.grossMinor);
            const tenderedValue = BigInt(tenderedMinor);
            return tenderedValue >= gross ? (tenderedValue - gross).toString() : null;
          } catch {
            return null;
          }
        })()
      : null;
  const checkoutNote = !workspace.data
    ? "Loading register sessions…"
    : !workspace.data.canSell
      ? "You can preview catalogue prices, but cash checkout needs pos.sale.create and an open register session."
      : openSessions.length === 0
        ? "Open a register session on Registers & sessions before completing a cash sale."
        : "Cash only — card and wallet payments are not available in this batch.";
  return (
    <ListWorkspace
      title="Point of Sale"
      subnav={<PosNavigation />}
      description="Catalogue cash checkout"
      breadcrumbs={[{ label: "Point of Sale" }]}
    >
      <p className="mb-4 rounded-lg border border-border bg-muted p-4 text-sm" role="note">
        {checkoutNote} Prices use catalogue data and company tax settings; promotions and
        jurisdiction-specific rules are not applied. Carts clear when you leave or change company.
        Stock and COGS are not adjusted.
      </p>
      <QueryErrorState queries={[workspace]} />
      {workspace.isSuccess && canCheckout ? (
        <section aria-label="Register session" className="mb-4 space-y-2 rounded-lg border p-4">
          <Label htmlFor="pos-session">Open session</Label>
          {openSessions.length === 1 ? (
            <p id="pos-session">
              {workspace.data.registers.find((row) => row.id === selectedSession.register_id)?.name ??
                "Register"}{" "}
              · Expected cash {selectedSession.currency_code}{" "}
              {fromMinorUnits(BigInt(selectedSession.expected_cash_minor), selectedSession.currency_code)}
            </p>
          ) : (
            <select
              id="pos-session"
              className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={sessionId}
              onChange={(event) => setSessionId(event.target.value)}
            >
              <option value="">Choose session</option>
              {openSessions.map((session) => {
                const register = workspace.data.registers.find((row) => row.id === session.register_id);
                return (
                  <option key={session.id} value={session.id}>
                    {register?.name ?? "Register"} · expected{" "}
                    {fromMinorUnits(BigInt(session.expected_cash_minor), session.currency_code)}
                  </option>
                );
              })}
            </select>
          )}
        </section>
      ) : null}
      <div className="grid min-w-0 gap-6 lg:grid-cols-2">
        <section aria-label="Product catalogue" className="space-y-4">
          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              setTerm(search.trim());
            }}
          >
            <div className="flex-1">
              <Label htmlFor="pos-search">Name or SKU</Label>
              <Input
                id="pos-search"
                value={search}
                maxLength={100}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Button type="submit" className="min-h-11">
              Search
            </Button>
          </form>
          <QueryErrorState queries={[products]} />
          {products.isPending ? <LoadingState /> : null}
          {products.data?.length === 0 ? (
            <EmptyState
              title="No matching items"
              description="Try another name or SKU, or add an active item in Products & Services."
            />
          ) : null}
          <ul className="space-y-2">
            {products.data?.map((product) => (
              <li
                key={product.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <span>
                  {product.name}
                  <span className="block text-sm text-muted-foreground">
                    {product.code ?? "No SKU"} · {product.unit}
                  </span>
                </span>
                <Button
                  type="button"
                  className="min-h-11"
                  disabled={
                    cart.length >= 100 && !cart.some((line) => line.productId === product.id)
                  }
                  aria-label={`Add ${product.name}`}
                  onClick={() => add(product.id, product.name)}
                >
                  Add
                </Button>
              </li>
            ))}
          </ul>
          {products.data?.length === 50 ? (
            <p className="text-sm text-muted-foreground">
              Showing up to 50 items. Search to narrow the catalogue.
            </p>
          ) : null}
        </section>
        <section
          aria-label="Cart and checkout"
          className="space-y-4 rounded-xl border border-border p-4"
        >
          <h2 className="text-lg font-semibold">Cart</h2>
          {cart.length === 0 ? (
            <EmptyState
              title="Your cart is empty"
              description="Add an item to calculate prices from the current catalogue."
            />
          ) : null}
          <ul className="space-y-4">
            {cart.map((line) => (
              <li key={line.productId} className="space-y-2 border-b border-border pb-3">
                <p>{line.name}</p>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <Label htmlFor={`qty-${line.productId}`}>Quantity</Label>
                    <Input
                      id={`qty-${line.productId}`}
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      value={line.quantity}
                      onChange={(event) => {
                        const quantity = event.target.valueAsNumber;
                        if (Number.isFinite(quantity) && quantity > 0)
                          setCart((lines) =>
                            lines.map((item) =>
                              item.productId === line.productId ? { ...item, quantity } : item,
                            ),
                          );
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    aria-label={`Remove ${line.name}`}
                    onClick={() =>
                      setCart((lines) => lines.filter((item) => item.productId !== line.productId))
                    }
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          {cart.length ? (
            <>
              <Button type="button" variant="outline" onClick={() => setCart([])}>
                Clear cart
              </Button>
              <QueryErrorState queries={[quote]} title="Could not calculate cart" />
              <div aria-live="polite" aria-busy={quote.isFetching}>
                {quote.isFetching ? (
                  <p>Calculating current prices…</p>
                ) : quote.isSuccess ? (
                  <>
                    <p>
                      Currency: {quote.data.currency} · Tax {quote.data.treatment}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-2">
                      <dt>Before tax</dt>
                      <dd>{fromMinorUnits(BigInt(quote.data.netMinor), quote.data.currency)}</dd>
                      <dt>Tax</dt>
                      <dd>{fromMinorUnits(BigInt(quote.data.taxMinor), quote.data.currency)}</dd>
                      <dt className="font-semibold">Total</dt>
                      <dd className="font-semibold">
                        {fromMinorUnits(BigInt(quote.data.grossMinor), quote.data.currency)}
                      </dd>
                    </dl>
                    {canCheckout ? (
                      <form onSubmit={submitSale} className="mt-4 space-y-3">
                        <div>
                          <Label htmlFor="cash-tendered">Cash tendered ({quote.data.currency})</Label>
                          <Input
                            id="cash-tendered"
                            value={tendered}
                            onChange={(event) => setTendered(event.target.value)}
                            inputMode="decimal"
                            required
                            disabled={saleMutation.isPending}
                            autoComplete="off"
                          />
                        </div>
                        {changeMinor ? (
                          <p>
                            Change due: {fromMinorUnits(BigInt(changeMinor), quote.data.currency)}
                          </p>
                        ) : null}
                        {checkoutError || saleMutation.isError ? (
                          <p role="alert" className="text-sm text-destructive">
                            {friendlyAuthError(checkoutError ?? saleMutation.error)}
                          </p>
                        ) : null}
                        <Button
                          type="submit"
                          className="min-h-11 w-full"
                          disabled={saleMutation.isPending}
                        >
                          {saleMutation.isPending ? "Posting sale…" : "Complete cash sale"}
                        </Button>
                      </form>
                    ) : (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Checkout stays disabled until an open session is available.
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() => void quote.refetch()}
                    >
                      Refresh prices
                    </Button>
                  </>
                ) : null}
              </div>
            </>
          ) : null}
          {lastSale ? (
            <section aria-label="Last receipt" className="rounded-lg border border-border p-3 text-sm">
              <h3 className="font-semibold">Sale recorded</h3>
              <p>Receipt reference: {lastSale.receiptCode}</p>
              <p>Journal: {lastSale.journalId ?? "Pending"}</p>
              <p>
                Change due:{" "}
                {fromMinorUnits(BigInt(lastSale.changeMinor), displayCurrency)}
              </p>
              <p>
                Expected drawer cash:{" "}
                {fromMinorUnits(BigInt(lastSale.expectedCashMinor), displayCurrency)}
              </p>
            </section>
          ) : null}
          {recentSales.data && recentSales.data.length > 0 ? (
            <section aria-label="Recent sales" className="space-y-2">
              <h3 className="font-semibold">Recent sales</h3>
              <ul className="space-y-1 text-sm">
                {recentSales.data.map((sale) => (
                  <li key={sale.id}>
                    {new Date(sale.createdAt).toLocaleString()} · {sale.status} ·{" "}
                    {fromMinorUnits(BigInt(sale.totalMinor), displayCurrency)}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      </div>
    </ListWorkspace>
  );
}
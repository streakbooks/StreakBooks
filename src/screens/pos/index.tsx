import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { previewPosCatalogueCart, searchPosCatalogue } from "@/lib/pos/catalogue-quote.functions";

type CartLine = { productId: string; name: string; quantity: number };
export function PosScreen() {
  const context = useActiveCompany();
  const canView = useCanDo("sales.view");
  if (context.isError) return <QueryErrorState queries={[context]} />;
  if (context.isPending) return <LoadingState />;
  if (!context.company)
    return (
      <CompanyEmptyState
        title="No organisation selected"
        description="Open a company to preview its catalogue."
      />
    );
  if (!canView)
    return (
      <EmptyState
        title="Sales access required"
        description="Ask your administrator for Sales view permission."
      />
    );
  return <CatalogueCart key={context.company.id} companyId={context.company.id} />;
}

function CatalogueCart({ companyId }: { companyId: string }) {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const lookup = useServerFn(searchPosCatalogue);
  const preview = useServerFn(previewPosCatalogueCart);
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
  function add(productId: string, name: string) {
    setCart((lines) => {
      const existing = lines.find((line) => line.productId === productId);
      if (existing)
        return lines.map((line) =>
          line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line,
        );
      return lines.length >= 100 ? lines : [...lines, { productId, name, quantity: 1 }];
    });
  }
  return (
    <ListWorkspace
      title="Point of Sale"
      description="Catalogue cart preview"
      breadcrumbs={[{ label: "Point of Sale" }]}
    >
      <p className="mb-4 rounded-lg border border-border bg-muted p-4 text-sm" role="note">
        Preview only. Uses catalogue prices and company tax settings; customer pricing, promotions
        and jurisdiction-specific tax rules are not applied. Carts clear when you leave or change
        company. Checkout, payments and stock tracking are not available yet.
      </p>
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
            <Button type="submit">Search</Button>
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
          aria-label="Cart preview"
          className="space-y-4 rounded-xl border border-border p-4"
        >
          <h2 className="text-lg font-semibold">Cart</h2>
          {cart.length === 0 ? (
            <EmptyState
              title="Your cart is empty"
              description="Add an item to calculate a preview from current catalogue prices."
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
                      <dt className="font-semibold">Total preview</dt>
                      <dd className="font-semibold">
                        {fromMinorUnits(BigInt(quote.data.grossMinor), quote.data.currency)}
                      </dd>
                    </dl>
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
        </section>
      </div>
    </ListWorkspace>
  );
}

import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { fromMinorUnits } from "@/lib/accounting/money";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import { validCataloguePrice } from "@/lib/products/catalogue-input";
import { listProducts } from "@/lib/products/products.functions";
import { validRuleDate, validateRuleInput } from "@/lib/products/price-list-tiers";
import {
  deleteManagedPriceRule,
  listManagedPriceRules,
  saveManagedPriceRule,
  type ManagedPriceRule,
} from "@/lib/products/price-list-tiers.functions";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = {
  companyId: string;
  priceListId: string;
  listName: string;
  currency: string;
  isActive: boolean;
};

export function PriceListTierRules({
  companyId,
  priceListId,
  listName,
  currency,
  isActive,
}: Props) {
  const qc = useQueryClient();
  const fetchRules = useServerFn(listManagedPriceRules);
  const saveRule = useServerFn(saveManagedPriceRule);
  const deleteRule = useServerFn(deleteManagedPriceRule);
  const searchProducts = useServerFn(listProducts);
  const canManage = useCanDo("products.manage");
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [minQuantity, setMinQuantity] = useState("1");
  const [effectiveFrom, setEffectiveFrom] = useState("1900-01-01");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [price, setPrice] = useState("");

  const rulesQ = useQuery({
    queryKey: ["product-price-rules", companyId, priceListId],
    queryFn: () => fetchRules({ data: { companyId, priceListId } }),
  });
  const productsQ = useQuery({
    queryKey: ["products", companyId, search],
    queryFn: () => searchProducts({ data: { companyId, q: search, limit: 100 } }),
  });
  const selectedRule = rulesQ.data?.find((rule) => rule.id === editingId);
  const validPrice = price.trim() !== "" && validCataloguePrice(price, currency);
  const validInputs = (() => {
    if (!validPrice) return false;
    try {
      validateRuleInput({
        minQuantity,
        effectiveFrom,
        effectiveTo,
        unitPriceMinor: Number(parseMinorOrThrow(price, currency, "Pricing rule")),
      });
      return true;
    } catch {
      return false;
    }
  })();
  const reset = () => {
    setSelectedProductId("");
    setEditingId(null);
    setMinQuantity("1");
    setEffectiveFrom("1900-01-01");
    setEffectiveTo("");
    setPrice("");
  };
  const edit = (rule: ManagedPriceRule) => {
    setEditingId(rule.id);
    setSelectedProductId(rule.product_id);
    setSearch(rule.product_name);
    setMinQuantity(rule.min_quantity);
    setEffectiveFrom(rule.effective_from);
    setEffectiveTo(rule.effective_to ?? "");
    setPrice(fromMinorUnits(BigInt(rule.unit_price_minor), currency));
  };
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["product-price-rules", companyId, priceListId] }),
      qc.invalidateQueries({ queryKey: ["sales-draft-price-list", companyId, priceListId] }),
    ]);
  };
  const saveMut = useMutation({
    mutationFn: () =>
      saveRule({
        data: {
          companyId,
          priceListId,
          productId: selectedProductId,
          ...(editingId ? { id: editingId } : {}),
          minQuantity,
          effectiveFrom,
          effectiveTo: effectiveTo || null,
          unitPriceMinor: Number(parseMinorOrThrow(price, currency, "Pricing rule")),
        },
      }),
    onSuccess: async () => {
      toast.success(editingId ? "Pricing tier updated" : "Pricing tier created");
      reset();
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const deleteMut = useMutation({
    mutationFn: (ruleId: string) => deleteRule({ data: { companyId, priceListId, ruleId } }),
    onSuccess: async () => {
      toast.success("Pricing tier removed");
      if (editingId) reset();
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{listName} — quantity and date pricing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Set exact unit prices for minimum quantities and effective date ranges, in {currency}. The
          highest eligible quantity tier wins, then the latest start date. Where no rule qualifies,
          the fixed list price applies, then the standard catalogue price. Dates are inclusive;
          1900-01-01 means no practical start date. Prices are snapshots on sales drafts and never
          retroactively applied to posted documents.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="tier-product-search">Search product or service</Label>
            <Input
              id="tier-product-search"
              value={search}
              placeholder="Find SKU or product name"
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedProductId("");
              }}
            />
            <RecordLookupSelect value={selectedProductId} onValueChange={setSelectedProductId}>
              <SelectTrigger aria-label="Product for pricing rule">
                <SelectValue placeholder="Choose product" />
              </SelectTrigger>
              <SelectContent>
                {selectedProductId &&
                selectedRule &&
                !productsQ.data?.some((p) => p.id === selectedProductId) ? (
                  <SelectItem value={selectedProductId}>{selectedRule.product_name}</SelectItem>
                ) : null}
                {(productsQ.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.code ? `${p.code} — ` : ""}
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </RecordLookupSelect>
            {productsQ.isError ? (
              <QueryErrorState queries={[productsQ]} title="Could not load products" />
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="tier-quantity">Minimum quantity (up to 4 decimal places)</Label>
            <Input
              id="tier-quantity"
              inputMode="decimal"
              value={minQuantity}
              onChange={(event) => setMinQuantity(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tier-price">Unit price ({currency})</Label>
            <Input
              id="tier-price"
              inputMode="decimal"
              value={price}
              aria-invalid={Boolean(price) && !validPrice}
              onChange={(event) => setPrice(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tier-from">Effective from (inclusive)</Label>
            <Input
              id="tier-from"
              type="date"
              min="1900-01-01"
              value={effectiveFrom}
              aria-invalid={!validRuleDate(effectiveFrom)}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tier-to">Effective to (optional, inclusive)</Label>
            <Input
              id="tier-to"
              type="date"
              min={effectiveFrom}
              value={effectiveTo}
              onChange={(event) => setEffectiveTo(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              disabled={
                !isActive || !canManage || !selectedProductId || !validInputs || saveMut.isPending
              }
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? "Saving…" : editingId ? "Save changes" : "Add pricing tier"}
            </Button>
            <Button variant="outline" onClick={reset}>
              Clear
            </Button>
          </div>
        </div>
        {rulesQ.isPending ? <p className="text-sm">Loading pricing tiers…</p> : null}
        {rulesQ.isError ? (
          <QueryErrorState queries={[rulesQ]} title="Could not load pricing tiers" />
        ) : null}
        {rulesQ.data?.length === 0 ? (
          <p className="rounded-md border p-3 text-sm">
            No tier rules configured for this price list.
          </p>
        ) : null}
        <div className="space-y-2">
          {rulesQ.data?.map((rule) => (
            <div
              key={rule.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {rule.product_code ? `${rule.product_code} — ` : ""}
                  {rule.product_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Qty ≥ {rule.min_quantity} ·{" "}
                  {fromMinorUnits(BigInt(rule.unit_price_minor), currency)} {currency} ·{" "}
                  {rule.effective_from} to {rule.effective_to ?? "open ended"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canManage || !isActive}
                  onClick={() => edit(rule)}
                >
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canManage || deleteMut.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove tier for ${rule.product_name} at quantity ${rule.min_quantity}?`,
                      )
                    ) {
                      deleteMut.mutate(rule.id);
                    }
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

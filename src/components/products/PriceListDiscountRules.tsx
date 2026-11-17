import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { listProducts } from "@/lib/products/products.functions";
import {
  discountBpsToPercent,
  discountPercentToBps,
  validateDiscountRuleInput,
} from "@/lib/products/price-list-discounts";
import {
  deleteManagedDiscountRule,
  listManagedDiscountRules,
  saveManagedDiscountRule,
  type ManagedDiscountRule,
} from "@/lib/products/price-list-discounts.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  companyId: string;
  priceListId: string;
  listName: string;
  currency: string;
  isActive: boolean;
};

export function PriceListDiscountRules({
  companyId,
  priceListId,
  listName,
  currency,
  isActive,
}: Props) {
  const qc = useQueryClient();
  const fetchRules = useServerFn(listManagedDiscountRules);
  const saveRule = useServerFn(saveManagedDiscountRule);
  const deleteRule = useServerFn(deleteManagedDiscountRule);
  const searchProducts = useServerFn(listProducts);
  const canManage = useCanDo("products.manage");
  const [search, setSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [fromDate, setFromDate] = useState("1900-01-01");
  const [toDate, setToDate] = useState("");
  const [percentage, setPercentage] = useState("");
  const rulesQ = useQuery({
    queryKey: ["product-price-discounts", companyId, priceListId],
    queryFn: () => fetchRules({ data: { companyId, priceListId } }),
  });
  const productsQ = useQuery({
    queryKey: ["products", companyId, search],
    queryFn: () => searchProducts({ data: { companyId, q: search, limit: 100 } }),
  });
  const editing = rulesQ.data?.find((item) => item.id === editingId);
  const valid = (() => {
    try {
      validateDiscountRuleInput({
        minQuantity: quantity,
        effectiveFrom: fromDate,
        effectiveTo: toDate || null,
        discountBps: discountPercentToBps(percentage),
      });
      return true;
    } catch {
      return false;
    }
  })();
  const reset = () => {
    setSearch("");
    setProductId("");
    setEditingId(null);
    setQuantity("1");
    setFromDate("1900-01-01");
    setToDate("");
    setPercentage("");
  };
  const edit = (rule: ManagedDiscountRule) => {
    setEditingId(rule.id);
    setProductId(rule.product_id);
    setSearch(rule.product_name);
    setQuantity(rule.min_quantity);
    setFromDate(rule.effective_from);
    setToDate(rule.effective_to ?? "");
    setPercentage(discountBpsToPercent(rule.discount_bps));
  };
  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["product-price-discounts", companyId, priceListId] }),
      qc.invalidateQueries({ queryKey: ["sales-draft-price-list", companyId, priceListId] }),
    ]);
  };
  const saveMut = useMutation({
    mutationFn: () =>
      saveRule({
        data: {
          companyId,
          priceListId,
          productId,
          ...(editingId ? { id: editingId } : {}),
          minQuantity: quantity,
          effectiveFrom: fromDate,
          effectiveTo: toDate || null,
          discountBps: discountPercentToBps(percentage),
        },
      }),
    onSuccess: async () => {
      toast.success(editingId ? "Discount rule updated" : "Discount rule created");
      reset();
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const removeMut = useMutation({
    mutationFn: (ruleId: string) => deleteRule({ data: { companyId, priceListId, ruleId } }),
    onSuccess: async () => {
      toast.success("Discount rule removed");
      reset();
      await refresh();
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{listName} — percentage discount rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          For the matching product, quantity and inclusive date range, the highest qualifying
          minimum quantity wins, followed by the latest effective start date. Only one percentage
          rule applies. It reduces the selected tier or fixed-list price (or the catalogue price)
          using half-up currency rounding. A separate invoice/quote line discount amount is applied
          afterwards, before tax. Saved and posted document prices never change automatically.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="discount-product-search">Find product or service</Label>
            <Input
              id="discount-product-search"
              placeholder="Search SKU or name"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setProductId("");
              }}
            />
            <RecordLookupSelect value={productId} onValueChange={setProductId}>
              <SelectTrigger aria-label="Product for percentage discount rule">
                <SelectValue placeholder="Choose product" />
              </SelectTrigger>
              <SelectContent>
                {productId && editing && !productsQ.data?.some((p) => p.id === productId) ? (
                  <SelectItem value={productId}>{editing.product_name}</SelectItem>
                ) : null}
                {(productsQ.data ?? []).map((p) => (
                  <SelectItem value={p.id} key={p.id}>
                    {p.code ? `${p.code} — ` : ""}
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </RecordLookupSelect>
            {productsQ.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {friendlyAuthError(productsQ.error)}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="discount-quantity">Minimum quantity (up to 4 decimals)</Label>
            <Input
              id="discount-quantity"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discount-percentage">Discount percentage (0–100%)</Label>
            <Input
              id="discount-percentage"
              inputMode="decimal"
              value={percentage}
              placeholder="e.g. 12.50"
              aria-invalid={Boolean(percentage) && !valid}
              onChange={(event) => setPercentage(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discount-from-date">Effective from (inclusive)</Label>
            <Input
              id="discount-from-date"
              type="date"
              min="1900-01-01"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="discount-to-date">Effective to (optional, inclusive)</Label>
            <Input
              id="discount-to-date"
              type="date"
              min={fromDate}
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button
              disabled={
                !canManage ||
                !isActive ||
                !productId ||
                !valid ||
                saveMut.isPending ||
                rulesQ.isError
              }
              onClick={() => saveMut.mutate()}
            >
              {saveMut.isPending ? "Saving…" : editingId ? "Save changes" : "Add discount rule"}
            </Button>
            <Button variant="outline" onClick={reset}>
              Clear
            </Button>
          </div>
        </div>
        {rulesQ.isPending ? <p className="text-sm">Loading discount rules…</p> : null}
        {rulesQ.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-destructive">{friendlyAuthError(rulesQ.error)}</p>
            <Button variant="outline" size="sm" onClick={() => rulesQ.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}
        {rulesQ.data?.length === 0 ? (
          <p className="rounded-md border p-3 text-sm">
            No percentage discount rules have been configured for this price list.
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
                  Qty ≥ {rule.min_quantity} · {discountBpsToPercent(rule.discount_bps)}% off ·{" "}
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
                  disabled={!canManage || removeMut.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove discount for ${rule.product_name} at quantity ${rule.min_quantity}?`,
                      )
                    ) {
                      removeMut.mutate(rule.id);
                    }
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
        {(rulesQ.data?.length ?? 0) >= 500 ? (
          <p className="text-xs text-muted-foreground">
            At the 500-rule limit. Paginated rule management is pending.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Price list currency: {currency}. Percentage discounts are non-compounding and apply to the
          resolved unit price before the existing line discount amount and sales tax.
        </p>
      </CardContent>
    </Card>
  );
}

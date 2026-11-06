import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { fromMinorUnits } from "@/lib/accounting/money";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import { validCataloguePrice } from "@/lib/products/catalogue-input";
import { CustomerPriceListDefaults } from "@/components/products/CustomerPriceListDefaults";
import { listProducts } from "@/lib/products/products.functions";
import {
  deleteProductPriceOverride,
  listProductCategories,
  listProductPriceLists,
  listProductPriceOverrides,
  saveProductCategory,
  saveProductPriceList,
  saveProductPriceOverride,
  type ProductCategory,
  type ProductPriceList,
} from "@/lib/products/catalogue-masterdata.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type WorkspaceProps = { companyId: string; currency: string };

export function CategoriesWorkspace({ companyId }: WorkspaceProps) {
  const qc = useQueryClient();
  const fetchCategories = useServerFn(listProductCategories);
  const saveCategory = useServerFn(saveProductCategory);
  const canManage = useCanDo("products.manage");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const categoriesQ = useQuery({
    queryKey: ["product-categories", companyId],
    queryFn: () => fetchCategories({ data: { companyId } }),
  });
  const saveMut = useMutation({
    mutationFn: () => saveCategory({
      data: {
        companyId, ...(editing ? { id: editing } : {}),
        name, description, isActive,
      },
    }),
    onSuccess: async () => {
      toast.success(editing ? "Category updated" : "Category created");
      setEditing(null);
      setName("");
      setDescription("");
      setIsActive(true);
      await qc.invalidateQueries({ queryKey: ["product-categories", companyId] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const edit = (row: ProductCategory) => {
    setEditing(row.id);
    setName(row.name);
    setDescription(row.description);
    setIsActive(row.is_active);
  };
  const reset = () => {
    setEditing(null); setName(""); setDescription(""); setIsActive(true);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
      <Card>
        <CardHeader><CardTitle>Categories</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Organise non-stock products and services. Archived categories remain attached to
            existing items.
          </p>
          {categoriesQ.isPending ? <p>Loading categories…</p> : null}
          {categoriesQ.isError ? (
            <div role="alert">
              <p className="text-sm text-destructive">{friendlyAuthError(categoriesQ.error)}</p>
              <Button size="sm" variant="outline" onClick={() => categoriesQ.refetch()}>
                Retry
              </Button>
            </div>
          ) : null}
          {categoriesQ.data?.length === 0 ? (
            <p className="rounded-md border p-3 text-sm">
              No categories yet. Create your first category.
            </p>
          ) : null}
          {categoriesQ.data?.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{category.name}</p>
                <p className="text-xs text-muted-foreground">
                  {category.is_active ? "Active" : "Archived"}
                  {category.description ? ` · ${category.description}` : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!canManage}
                onClick={() => edit(category)}
              >
                Edit
              </Button>
            </div>
          ))}
          {(categoriesQ.data?.length ?? 0) >= 500 ? (
            <p className="text-sm text-muted-foreground">
              Showing the first 500 categories; consolidate categories before adding more.
            </p>
          ) : null}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Edit category" : "New category"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="category-name">Name</Label>
            <Input id="category-name" maxLength={100} value={name}
              disabled={!canManage}
              onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="category-description">Description</Label>
            <Textarea id="category-description" maxLength={500} rows={3}
              value={description} disabled={!canManage}
              onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="category-active" checked={isActive} disabled={!canManage}
              onCheckedChange={(value) => setIsActive(value === true)} />
            <Label htmlFor="category-active">Active</Label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!canManage || !name.trim() || saveMut.isPending}
              onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? "Saving…" : editing ? "Save category" : "Create category"}
            </Button>
            <Button variant="outline" onClick={reset}>Clear</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function PriceListsWorkspace({ companyId, currency }: WorkspaceProps) {
  const qc = useQueryClient();
  const fetchLists = useServerFn(listProductPriceLists);
  const saveList = useServerFn(saveProductPriceList);
  const fetchOverrides = useServerFn(listProductPriceOverrides);
  const saveOverride = useServerFn(saveProductPriceOverride);
  const removeOverride = useServerFn(deleteProductPriceOverride);
  const searchProducts = useServerFn(listProducts);
  const canManage = useCanDo("products.manage");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [selectedListId, setSelectedListId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productId, setProductId] = useState("");
  const [price, setPrice] = useState("");
  const listsQ = useQuery({
    queryKey: ["product-price-lists", companyId],
    queryFn: () => fetchLists({ data: { companyId } }),
  });
  const chosen = listsQ.data?.find((list) => list.id === selectedListId);
  const pricesQ = useQuery({
    queryKey: ["product-price-overrides", companyId, selectedListId],
    queryFn: () => fetchOverrides({ data: { companyId, priceListId: selectedListId } }),
    enabled: Boolean(selectedListId),
  });
  const productsQ = useQuery({
    queryKey: ["products", companyId, productSearch],
    queryFn: () => searchProducts({
      data: { companyId, q: productSearch, limit: 100 },
    }),
    enabled: Boolean(selectedListId),
  });
  const priceIsValid = Boolean(price.trim()) && validCataloguePrice(price, currency);
  const saveListMut = useMutation({
    mutationFn: () => saveList({
      data: { companyId, ...(editing ? { id: editing } : {}), name, description, isActive },
    }),
    onSuccess: async (result) => {
      toast.success(editing ? "Price list updated" : "Price list created");
      setEditing(null);
      setName("");
      setDescription("");
      setIsActive(true);
      setSelectedListId(result.id);
      await qc.invalidateQueries({ queryKey: ["product-price-lists", companyId] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const overrideMut = useMutation({
    mutationFn: () => saveOverride({
      data: {
        companyId, priceListId: selectedListId, productId,
        unitPriceMinor: Number(parseMinorOrThrow(price, currency, "Price list amount")),
      },
    }),
    onSuccess: async () => {
      toast.success("Price override saved");
      setProductId("");
      setPrice("");
      await qc.invalidateQueries({
        queryKey: ["product-price-overrides", companyId, selectedListId],
      });
      await qc.invalidateQueries({
        queryKey: ["sales-draft-price-list", companyId, selectedListId],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const deleteMut = useMutation({
    mutationFn: (priceListItemId: string) =>
      removeOverride({ data: { companyId, priceListItemId } }),
    onSuccess: async () => {
      toast.success("Price override removed");
      await qc.invalidateQueries({
        queryKey: ["product-price-overrides", companyId, selectedListId],
      });
      await qc.invalidateQueries({
        queryKey: ["sales-draft-price-list", companyId, selectedListId],
      });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const startEditing = (list: ProductPriceList) => {
    setEditing(list.id);
    setName(list.name);
    setDescription(list.description);
    setIsActive(list.is_active);
    setSelectedListId(list.id);
  };
  const reset = () => {
    setEditing(null); setName(""); setDescription(""); setIsActive(true);
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Price lists store per-item sales price alternatives in {currency}. In new or editable
        invoice and quote drafts, select a price list to use its defaults on newly chosen products.
        Existing lines change only through the explicit preview-and-apply action. Historical
        documents are never repriced automatically.
      </p>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <Card>
          <CardHeader><CardTitle>Price lists</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {listsQ.isPending ? <p>Loading price lists…</p> : null}
            {listsQ.isError ? (
              <div role="alert">
                <p className="text-destructive">{friendlyAuthError(listsQ.error)}</p>
                <Button variant="outline" size="sm" onClick={() => listsQ.refetch()}>Retry</Button>
              </div>
            ) : null}
            {listsQ.data?.length === 0 ? (
              <p className="rounded-md border p-3 text-sm">No price lists yet.</p>
            ) : null}
            {listsQ.data?.map((list) => (
              <div
                key={list.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
              >
                <div>
                  <p className="font-medium">{list.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {list.currency_code} · {list.is_active ? "Active" : "Archived"}
                  </p>
                  {list.description ? (
                    <p className="text-sm text-muted-foreground">{list.description}</p>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    setSelectedListId(list.id);
                    setProductId(""); setPrice("");
                  }}>Prices</Button>
                  <Button variant="outline" size="sm" disabled={!canManage}
                    onClick={() => startEditing(list)}>Edit</Button>
                </div>
              </div>
            ))}
            {(listsQ.data?.length ?? 0) >= 500 ? (
              <p className="text-sm text-muted-foreground">Showing first 500 price lists.</p>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{editing ? "Edit price list" : "New price list"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="price-list-name">Name</Label>
              <Input id="price-list-name" maxLength={100} value={name} disabled={!canManage}
                onChange={(event) => setName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="price-list-description">Description</Label>
              <Textarea id="price-list-description" value={description}
                disabled={!canManage} maxLength={500} rows={3}
                onChange={(event) => setDescription(event.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="price-list-active" checked={isActive} disabled={!canManage}
                onCheckedChange={(value) => setIsActive(value === true)} />
              <Label htmlFor="price-list-active">Active</Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button disabled={!canManage || !name.trim() || saveListMut.isPending}
                onClick={() => saveListMut.mutate()}>
                {saveListMut.isPending ? "Saving…" : editing ? "Save list" : "Create list"}
              </Button>
              <Button variant="outline" onClick={reset}>Clear</Button>
            </div>
          </CardContent>
        </Card>
      </div>
      {chosen ? (
        <Card>
          <CardHeader><CardTitle>{chosen.name} — item prices</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Each override is an exact non-negative sales price in {chosen.currency_code}.
              No tax or accounting entries are posted.
            </p>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
              <div className="space-y-2">
                <Label htmlFor="price-product-search">Find product or service</Label>
                <Input id="price-product-search" value={productSearch}
                  placeholder="Search by SKU or name"
                  onChange={(event) => { setProductSearch(event.target.value); setProductId(""); }}
                />
                <Select value={productId} onValueChange={(value) => {
                  setProductId(value);
                  const existing = pricesQ.data?.find((item) => item.product_id === value);
                  setPrice(
                    existing ? fromMinorUnits(BigInt(existing.unit_price_minor), currency) : "",
                  );
                }}>
                  <SelectTrigger aria-label="Product for price override">
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {productsQ.data?.map((product) => (
                      <SelectItem value={product.id} key={product.id}>
                        {product.code ? `${product.code} — ` : ""}{product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {productsQ.isError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {friendlyAuthError(productsQ.error)}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="price-list-value">Unit sales price ({currency})</Label>
                <Input id="price-list-value" inputMode="decimal" value={price}
                  aria-invalid={Boolean(price.trim()) && !priceIsValid}
                  onChange={(event) => setPrice(event.target.value)} />
              </div>
              <Button disabled={!canManage || !chosen.is_active || !productId ||
                !priceIsValid || overrideMut.isPending}
                onClick={() => overrideMut.mutate()}>
                <Plus className="size-4" /> {overrideMut.isPending ? "Saving…" : "Save price"}
              </Button>
            </div>
            {pricesQ.isPending ? <p>Loading overrides…</p> : null}
            {pricesQ.isError ? (
              <div role="alert">
                <p className="text-sm text-destructive">{friendlyAuthError(pricesQ.error)}</p>
                <Button size="sm" variant="outline" onClick={() => pricesQ.refetch()}>Retry</Button>
              </div>
            ) : null}
            {pricesQ.data?.length === 0 ? (
              <p className="rounded-md border p-3 text-sm">No price overrides for this list.</p>
            ) : null}
            <div className="space-y-2">
              {pricesQ.data?.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {item.product_code ? `${item.product_code} — ` : ""}{item.product_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Base: {fromMinorUnits(BigInt(item.base_price_minor), currency)} {currency}
                      {" · "}List: {fromMinorUnits(BigInt(item.unit_price_minor), currency)}{" "}
                      {currency}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={!canManage || !chosen.is_active}
                      onClick={() => {
                        setProductSearch(item.product_name);
                        setProductId(item.product_id);
                        setPrice(fromMinorUnits(BigInt(item.unit_price_minor), currency));
                      }}>Edit</Button>
                    <Button variant="ghost" size="sm"
                      disabled={!canManage || deleteMut.isPending}
                      aria-label={`Remove price override for ${item.product_name}`}
                      onClick={() => {
                        if (window.confirm(`Remove the price override for ${item.product_name}?`)) {
                          deleteMut.mutate(item.id);
                        }
                      }}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {(pricesQ.data?.length ?? 0) >= 500 ? (
              <p className="text-sm text-muted-foreground">
                Showing the first 500 overrides; split large price lists before adding more.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
      <CustomerPriceListDefaults
        companyId={companyId}
        currency={currency}
        priceLists={listsQ.data ?? []}
      />
    </div>
  );
}

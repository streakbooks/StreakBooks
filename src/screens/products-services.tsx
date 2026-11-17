import { QueryErrorState } from "@/components/common/QueryErrorState";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Package, Plus, Archive, Copy, Download, Columns3 } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useFormat } from "@/hooks/use-format";
import { listAccounts } from "@/lib/accounting/accounting.functions";
import { fromMinorUnits } from "@/lib/accounting/money";
import { parseMinorOrThrow } from "@/lib/purchases/money-input";
import { listTaxCodes } from "@/lib/tax/tax.functions";
import { listProductCategories } from "@/lib/products/catalogue-masterdata.functions";
import { CategoriesWorkspace, PriceListsWorkspace } from "@/components/products/ProductsMasterData";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useCanDo } from "@/hooks/use-can";
import {
  archiveProduct,
  listProductsPage,
  exportProductsCsv,
  setProductsActive,
  setProductPrices,
  upsertProduct,
  type ProductRow,
} from "@/lib/products/products.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { productSkuProblem, validCataloguePrice } from "@/lib/products/catalogue-input";
import { downloadCsv } from "@/lib/reports/csv";
import {
  DocumentRecordPanel,
  type DocumentRecordHandle,
} from "@/components/documents/DocumentRecordPanel";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { WorkspaceInsights } from "@/components/workspace/WorkspaceInsights";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { AccountLookup, LookupSelect } from "@/components/lookup";
import { TaxCodeCreateForm } from "@/components/lookup/create-forms";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ProductsPage() {
  const { company, isPending } = useActiveCompany();
  if (isPending) return <LoadingState />;
  if (!company) {
    return (
      <CompanyEmptyState
        title="No organisation selected"
        description="Open a company to manage products and services."
      />
    );
  }
  return (
    <Tabs defaultValue="catalogue" className="space-y-4">
      <TabsList aria-label="Products and services sections">
        <TabsTrigger value="catalogue">Catalogue</TabsTrigger>
        <TabsTrigger value="categories">Categories</TabsTrigger>
        <TabsTrigger value="price-lists">Price Lists</TabsTrigger>
      </TabsList>
      <TabsContent value="catalogue">
        <ProductsWorkspace companyId={company.id} currency={company.base_currency} />
      </TabsContent>
      <TabsContent value="categories">
        <CategoriesWorkspace companyId={company.id} currency={company.base_currency} />
      </TabsContent>
      <TabsContent value="price-lists">
        <PriceListsWorkspace companyId={company.id} currency={company.base_currency} />
      </TabsContent>
    </Tabs>
  );
}

function ProductsWorkspace({ companyId, currency }: { companyId: string; currency: string }) {
  const queryClient = useQueryClient();
  const fmt = useFormat();
  const fetchProducts = useServerFn(listProductsPage);
  const exportProducts = useServerFn(exportProductsCsv);
  const fetchAccounts = useServerFn(listAccounts);
  const saveProduct = useServerFn(upsertProduct);
  const doArchive = useServerFn(archiveProduct);
  const updateMany = useServerFn(setProductsActive);
  const updatePrices = useServerFn(setProductPrices);
  const fetchTaxCodes = useServerFn(listTaxCodes);
  const fetchCategories = useServerFn(listProductCategories);
  const canManage = useCanDo("products.manage");
  const canTax = useCanDo("tax.settings");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    "code",
    "kind",
    "salesPrice",
    "purchaseCost",
    "status",
  ]);

  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [kind, setKind] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [status, setStatus] = useState("active");
  const [sort, setSort] = useState("name");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"archive" | "restore" | null>(null);
  const [bulkPriceOpen, setBulkPriceOpen] = useState(false);
  const [bulkPriceField, setBulkPriceField] = useState<"sales_price_minor" | "purchase_cost_minor">(
    "sales_price_minor",
  );
  const [bulkPriceAmount, setBulkPriceAmount] = useState("");
  const [open, setOpen] = useState(false);
  const productRecordRef = useRef<DocumentRecordHandle>(null);
  const [editing, setEditing] = useState<ProductRow | null>(null);

  const [form, setForm] = useState({
    kind: "service",
    categoryId: "",
    code: "",
    name: "",
    description: "",
    salesPrice: "",
    purchaseCost: "",
    incomeAccountId: "",
    expenseAccountId: "",
    salesTaxBps: "0",
    purchaseTaxBps: "0",
    unit: "each",
    isActive: true,
  });

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQ(q), 250);
    return () => clearTimeout(handle);
  }, [q]);

  const productsQ = useQuery({
    queryKey: [
      "products-page",
      companyId,
      debouncedQ,
      kind,
      categoryFilter,
      status,
      sort,
      page,
      pageSize,
    ],
    queryFn: () =>
      fetchProducts({
        data: {
          companyId,
          q: debouncedQ,
          kind,
          status,
          sort,
          page,
          pageSize,
          ...(categoryFilter !== "all" ? { categoryId: categoryFilter } : {}),
        },
      }),
  });
  const rows = (productsQ.data?.rows ?? []) as ProductRow[];
  const total = productsQ.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const showColumn = (column: string) => visibleColumns.includes(column);
  useEffect(() => setPage(1), [companyId, q, kind, categoryFilter, status, sort, pageSize]);
  useEffect(() => {
    if (!productsQ.isPending && page > totalPages) setPage(totalPages);
  }, [page, totalPages, productsQ.isPending]);
  const selectedRows = rows.filter((row) => selectedIds.includes(row.id));
  const allVisibleSelected =
    rows.length > 0 && rows.slice(0, 100).every((row) => selectedIds.includes(row.id));
  const hasFilters = Boolean(
    q || kind !== "all" || categoryFilter !== "all" || status !== "active",
  );

  // A selection is only ever valid for the current company and visible result set.
  useEffect(
    () => setSelectedIds([]),
    [companyId, q, kind, categoryFilter, status, sort, page, pageSize],
  );
  const accountsQ = useQuery({
    queryKey: ["accounts", companyId],
    queryFn: () => fetchAccounts({ data: { companyId } }),
  });

  const categoriesQ = useQuery({
    queryKey: ["product-categories", companyId],
    queryFn: () => fetchCategories({ data: { companyId } }),
  });
  const categoryNameById = new Map((categoriesQ.data ?? []).map((item) => [item.id, item.name]));

  const taxCodesQ = useQuery({
    queryKey: ["tax-codes", companyId],
    queryFn: () => fetchTaxCodes({ data: { companyId } }),
  });
  // Pick a tax code by name; the item stores that code's current rate (basis points).
  const taxChoices = useMemo(() => {
    const rows = (taxCodesQ.data ?? []) as Array<{
      id: string;
      code: string;
      name: string;
      is_active: boolean;
      tax_rates: { rate_bps: number } | { rate_bps: number }[] | null;
    }>;
    const seen = new Set<string>();
    return (
      rows
        .filter((t) => t.is_active)
        .map((t) => {
          const rate = Array.isArray(t.tax_rates) ? t.tax_rates[0] : t.tax_rates;
          const bps = rate?.rate_bps ?? 0;
          return {
            key: String(bps),
            code: t.code,
            name: t.name,
            bps,
            label: `${t.code} — ${t.name} (${(bps / 100).toFixed(2)}%)`,
          };
        })
        // One entry per rate: the item stores the rate, so two codes at 20% are the same choice.
        .filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)))
    );
  }, [taxCodesQ.data]);
  const salesPriceInvalid = !validCataloguePrice(form.salesPrice, currency);
  const purchaseCostInvalid = !validCataloguePrice(form.purchaseCost, currency);
  const codeProblem = productSkuProblem(form.code);

  const incomeAccounts = useMemo(
    () =>
      (
        (accountsQ.data ?? []) as Array<{
          id: string;
          code: string;
          name: string;
          account_type: string;
          is_active: boolean;
          is_postable: boolean;
        }>
      ).filter((a) => a.account_type === "income" && a.is_active && a.is_postable),
    [accountsQ.data],
  );
  const expenseAccounts = useMemo(
    () =>
      (
        (accountsQ.data ?? []) as Array<{
          id: string;
          code: string;
          name: string;
          account_type: string;
          is_active: boolean;
          is_postable: boolean;
        }>
      ).filter((a) => a.is_active && a.is_postable && a.account_type === "expense"),
    [accountsQ.data],
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      // Integer minor units via the shared parser - never floats, and the currency's own decimals.
      const salesPriceMinor = Number(
        parseMinorOrThrow(form.salesPrice || "0", currency, "Sales price"),
      );
      const purchaseCostMinor = Number(
        parseMinorOrThrow(form.purchaseCost || "0", currency, "Purchase cost"),
      );
      if (!form.name.trim()) throw new Error("Name is required");
      if (codeProblem) throw new Error(codeProblem);
      const data: Parameters<typeof saveProduct>[0]["data"] = {
        companyId,
        kind: form.kind,
        categoryId: form.categoryId || null,
        name: form.name,
        salesPriceMinor,
        purchaseCostMinor,
        salesTaxRateBps: Number(form.salesTaxBps) || 0,
        purchaseTaxRateBps: Number(form.purchaseTaxBps) || 0,
        unit: form.unit,
        isActive: form.isActive,
      };
      if (editing?.id) data.id = editing.id;
      if (form.code) data.code = form.code;
      if (form.description) data.description = form.description;
      if (form.incomeAccountId) data.incomeAccountId = form.incomeAccountId;
      if (form.expenseAccountId) data.expenseAccountId = form.expenseAccountId;
      return saveProduct({ data });
    },
    onSuccess: async (result) => {
      try {
        await productRecordRef.current?.flush(result.id);
      } catch (e) {
        toast.warning(
          `Item saved, but notes or files could not be stored: ${friendlyAuthError(e)}`,
        );
      }
      toast.success(editing ? "Product updated" : "Product created");
      setOpen(false);
      setEditing(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["products-page", companyId] }),
      ]);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const exportMut = useMutation({
    mutationFn: () =>
      exportProducts({
        data: {
          companyId,
          q,
          kind,
          status,
          sort,
          ...(categoryFilter !== "all" ? { categoryId: categoryFilter } : {}),
        },
      }),
    onSuccess: (file) => {
      downloadCsv(file.filename, file.csv);
      toast.success(`Exported ${file.count} catalogue item(s) in ${file.currency}`);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const bulkPriceMut = useMutation({
    mutationFn: () => {
      if (!bulkPriceAmount.trim() || !validCataloguePrice(bulkPriceAmount, currency)) {
        throw new Error("Enter a valid non-negative price for the organisation currency");
      }
      if (!selectedRows.length) throw new Error("Select items before setting their price");
      return updatePrices({
        data: {
          companyId,
          productIds: selectedRows.map((row) => row.id),
          field: bulkPriceField,
          valueMinor: Number(parseMinorOrThrow(bulkPriceAmount, currency, "Bulk price")),
        },
      });
    },
    onSuccess: async (result) => {
      toast.success(`Updated the price of ${result.changed} catalogue item(s)`);
      if (result.auditError) {
        toast.warning(`Prices saved, but audit recording failed: ${result.auditError}`);
      }
      setBulkPriceOpen(false);
      setBulkPriceAmount("");
      setSelectedIds([]);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["products-page", companyId] }),
      ]);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  const bulkMut = useMutation({
    mutationFn: (action: "archive" | "restore") => {
      const productIds = selectedRows
        .filter((item) => (action === "archive" ? item.is_active : !item.is_active))
        .map((item) => item.id);
      if (!productIds.length) throw new Error("No eligible items selected");
      return updateMany({ data: { companyId, productIds, isActive: action === "restore" } });
    },
    onSuccess: async (result, action) => {
      toast.success(`${result.changed} item(s) ${action === "archive" ? "archived" : "restored"}`);
      setSelectedIds([]);
      setBulkAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["products", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["products-page", companyId] }),
      ]);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  function resetFilters() {
    setQ("");
    setKind("all");
    setCategoryFilter("all");
    setStatus("active");
    setSort("name");
    setPage(1);
    setSelectedIds([]);
  }

  function openCreate() {
    setEditing(null);
    setForm({
      kind: "service",
      categoryId: "",
      code: "",
      name: "",
      description: "",
      salesPrice: "",
      purchaseCost: "",
      incomeAccountId: "",
      expenseAccountId: "",
      salesTaxBps: "0",
      purchaseTaxBps: "0",
      unit: "each",
      isActive: true,
    });
    setOpen(true);
  }

  function openEdit(p: ProductRow) {
    setEditing(p);
    setForm({
      kind: p.kind,
      categoryId: p.category_id ?? "",
      code: p.code ?? "",
      name: p.name,
      description: p.description ?? "",
      salesPrice: fromMinorUnits(BigInt(p.sales_price_minor), currency),
      purchaseCost: fromMinorUnits(BigInt(p.purchase_cost_minor), currency),
      incomeAccountId: p.income_account_id ?? "",
      expenseAccountId: p.expense_account_id ?? "",
      salesTaxBps: String(p.sales_tax_rate_bps),
      purchaseTaxBps: String(p.purchase_tax_rate_bps),
      unit: p.unit,
      isActive: p.is_active,
    });
    setOpen(true);
  }

  function openDuplicate(item: ProductRow) {
    openEdit(item);
    setEditing(null);
    setForm((current) => ({
      ...current,
      code: "",
      name: `${item.name.slice(0, 193)} (copy)`,
      isActive: true,
    }));
  }

  const requiredQueries = [accountsQ, taxCodesQ, categoriesQ];
  if (requiredQueries.some((query) => query.isError && query.data === undefined))
    return (
      <QueryErrorState queries={requiredQueries} title="Could not load item accounting options" />
    );

  return (
    <ListWorkspace
      title="Products & Services"
      description="Catalogue defaults for sales and purchase lines. Stock valuation is not enabled — this is a non-inventory catalogue."
      insights={
        <WorkspaceInsights
          title="Catalogue shortcuts"
          facts={[
            { label: "Matching items", value: String(total) },
            {
              label: "Inventory engine",
              value: "Not enabled — non-inventory catalogue",
            },
            {
              label: "Manage permission",
              value: canManage ? "products.manage" : "view only",
            },
          ]}
          links={[
            {
              label: "Import catalogue CSV",
              to: "/imports",
              search: { module: "products" },
              hint: "Bulk import products and services",
            },
            {
              label: "Sales invoices",
              to: "/sales/invoices",
              hint: "Use catalogue defaults on sales lines",
            },
            {
              label: "Purchase bills",
              to: "/purchases/bills",
              hint: "Use catalogue defaults on bill lines",
            },
          ]}
          footer="Counts are exact for the active filters. No stock-on-hand or COGS inventory is claimed."
        />
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" asChild>
            <Link to="/imports" search={{ module: "products" }}>
              Import catalogue CSV
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={exportMut.isPending || productsQ.isPending || q !== debouncedQ}
            title="Reporting export (up to 5,000 items / 5 MB). Existing CSV import is not lossless."
            onClick={() => exportMut.mutate()}
          >
            <Download className="size-4" />
            {exportMut.isPending ? "Exporting…" : "Export CSV"}
          </Button>
          <Button size="sm" onClick={openCreate} disabled={!canManage}>
            <Plus className="size-4" />
            New item
          </Button>
        </div>
      }
    >
      <Alert className="mb-4">
        <AlertDescription>
          Selecting an item on invoices/bills can use these defaults. No stock-on-hand or COGS
          inventory engine is claimed.
        </AlertDescription>
      </Alert>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Matching catalogue items</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{total}</p>
          <p className="text-xs text-muted-foreground">Exact count for the active filters</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Services on this page</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {rows.filter((p) => p.kind === "service").length}
          </p>
          <p className="text-xs text-muted-foreground">Non-stock services</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Products (non-stock) on this page</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {rows.filter((p) => p.kind === "product").length}
          </p>
          <p className="text-xs text-muted-foreground">Catalogue only — no stock-on-hand</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground">Non-inventory items on this page</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {rows.filter((p) => p.kind === "non_inventory").length}
          </p>
          <p className="text-xs text-muted-foreground">No stock valuation implied</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          aria-label="Search products and services"
          maxLength={100}
          placeholder="Search name, code or description…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Select value={kind} onValueChange={setKind}>
          <SelectTrigger className="w-40" aria-label="Item kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            <SelectItem value="service">Services</SelectItem>
            <SelectItem value="product">Products</SelectItem>
            <SelectItem value="non_inventory">Non-inventory</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44" aria-label="Category filter">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {(categoriesQ.data ?? []).map((category) => (
              <SelectItem value={category.id} key={category.id}>
                {category.name}
                {category.is_active ? "" : " (archived)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-40" aria-label="Item status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-44" aria-label="Sort catalogue">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Name: A–Z</SelectItem>
            <SelectItem value="name_desc">Name: Z–A</SelectItem>
            <SelectItem value="code">Code / SKU</SelectItem>
            <SelectItem value="price_asc">Sales price: low to high</SelectItem>
            <SelectItem value="price_desc">Sales price: high to low</SelectItem>
            <SelectItem value="recent">Newest first</SelectItem>
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="size-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {[
              { id: "code", label: "Code / SKU" },
              { id: "kind", label: "Kind" },
              { id: "category", label: "Category" },
              { id: "salesPrice", label: "Sales price" },
              { id: "purchaseCost", label: "Purchase cost" },
              { id: "unit", label: "Unit" },
              { id: "salesTax", label: "Sales tax" },
              { id: "purchaseTax", label: "Purchase tax" },
              { id: "created", label: "Created" },
              { id: "status", label: "Status" },
            ].map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={showColumn(column.id)}
                onCheckedChange={(checked) =>
                  setVisibleColumns((columns) =>
                    checked
                      ? [...new Set([...columns, column.id])]
                      : columns.filter((item) => item !== column.id),
                  )
                }
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="ghost" size="sm" onClick={resetFilters}>
          Reset filters
        </Button>
      </div>

      {selectedRows.length > 0 && canManage ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="mr-auto text-sm font-medium">
            {selectedRows.length} selected (max 100 per batch)
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={bulkMut.isPending || bulkPriceMut.isPending}
            onClick={() => {
              setBulkPriceField("sales_price_minor");
              setBulkPriceAmount("");
              setBulkPriceOpen(true);
            }}
          >
            Set prices
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={
              !selectedRows.some((row) => row.is_active) ||
              bulkMut.isPending ||
              bulkPriceMut.isPending
            }
            onClick={() => setBulkAction("archive")}
          >
            Archive selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={
              !selectedRows.some((row) => !row.is_active) ||
              bulkMut.isPending ||
              bulkPriceMut.isPending
            }
            onClick={() => setBulkAction("restore")}
          >
            Restore selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
            Clear selection
          </Button>
        </div>
      ) : null}

      {productsQ.isPending ? (
        <LoadingState />
      ) : productsQ.isError ? (
        <ErrorState
          title="Could not load products"
          description={friendlyAuthError(productsQ.error)}
          onRetry={() => productsQ.refetch()}
        />
      ) : rows.length === 0 ? (
        <div className="space-y-3">
          <EmptyState
            icon={Package}
            title={hasFilters ? "No matching items" : "No products yet"}
            description={
              hasFilters
                ? "Try another search, kind or status filter."
                : "Create services and non-inventory items with default accounts and tax rates."
            }
          />
          <div className="flex justify-center">
            {hasFilters ? (
              <Button size="sm" variant="outline" onClick={resetFilters}>
                Reset filters
              </Button>
            ) : (
              <Button size="sm" onClick={openCreate} disabled={!canManage}>
                <Plus className="size-4" /> New item
              </Button>
            )}
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        aria-label="Select up to 100 visible items"
                        disabled={!canManage || bulkMut.isPending}
                        checked={
                          allVisibleSelected
                            ? true
                            : selectedRows.length > 0
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={(checked) =>
                          setSelectedIds(
                            checked === true ? rows.slice(0, 100).map((item) => item.id) : [],
                          )
                        }
                      />
                    </TableHead>
                    {showColumn("code") ? <TableHead>Code</TableHead> : null}
                    <TableHead>Name</TableHead>
                    {showColumn("kind") ? <TableHead>Kind</TableHead> : null}
                    {showColumn("category") ? <TableHead>Category</TableHead> : null}
                    {showColumn("salesPrice") ? (
                      <TableHead className="text-right">Sales price</TableHead>
                    ) : null}
                    {showColumn("purchaseCost") ? (
                      <TableHead className="text-right">Purchase cost</TableHead>
                    ) : null}
                    {showColumn("unit") ? <TableHead>Unit</TableHead> : null}
                    {showColumn("salesTax") ? (
                      <TableHead className="text-right">Sales tax</TableHead>
                    ) : null}
                    {showColumn("purchaseTax") ? (
                      <TableHead className="text-right">Purchase tax</TableHead>
                    ) : null}
                    {showColumn("created") ? <TableHead>Created</TableHead> : null}
                    {showColumn("status") ? <TableHead>Status</TableHead> : null}
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Checkbox
                          aria-label={`Select ${p.name}`}
                          checked={selectedIds.includes(p.id)}
                          disabled={
                            !canManage ||
                            bulkMut.isPending ||
                            (selectedIds.length >= 100 && !selectedIds.includes(p.id))
                          }
                          onCheckedChange={(checked) =>
                            setSelectedIds((previous) =>
                              checked === true
                                ? [...new Set([...previous, p.id])].slice(0, 100)
                                : previous.filter((id) => id !== p.id),
                            )
                          }
                        />
                      </TableCell>
                      {showColumn("code") ? (
                        <TableCell className="font-mono text-xs">{p.code ?? "—"}</TableCell>
                      ) : null}
                      <TableCell>
                        <div className="font-medium">{p.name}</div>
                        {p.description ? (
                          <div className="text-xs text-muted-foreground line-clamp-1">
                            {p.description}
                          </div>
                        ) : null}
                      </TableCell>
                      {showColumn("kind") ? (
                        <TableCell className="capitalize">{p.kind.replace("_", " ")}</TableCell>
                      ) : null}
                      {showColumn("category") ? (
                        <TableCell>
                          {p.category_id ? (categoryNameById.get(p.category_id) ?? "Unknown") : "—"}
                        </TableCell>
                      ) : null}
                      {showColumn("salesPrice") ? (
                        <TableCell className="money">
                          {fmt.money(p.sales_price_minor, currency)}
                        </TableCell>
                      ) : null}
                      {showColumn("purchaseCost") ? (
                        <TableCell className="money">
                          {fmt.money(p.purchase_cost_minor, currency)}
                        </TableCell>
                      ) : null}
                      {showColumn("unit") ? <TableCell>{p.unit || "—"}</TableCell> : null}
                      {showColumn("salesTax") ? (
                        <TableCell className="text-right tabular-nums">
                          {(p.sales_tax_rate_bps / 100).toFixed(2)}%
                        </TableCell>
                      ) : null}
                      {showColumn("purchaseTax") ? (
                        <TableCell className="text-right tabular-nums">
                          {(p.purchase_tax_rate_bps / 100).toFixed(2)}%
                        </TableCell>
                      ) : null}
                      {showColumn("created") ? (
                        <TableCell>{p.created_at.slice(0, 10)}</TableCell>
                      ) : null}
                      {showColumn("status") ? (
                        <TableCell>
                          {p.is_active ? (
                            <Badge variant="success">Active</Badge>
                          ) : (
                            <Badge variant="neutral">Archived</Badge>
                          )}
                        </TableCell>
                      ) : null}
                      <TableCell className="space-x-1 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canManage}
                          onClick={() => openEdit(p)}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canManage}
                          onClick={() => openDuplicate(p)}
                        >
                          <Copy className="size-4" /> Duplicate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canManage || bulkMut.isPending}
                          onClick={async () => {
                            try {
                              await doArchive({
                                data: { companyId, productId: p.id, restore: !p.is_active },
                              });
                              toast.success(p.is_active ? "Archived" : "Restored");
                              await productsQ.refetch();
                            } catch (e) {
                              toast.error(friendlyAuthError(e));
                            }
                          }}
                        >
                          <Archive className="size-4" />
                          {p.is_active ? "Archive" : "Restore"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
      {total > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total} items
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger className="w-32" aria-label="Items per page">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 per page</SelectItem>
                <SelectItem value="50">50 per page</SelectItem>
                <SelectItem value="100">100 per page</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || productsQ.isPending}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <span className="text-sm tabular-nums" aria-live="polite">
              Page {page} of {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || productsQ.isPending}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={bulkPriceOpen}
        onOpenChange={(next) => {
          if (!bulkPriceMut.isPending) setBulkPriceOpen(next);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Set a fixed price for selected items</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This replaces one catalogue price field on {selectedRows.length} selected items. It does
            not adjust prices by a percentage or change existing invoices, bills or journals.
          </p>
          <div className="grid gap-2">
            <Label>Price to replace</Label>
            <Select
              value={bulkPriceField}
              onValueChange={(field) =>
                setBulkPriceField(field as "sales_price_minor" | "purchase_cost_minor")
              }
            >
              <SelectTrigger aria-label="Bulk price field">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales_price_minor">Sales price</SelectItem>
                <SelectItem value="purchase_cost_minor">Purchase cost</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="bulk-product-price">New price ({currency})</Label>
            <Input
              id="bulk-product-price"
              inputMode="decimal"
              value={bulkPriceAmount}
              placeholder="Enter the exact amount"
              aria-invalid={
                Boolean(bulkPriceAmount) && !validCataloguePrice(bulkPriceAmount, currency)
              }
              onChange={(event) => setBulkPriceAmount(event.target.value)}
            />
          </div>
          {bulkPriceAmount.trim() && validCataloguePrice(bulkPriceAmount, currency) ? (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">
                Preview — replace the selected price with {currency} {bulkPriceAmount}
              </p>
              <div className="mt-2 space-y-1 text-muted-foreground">
                {selectedRows.slice(0, 5).map((item) => (
                  <p key={item.id}>
                    {item.name}:{" "}
                    {fmt.money(
                      bulkPriceField === "sales_price_minor"
                        ? item.sales_price_minor
                        : item.purchase_cost_minor,
                      currency,
                    )}{" "}
                    → {bulkPriceAmount}
                  </p>
                ))}
                {selectedRows.length > 5 ? <p>And {selectedRows.length - 5} more item(s)</p> : null}
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={bulkPriceMut.isPending}
              onClick={() => setBulkPriceOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                bulkPriceMut.isPending ||
                !selectedRows.length ||
                !bulkPriceAmount.trim() ||
                !validCataloguePrice(bulkPriceAmount, currency)
              }
              onClick={() => bulkPriceMut.mutate()}
            >
              {bulkPriceMut.isPending ? "Updating…" : `Set price on ${selectedRows.length} items`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={bulkAction !== null}
        onOpenChange={(next) => {
          if (!next && !bulkMut.isPending) setBulkAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {bulkAction === "archive" ? "Archive selected items?" : "Restore selected items?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {
              selectedRows.filter((row) =>
                bulkAction === "archive" ? row.is_active : !row.is_active,
              ).length
            }{" "}
            eligible items will change status. Historical documents are retained.
            {bulkAction === "restore"
              ? " Restoration may fail if an active item already uses the same SKU."
              : ""}
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={bulkMut.isPending}
              onClick={() => setBulkAction(null)}
            >
              Cancel
            </Button>
            <Button
              disabled={!bulkAction || bulkMut.isPending}
              onClick={() => {
                if (bulkAction) bulkMut.mutate(bulkAction);
              }}
            >
              {bulkMut.isPending
                ? "Updating…"
                : bulkAction === "archive"
                  ? "Archive items"
                  : "Restore items"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!saveMut.isPending) setOpen(next);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit item" : "New product / service"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid gap-1">
              <Label>Kind</Label>
              <Select value={form.kind} onValueChange={(v) => setForm((f) => ({ ...f, kind: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="service">Service</SelectItem>
                  <SelectItem value="product">Product (non-stock)</SelectItem>
                  <SelectItem value="non_inventory">Non-inventory</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Category</Label>
              <Select
                value={form.categoryId || "none"}
                onValueChange={(categoryId) =>
                  setForm((current) => ({
                    ...current,
                    categoryId: categoryId === "none" ? "" : categoryId,
                  }))
                }
              >
                <SelectTrigger aria-label="Product category">
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {(categoriesQ.data ?? [])
                    .filter((category) => category.is_active || category.id === form.categoryId)
                    .map((category) => (
                      <SelectItem value={category.id} key={category.id}>
                        {category.name}
                        {category.is_active ? "" : " (archived)"}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Code / SKU</Label>
                <Input
                  value={form.code}
                  maxLength={40}
                  aria-invalid={Boolean(codeProblem)}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                />
                {codeProblem ? <p className="text-xs text-destructive">{codeProblem}</p> : null}
              </div>
              <div className="grid gap-1">
                <Label>Unit</Label>
                <Input
                  value={form.unit}
                  onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>
                Name
                <span aria-hidden className="ml-0.5 text-destructive">
                  *
                </span>
                <span className="sr-only"> (required)</span>
              </Label>
              <Input
                value={form.name}
                maxLength={200}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="grid gap-1">
              <Label>Description</Label>
              <Textarea
                rows={3}
                maxLength={2000}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Sales price ({currency})</Label>
                <Input
                  inputMode="decimal"
                  aria-invalid={salesPriceInvalid}
                  value={form.salesPrice}
                  onChange={(e) => setForm((f) => ({ ...f, salesPrice: e.target.value }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>Purchase cost ({currency})</Label>
                <Input
                  inputMode="decimal"
                  aria-invalid={purchaseCostInvalid}
                  value={form.purchaseCost}
                  onChange={(e) => setForm((f) => ({ ...f, purchaseCost: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <Label>Income account</Label>
              <AccountLookup
                ariaLabel="Income account"
                accounts={incomeAccounts}
                value={form.incomeAccountId}
                onChange={(v) => setForm((f) => ({ ...f, incomeAccountId: v }))}
                companyId={companyId}
                purpose="income"
                productKind={form.kind}
                placeholder="None"
                allowClear
              />
            </div>
            <div className="grid gap-1">
              <Label>Purchase / expense account</Label>
              <AccountLookup
                ariaLabel="Purchase / expense account"
                accounts={expenseAccounts}
                value={form.expenseAccountId}
                onChange={(v) => setForm((f) => ({ ...f, expenseAccountId: v }))}
                companyId={companyId}
                purpose="expense"
                productKind={form.kind}
                placeholder="None"
                allowClear
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Sales tax</Label>
                <TaxSelect
                  companyId={companyId}
                  canCreate={canTax}
                  value={form.salesTaxBps}
                  choices={taxChoices}
                  onChange={(v) => setForm((f) => ({ ...f, salesTaxBps: v }))}
                />
              </div>
              <div className="grid gap-1">
                <Label>Purchase tax</Label>
                <TaxSelect
                  companyId={companyId}
                  canCreate={canTax}
                  value={form.purchaseTaxBps}
                  choices={taxChoices}
                  onChange={(v) => setForm((f) => ({ ...f, purchaseTaxBps: v }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-md border p-3">
              <Checkbox
                id="product-active"
                checked={form.isActive}
                onCheckedChange={(checked) =>
                  setForm((current) => ({ ...current, isActive: checked === true }))
                }
              />
              <Label htmlFor="product-active">Active — available for new sales and purchases</Label>
            </div>
            <p className="text-xs text-muted-foreground">
              New items default to no tax; choose the correct sales and purchase rates. This
              catalogue does not value inventory or post COGS.
            </p>
            <DocumentRecordPanel
              key={`${open ? "open" : "closed"}-${editing?.id ?? "new"}`}
              ref={productRecordRef}
              entityType="product"
              entityId={editing?.id ?? null}
              audience="internal"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={saveMut.isPending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => saveMut.mutate()}
              disabled={
                saveMut.isPending ||
                salesPriceInvalid ||
                purchaseCostInvalid ||
                Boolean(codeProblem) ||
                !form.name.trim() ||
                !canManage
              }
            >
              {saveMut.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}

function TaxSelect({
  companyId,
  canCreate,
  value,
  choices,
  onChange,
}: {
  companyId: string;
  canCreate: boolean;
  value: string;
  choices: Array<{ key: string; label: string; bps: number }>;
  onChange: (bps: string) => void;
}) {
  const known = choices.some((c) => c.key === value);
  return (
    <LookupSelect
      ariaLabel="Tax rate"
      allowClear={false}
      value={value}
      onChange={onChange}
      searchPlaceholder="Search tax rate"
      companyId={companyId}
      canCreate={canCreate}
      createTitle="New tax code"
      renderCreate={
        canCreate
          ? (ctx) => (
              <TaxCodeCreateForm
                companyId={companyId}
                appliesTo="both"
                ctx={{
                  ...ctx,
                  complete: (option) => ctx.complete({ ...option, id: option.meta || "0" }),
                }}
              />
            )
          : undefined
      }
      options={[
        { id: "0", label: "No tax (0.00%)", keywords: "none zero" },
        ...choices
          .filter((c) => c.key !== "0")
          .map((c) => ({
            id: c.key,
            label: c.label,
            keywords: `${c.label} ${c.bps}`,
          })),
        ...(!known && value !== "0"
          ? [
              {
                id: value,
                label: `Custom rate (${(Number(value) / 100).toFixed(2)}%)`,
                keywords: value,
              },
            ]
          : []),
      ]}
    />
  );
}

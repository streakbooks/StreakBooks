import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  listCustomerPriceListDefaults,
  saveCustomerPriceListDefault,
  searchPriceListCustomers,
} from "@/lib/products/customer-price-list.functions";
import type { ProductPriceList } from "@/lib/products/catalogue-masterdata.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Props = {
  companyId: string;
  currency: string;
  priceLists: readonly ProductPriceList[];
};

export function CustomerPriceListDefaults({ companyId, currency, priceLists }: Props) {
  const qc = useQueryClient();
  const searchCustomers = useServerFn(searchPriceListCustomers);
  const loadDefaults = useServerFn(listCustomerPriceListDefaults);
  const saveDefault = useServerFn(saveCustomerPriceListDefault);
  const canManage = useCanDo("products.manage");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [contactId, setContactId] = useState("");
  const [priceListId, setPriceListId] = useState("none");

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => clearTimeout(handle);
  }, [search]);
  const defaultsQ = useQuery({
    queryKey: ["customer-price-list-defaults", companyId],
    queryFn: () => loadDefaults({ data: { companyId } }),
  });
  const customersQ = useQuery({
    queryKey: ["price-list-customer-search", companyId, debouncedSearch],
    queryFn: () => searchCustomers({ data: { companyId, q: debouncedSearch } }),
  });
  const defaults = defaultsQ.data ?? [];
  const activeLists = priceLists.filter(
    (list) => list.is_active && list.currency_code === currency,
  );

  const saveMut = useMutation({
    mutationFn: (args: { contactId: string; priceListId: string | null }) =>
      saveDefault({ data: { companyId, ...args } }),
    onSuccess: async (result) => {
      toast.success("Customer price-list default saved");
      if (result.auditError) toast.warning("Saved, but audit recording failed");
      setContactId("");
      setPriceListId("none");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["customer-price-list-defaults", companyId] }),
        qc.invalidateQueries({ queryKey: ["customer-price-list", companyId] }),
      ]);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });
  const selectCustomer = (id: string) => {
    setContactId(id);
    const assigned = defaults.find((row) => row.contact_id === id);
    setPriceListId(assigned?.price_list_id ?? "none");
  };
  const selectedCustomerName =
    defaults.find((row) => row.contact_id === contactId)?.contact_name ??
    customersQ.data?.find((row) => row.id === contactId)?.name ??
    "Selected customer";
  const selectedExistsInSearch = customersQ.data?.some((row) => row.id === contactId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Customer price-list defaults</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Assign one optional default list per active customer. New invoices and quotes can
          suggest that list when the customer is selected and the document currency matches.
          Existing document lines are never changed automatically. Only active base-currency
          price lists are eligible for assignment.
        </p>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-2">
            <Label htmlFor="customer-price-search">Find customer</Label>
            <Input
              id="customer-price-search"
              value={search}
              placeholder="Search active customers"
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select
              value={contactId}
              onValueChange={selectCustomer}
              disabled={defaultsQ.isPending || defaultsQ.isError}
            >
              <SelectTrigger aria-label="Customer for default price list">
                <SelectValue placeholder="Choose customer" />
              </SelectTrigger>
              <SelectContent>
                {contactId && !selectedExistsInSearch ? (
                  <SelectItem value={contactId}>{selectedCustomerName}</SelectItem>
                ) : null}
                {(customersQ.data ?? []).map((row) => (
                  <SelectItem key={row.id} value={row.id}>{row.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(customersQ.data?.length ?? 0) >= 100 ? (
              <p className="text-xs text-muted-foreground">
                Showing up to 100 customers. Search to narrow the list.
              </p>
            ) : null}
            {customersQ.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {friendlyAuthError(customersQ.error)}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Customer default sales prices ({currency})</Label>
            <Select value={priceListId} onValueChange={setPriceListId}>
              <SelectTrigger aria-label="Customer default price list">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No default — catalogue prices</SelectItem>
                {priceListId !== "none" && !activeLists.some((x) => x.id === priceListId) ? (
                  <SelectItem value={priceListId} disabled>
                    Unavailable or archived list (remove default)
                  </SelectItem>
                ) : null}
                {activeLists.map((list) => (
                  <SelectItem value={list.id} key={list.id}>{list.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={
              !canManage || !contactId || saveMut.isPending ||
              (priceListId !== "none" && !activeLists.some((x) => x.id === priceListId))
            }
            onClick={() =>
              saveMut.mutate({
                contactId,
                priceListId: priceListId === "none" ? null : priceListId,
              })
            }
          >
            {saveMut.isPending ? "Saving…" : "Save default"}
          </Button>
        </div>
        {defaultsQ.isPending ? <p className="text-sm">Loading customer defaults…</p> : null}
        {defaultsQ.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-destructive">{friendlyAuthError(defaultsQ.error)}</p>
            <Button variant="outline" size="sm" onClick={() => defaultsQ.refetch()}>
              Retry
            </Button>
          </div>
        ) : null}
        {defaults.length === 0 && !defaultsQ.isPending ? (
          <p className="rounded-md border p-3 text-sm text-muted-foreground">
            No customer-specific defaults configured yet.
          </p>
        ) : null}
        <div className="space-y-2">
          {defaults.map((row) => (
            <div
              key={row.contact_id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
            >
              <div className="min-w-0">
                <p className="font-medium">{row.contact_name}</p>
                <p className="text-sm text-muted-foreground">
                  {row.price_list_name} · {row.price_list_currency || "Unknown currency"}
                  {row.price_list_active ? "" : " · Archived list"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm"
                  onClick={() => {
                    setContactId(row.contact_id);
                    setPriceListId(row.price_list_id);
                  }}>
                  Edit
                </Button>
                <Button variant="outline" size="sm"
                  disabled={!canManage || saveMut.isPending}
                  onClick={() => {
                    if (window.confirm(`Remove the default for ${row.contact_name}?`)) {
                      saveMut.mutate({ contactId: row.contact_id, priceListId: null });
                    }
                  }}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
        {defaults.length >= 500 ? (
          <p className="text-xs text-muted-foreground">
            Showing the first 500 assignments. Customer-default pagination remains pending.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

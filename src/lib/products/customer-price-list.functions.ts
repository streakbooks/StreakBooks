import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { escapeLikeLiteral } from "@/lib/purchases/search-terms";
import { usableCustomerPriceList } from "@/lib/products/customer-price-list-rules";

export type CustomerPriceListAssignment = {
  contact_id: string;
  contact_name: string;
  price_list_id: string;
  price_list_name: string;
  price_list_active: boolean;
  price_list_currency: string;
};

type ActiveContact = { id: string; name: string; kind: string; is_active: boolean };
type AssignedList = { id: string; name: string; currency_code: string; is_active: boolean };

export const searchPriceListCustomers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; q?: string }) => ({
    companyId: assertUuid(input.companyId),
    q: (input.q ?? "").trim().slice(0, 100),
  }))
  .handler(async ({ data, context }): Promise<Array<Pick<ActiveContact, "id" | "name">>> => {
    await assertCompanyMember(context.supabase, data.companyId);
    let query = context.supabase.from("contacts" as never)
      .select("id, name" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("is_active" as never, true as never)
      .in("kind" as never, ["customer", "both"] as never)
      .order("name" as never).limit(100);
    if (data.q) query = query.ilike("name" as never, `%${escapeLikeLiteral(data.q)}%` as never);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as Array<Pick<ActiveContact, "id" | "name">>;
  });

export const listCustomerPriceListDefaults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input.companyId),
  }))
  .handler(async ({ data, context }): Promise<CustomerPriceListAssignment[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: mapping, error } = await context.supabase
      .from("product_customer_price_list_defaults" as never)
      .select("contact_id, price_list_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .order("contact_id" as never).limit(500);
    if (error) throw new Error(error.message);
    const assignments = (mapping ?? []) as Array<{ contact_id: string; price_list_id: string }>;
    if (!assignments.length) return [];
    const [customers, lists] = await Promise.all([
      context.supabase.from("contacts" as never)
        .select("id, name" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, assignments.map((r) => r.contact_id) as never),
      context.supabase.from("product_price_lists" as never)
        .select("id, name, is_active, currency_code" as never)
        .eq("company_id" as never, data.companyId as never)
        .in("id" as never, [...new Set(assignments.map((r) => r.price_list_id))] as never),
    ]);
    if (customers.error) throw new Error(customers.error.message);
    if (lists.error) throw new Error(lists.error.message);
    const customersById = new Map(
      ((customers.data ?? []) as Array<{ id: string; name: string }>).map((r) => [r.id, r]),
    );
    const listsById = new Map(
      ((lists.data ?? []) as AssignedList[]).map((r) => [r.id, r]),
    );
    return assignments.map((r) => {
      const customer = customersById.get(r.contact_id);
      const list = listsById.get(r.price_list_id);
      return {
        contact_id: r.contact_id,
        contact_name: customer?.name ?? "Unavailable customer",
        price_list_id: r.price_list_id,
        price_list_name: list?.name ?? "Unavailable price list",
        price_list_active: list?.is_active ?? false,
        price_list_currency: list?.currency_code ?? "",
      };
    });
  });

/** Only suggest a valid active default for a new invoice/quote; never read/write document lines. */
export const getCustomerPriceListDefault = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string; contactId: string; documentCurrency: string;
  }) => {
    if (!/^[A-Z]{3}$/.test(input.documentCurrency ?? "")) {
      throw new Error("Invalid document currency");
    }
    return {
      companyId: assertUuid(input.companyId),
      contactId: assertUuid(input.contactId),
      documentCurrency: input.documentCurrency,
    };
  })
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: customer, error: customerError } = await context.supabase
      .from("contacts" as never)
      .select("id, is_active, kind" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.contactId as never)
      .maybeSingle();
    if (customerError) throw new Error(customerError.message);
    if (!customer || !(customer as ActiveContact).is_active ||
      !["customer", "both"].includes((customer as ActiveContact).kind)) {
      return { priceListId: null as string | null, reason: "customer_unavailable" as const };
    }
    const { data: defaultRow, error: mappingError } = await context.supabase
      .from("product_customer_price_list_defaults" as never)
      .select("price_list_id" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("contact_id" as never, data.contactId as never)
      .maybeSingle();
    if (mappingError) throw new Error(mappingError.message);
    if (!defaultRow) return { priceListId: null as string | null, reason: "none" as const };
    const { data: list, error: listError } = await context.supabase
      .from("product_price_lists" as never)
      .select("id, currency_code, is_active" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, (defaultRow as { price_list_id: string }).price_list_id as never)
      .maybeSingle();
    if (listError) throw new Error(listError.message);
    const selected = usableCustomerPriceList(
      list as { id: string; currency_code: string; is_active: boolean } | null,
      data.documentCurrency,
    );
    return selected
      ? { priceListId: selected, reason: "available" as const }
      : { priceListId: null as string | null, reason: "unavailable_or_currency_mismatch" as const };
  });

export const saveCustomerPriceListDefault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: {
    companyId: string; contactId: string; priceListId: string | null;
  }) => ({
    companyId: assertUuid(input.companyId),
    contactId: assertUuid(input.contactId),
    priceListId: input.priceListId ? assertUuid(input.priceListId) : null,
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyPermission(context.supabase, data.companyId, "products.manage");
    const { data: customer, error: customerError } = await context.supabase
      .from("contacts" as never)
      .select("id, is_active, kind" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("id" as never, data.contactId as never)
      .maybeSingle();
    if (customerError) throw new Error(customerError.message);
    if (!customer || !(customer as ActiveContact).is_active ||
      !["customer", "both"].includes((customer as ActiveContact).kind)) {
      throw new Error("Choose an active customer in this organisation");
    }
    if (data.priceListId) {
      const [priceList, company] = await Promise.all([
        context.supabase.from("product_price_lists" as never)
          .select("id, currency_code, is_active" as never)
          .eq("company_id" as never, data.companyId as never)
          .eq("id" as never, data.priceListId as never).maybeSingle(),
        context.supabase.from("companies" as never)
          .select("base_currency" as never)
          .eq("id" as never, data.companyId as never).single(),
      ]);
      if (priceList.error) throw new Error(priceList.error.message);
      if (company.error) throw new Error(company.error.message);
      if (!usableCustomerPriceList(
        priceList.data as { id: string; currency_code: string; is_active: boolean } | null,
        (company.data as { base_currency: string }).base_currency,
      )) {
        throw new Error("Choose an active price list in the organisation's base currency");
      }
      const { error: saveError } = await context.supabase
        .from("product_customer_price_list_defaults" as never)
        .upsert({
          company_id: data.companyId,
          contact_id: data.contactId,
          price_list_id: data.priceListId,
          updated_at: new Date().toISOString(),
        } as never, { onConflict: "company_id,contact_id" });
      if (saveError) throw new Error(saveError.message);
    } else {
      const { error: deleteError } = await context.supabase
        .from("product_customer_price_list_defaults" as never)
        .delete()
        .eq("company_id" as never, data.companyId as never)
        .eq("contact_id" as never, data.contactId as never);
      if (deleteError) throw new Error(deleteError.message);
    }
    const { error: auditError } = await context.supabase.rpc(
      "record_audit_event" as never, {
        _company_id: data.companyId,
        _action: "products.customer_price_list_default",
        _entity_type: "contact",
        _entity_id: data.contactId,
        _details: { price_list_id: data.priceListId, source: "products_price_lists" },
      } as never,
    );
    return { saved: true, auditError: auditError?.message ?? null };
  });

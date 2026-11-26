import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import { sanitiseSearchTerm } from "@/lib/search/sanitise";
import {
  bankMoneyFilter,
  documentMoneyFilter,
  parseMoneySearch,
  searchOrFilter,
} from "@/lib/search/search-query";

export type GlobalSearchHit = {
  id: string;
  entity: "contact" | "invoice" | "bill" | "account" | "product" | "journal" | "bank_transaction";
  title: string;
  subtitle: string;
  /** Route path of the specific record (never a list page when a detail page exists). */
  href: string;
  /** Search params for the route, when the record opens inside a list page. */
  search?: Record<string, string>;
  /** Present for documents so the client can format money in the user's locale. */
  amount_minor?: number;
  currency?: string;
};

export type SearchCategory = "all" | GlobalSearchHit["entity"];

export const globalSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: { companyId: string; q: string; category?: SearchCategory; limit?: number }) => {
      const q = (input.q ?? "").trim().slice(0, 80);
      if (q.length < 2 && !parseMoneySearch(q))
        throw new Error("Type at least 2 characters or an amount");
      const categories = [
        "all",
        "contact",
        "invoice",
        "bill",
        "account",
        "product",
        "journal",
        "bank_transaction",
      ];
      const category: SearchCategory =
        input.category && categories.includes(input.category) ? input.category : "all";
      return {
        companyId: assertUuid(input.companyId),
        q,
        category,
        limit: Math.min(36, Math.max(12, Math.round(input.limit ?? 12))),
      };
    },
  )
  .handler(async ({ data, context }): Promise<GlobalSearchHit[]> => {
    await assertCompanyMember(context.supabase, data.companyId);
    const safe = sanitiseSearchTerm(data.q);
    if (safe.length < 2 && !parseMoneySearch(data.q)) return [];
    const limit = data.limit;
    const hits: GlobalSearchHit[] = [];
    const companyId = data.companyId;
    const sb = context.supabase;

    // Numeric-only searches are *exact money* searches. Do not mix text ILIKE
    // with amount predicates or guess several currency precisions for one row.
    const money = parseMoneySearch(data.q);
    if (money) {
      if (data.category === "all" || data.category === "bank_transaction") {
        const accountResult = await sb
          .from("bank_accounts" as never)
          .select("id, currency_code" as never)
          .eq("company_id" as never, companyId as never);
        if (accountResult.error) throw new Error(accountResult.error.message);
        const bankFilter = bankMoneyFilter(
          money,
          (accountResult.data ?? []) as unknown as Array<{
            id: string;
            currency_code: string;
          }>,
        );
        if (bankFilter) {
          const columns =
            "id, bank_account_id, txn_date, amount_minor, description, external_id, reference, payee, status, bank_accounts(currency_code)";
          const legacyColumns =
            "id, bank_account_id, txn_date, amount_minor, description, external_id, status, bank_accounts(currency_code)";
          const run = (select: string) =>
            sb
              .from("bank_transactions" as never)
              .select(select as never)
              .eq("company_id" as never, companyId as never)
              .or(bankFilter as never)
              .order("txn_date" as never, { ascending: false })
              .limit(limit);
          let result = await run(columns);
          if (result.error?.code === "42703" || result.error?.code === "PGRST204") {
            result = await run(legacyColumns);
          }
          if (result.error) throw new Error(result.error.message);
          for (const row of (result.data ?? []) as unknown as Array<{
            id: string;
            txn_date: string;
            amount_minor: number;
            description: string | null;
            external_id: string | null;
            reference?: string | null;
            payee?: string | null;
            status: string;
            bank_accounts: { currency_code: string } | null;
          }>) {
            hits.push({
              id: row.id,
              entity: "bank_transaction",
              title:
                row.payee ||
                row.description ||
                row.reference ||
                row.external_id ||
                "Bank transaction",
              subtitle: [row.txn_date, row.reference, row.status].filter(Boolean).join(" · "),
              href: "/banking/transactions",
              search: { transactionId: row.id, statusGroup: "all" },
              amount_minor: row.amount_minor,
              ...(row.bank_accounts?.currency_code
                ? { currency: row.bank_accounts.currency_code }
                : {}),
            });
          }
        }
      }
      const documentFilter = documentMoneyFilter(money);
      if (documentFilter && (data.category === "all" || data.category === "invoice")) {
        const result = await sb
          .from("sales_invoices" as never)
          .select(
            "id, invoice_number, status, total_minor, currency_code, memo, contacts(name)" as never,
          )
          .eq("company_id" as never, companyId as never)
          .or(documentFilter as never)
          .order("created_at" as never, { ascending: false })
          .limit(limit);
        if (result.error) throw new Error(result.error.message);
        for (const row of (result.data ?? []) as unknown as Array<{
          id: string;
          invoice_number: string | null;
          status: string;
          total_minor: number;
          currency_code: string;
          memo: string | null;
          contacts: { name: string } | null;
        }>) {
          hits.push({
            id: row.id,
            entity: "invoice",
            title: row.invoice_number ?? "Invoice (draft)",
            subtitle: [row.contacts?.name, row.status, row.memo].filter(Boolean).join(" · "),
            href: "/sales/invoices/" + row.id,
            amount_minor: row.total_minor,
            currency: row.currency_code,
          });
        }
      }
      if (documentFilter && (data.category === "all" || data.category === "bill")) {
        const result = await sb
          .from("purchase_bills" as never)
          .select(
            "id, bill_number, supplier_invoice_number, status, total_minor, currency_code, memo, contacts(name)" as never,
          )
          .eq("company_id" as never, companyId as never)
          .or(documentFilter as never)
          .order("created_at" as never, { ascending: false })
          .limit(limit);
        if (result.error) throw new Error(result.error.message);
        for (const row of (result.data ?? []) as unknown as Array<{
          id: string;
          bill_number: string | null;
          supplier_invoice_number: string | null;
          status: string;
          total_minor: number;
          currency_code: string;
          memo: string | null;
          contacts: { name: string } | null;
        }>) {
          hits.push({
            id: row.id,
            entity: "bill",
            title: row.supplier_invoice_number ?? row.bill_number ?? "Bill (draft)",
            subtitle: [row.contacts?.name, row.bill_number, row.status, row.memo]
              .filter(Boolean)
              .join(" · "),
            href: "/purchases/bills/" + row.id,
            amount_minor: row.total_minor,
            currency: row.currency_code,
          });
        }
      }
      return hits;
    }

    // Search actual imported bank transactions, not a navigation shortcut.
    // Both paths remain scoped to the authenticated organisation and its RLS policies.
    if (data.category === "all" || data.category === "bank_transaction") {
      const fields =
        "id, bank_account_id, txn_date, amount_minor, description, external_id, reference, payee, status, bank_accounts(currency_code)";
      const oldFields =
        "id, bank_account_id, txn_date, amount_minor, description, external_id, status, bank_accounts(currency_code)";
      const opts = { dateFields: ["txn_date"] };
      const oldFilter = searchOrFilter(["description", "external_id"], data.q, opts);
      const fullFilter = searchOrFilter(
        ["description", "external_id", "reference", "payee"],
        data.q,
        opts,
      );
      const queryBank = (columns: string, filter: string) =>
        sb
          .from("bank_transactions" as never)
          .select(columns as never)
          .eq("company_id" as never, companyId as never)
          .or(filter as never)
          .order("txn_date" as never, { ascending: false })
          .limit(limit);
      let bankResult = await queryBank(fields, fullFilter);
      // Older organisations may not have the optional payee/reference columns.
      if (bankResult.error?.code === "42703" || bankResult.error?.code === "PGRST204") {
        bankResult = await queryBank(oldFields, oldFilter);
      }
      if (bankResult.error) throw new Error(bankResult.error.message);
      for (const row of (bankResult.data ?? []) as unknown as Array<{
        id: string;
        bank_account_id: string;
        txn_date: string;
        amount_minor: number;
        description: string | null;
        external_id: string | null;
        reference?: string | null;
        payee?: string | null;
        status: string;
        bank_accounts: { currency_code: string } | null;
      }>) {
        hits.push({
          id: row.id,
          entity: "bank_transaction",
          title:
            row.payee || row.description || row.reference || row.external_id || "Bank transaction",
          subtitle: [row.txn_date, row.reference, row.status].filter(Boolean).join(" · "),
          href: "/banking/transactions",
          search: { transactionId: row.id, statusGroup: "all" },
          amount_minor: row.amount_minor,
          ...(row.bank_accounts?.currency_code
            ? { currency: row.bank_accounts.currency_code }
            : {}),
        });
      }
      if (data.category === "bank_transaction") return hits;
    }

    // Contacts first: their ids let invoices and bills be found by customer / supplier name.
    const contactsRes = await sb
      .from("contacts" as never)
      .select("id, name, legal_name, account_number, phone, email, kind" as never)
      .eq("company_id" as never, companyId as never)
      .or(
        searchOrFilter(["name", "legal_name", "account_number", "phone", "email"], data.q) as never,
      )
      .limit(36);
    if (contactsRes.error) throw new Error(contactsRes.error.message);
    const contacts = (contactsRes.data ?? []) as unknown as Array<{
      id: string;
      name: string;
      email: string | null;
      kind: string;
    }>;
    const contactIds = contacts.map((c) => c.id);
    const byContact = contactIds.length ? `,contact_id.in.(${contactIds.join(",")})` : "";

    const journalNumber = /^\d{1,9}$/.test(safe) ? Number(safe) : null;
    const [invoices, bills, accounts, products, journals] = await Promise.all([
      sb
        .from("sales_invoices" as never)
        .select(
          "id, invoice_number, status, total_minor, currency_code, memo, contacts(name)" as never,
        )
        .eq("company_id" as never, companyId as never)
        .or(
          (searchOrFilter(["invoice_number", "memo"], data.q, {
            dateFields: ["invoice_date", "due_date"],
          }) + byContact) as never,
        )
        .order("created_at" as never, { ascending: false } as never)
        .limit(limit),
      sb
        .from("purchase_bills" as never)
        .select(
          "id, bill_number, supplier_invoice_number, status, total_minor, currency_code, memo, contacts(name)" as never,
        )
        .eq("company_id" as never, companyId as never)
        .or(
          (searchOrFilter(["bill_number", "supplier_invoice_number", "memo"], data.q, {
            dateFields: ["bill_date", "due_date"],
          }) + byContact) as never,
        )
        .order("created_at" as never, { ascending: false } as never)
        .limit(limit),
      sb
        .from("accounts" as never)
        .select("id, code, name, account_type" as never)
        .eq("company_id" as never, companyId as never)
        .or(searchOrFilter(["code", "name", "description"], data.q) as never)
        .limit(limit),
      sb
        .from("products" as never)
        .select("id, code, name, kind" as never)
        .eq("company_id" as never, companyId as never)
        .eq("is_active" as never, true as never)
        .or(searchOrFilter(["code", "name", "description"], data.q) as never)
        .limit(limit),
      sb
        .from("journals" as never)
        .select("id, journal_number, memo, journal_date, status" as never)
        .eq("company_id" as never, companyId as never)
        .eq("status" as never, "posted" as never)
        .or(
          (searchOrFilter(["memo"], data.q, { dateFields: ["journal_date"] }) +
            (journalNumber !== null ? `,journal_number.eq.${journalNumber}` : "")) as never,
        )
        .limit(limit),
    ]);

    for (const result of [invoices, bills, accounts, products, journals]) {
      if (result.error) throw new Error(result.error.message);
    }

    for (const r of contacts.slice(0, limit)) {
      hits.push({
        id: r.id,
        entity: "contact",
        title: r.name,
        subtitle: `${r.kind}${r.email ? ` · ${r.email}` : ""}`,
        href: `/contacts/${r.id}`,
      });
    }
    for (const r of (invoices.data ?? []) as unknown as Array<{
      id: string;
      invoice_number: string | null;
      status: string;
      total_minor: number;
      currency_code: string;
      memo: string | null;
      contacts: { name: string } | null;
    }>) {
      hits.push({
        id: r.id,
        entity: "invoice",
        title: r.invoice_number ?? "Invoice (draft)",
        subtitle: [r.contacts?.name, r.status, r.memo].filter(Boolean).join(" · "),
        href: `/sales/invoices/${r.id}`,
        amount_minor: r.total_minor,
        currency: r.currency_code,
      });
    }
    for (const r of (bills.data ?? []) as unknown as Array<{
      id: string;
      bill_number: string | null;
      supplier_invoice_number: string | null;
      status: string;
      total_minor: number;
      currency_code: string;
      memo: string | null;
      contacts: { name: string } | null;
    }>) {
      hits.push({
        id: r.id,
        entity: "bill",
        title: r.supplier_invoice_number ?? r.bill_number ?? "Bill (draft)",
        subtitle: [
          r.contacts?.name,
          r.supplier_invoice_number && r.bill_number ? `ref ${r.bill_number}` : null,
          r.status,
          r.memo,
        ]
          .filter(Boolean)
          .join(" · "),
        href: `/purchases/bills/${r.id}`,
        amount_minor: r.total_minor,
        currency: r.currency_code,
      });
    }
    for (const r of (accounts.data ?? []) as unknown as Array<{
      id: string;
      code: string;
      name: string;
      account_type: string;
    }>) {
      hits.push({
        id: r.id,
        entity: "account",
        title: `${r.code} — ${r.name}`,
        subtitle: `${r.account_type} · open account transactions`,
        href: "/reports/general-ledger",
        search: { account: r.id },
      });
    }
    if (!products.error) {
      for (const r of (products.data ?? []) as unknown as Array<{
        id: string;
        code: string | null;
        name: string;
        kind: string;
      }>) {
        hits.push({
          id: r.id,
          entity: "product",
          title: r.code ? `${r.code} — ${r.name}` : r.name,
          subtitle: r.kind,
          href: "/products-services",
        });
      }
    }
    for (const r of (journals.data ?? []) as unknown as Array<{
      id: string;
      journal_number: number;
      memo: string | null;
      journal_date: string;
      status: string;
    }>) {
      hits.push({
        id: r.id,
        entity: "journal",
        title: `Journal #${r.journal_number}`,
        subtitle: `${r.journal_date}${r.memo ? ` · ${r.memo}` : ""}`,
        href: "/accounting",
        search: { tab: "journals", journal: r.id },
      });
    }

    return hits
      .filter((hit) => data.category === "all" || hit.entity === data.category)
      .slice(0, limit * 7);
  });

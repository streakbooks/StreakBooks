import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  assertLinesBalance,
  toSafeMinorNumber,
  type JournalLineDraft,
} from "@/lib/accounting/money";
import { parseDateValue } from "@/lib/banking/csv-mapping";

type AuthedClient = SupabaseClient<Database>;

/** Must match the Postgres enum `journal_source_type`. A value outside this list fails at post time. */
export const JOURNAL_SOURCE_TYPES = [
  "manual",
  "opening_balance",
  "sales_invoice",
  "sales_credit_note",
  "customer_payment",
  "purchase_bill",
  "purchase_credit_note",
  "supplier_payment",
  "expense",
  "bank_transaction",
  "bank_transfer",
  "tax_adjustment",
  "reversal",
  "other",
  "fx_revaluation",
  "fx_realised",
] as const;
export type JournalSourceType = (typeof JOURNAL_SOURCE_TYPES)[number];

export type PostJournalInput = {
  company_id: string;
  journal_date: string; // YYYY-MM-DD
  memo?: string;
  currency_code?: string;
  fx_rate_to_base?: number;
  source_type?: JournalSourceType;
  source_id?: string;
  idempotency_key?: string;
  reverses_journal_id?: string;
  /** Manual journals only: post it and schedule an automatic reversal on this date (AC-05). */
  auto_reverse_on?: string;
  lines: JournalLineDraft[];
};

/**
 * Single reusable posting service for all modules.
 * Validates locally then posts via atomic Postgres RPC `post_journal`
 * (balance, period lock, permissions, idempotency enforced in DB).
 */
export async function postJournal(
  supabase: AuthedClient,
  input: PostJournalInput,
): Promise<{ journalId: string }> {
  if (!input.company_id) throw new Error("company_id is required");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.journal_date) ||
    parseDateValue(input.journal_date, "YYYY-MM-DD") !== input.journal_date
  ) {
    throw new Error("journal_date must be a valid YYYY-MM-DD calendar date");
  }
  assertLinesBalance(input.lines);

  if (input.auto_reverse_on) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.auto_reverse_on) ||
      parseDateValue(input.auto_reverse_on, "YYYY-MM-DD") !== input.auto_reverse_on
    ) {
      throw new Error("auto_reverse_on must be a valid YYYY-MM-DD calendar date");
    }
    if (input.auto_reverse_on <= input.journal_date) {
      throw new Error("The reversal date must be after the journal date.");
    }
    if ((input.source_type ?? "manual") !== "manual") {
      throw new Error("Only manual journals can be auto-reversing");
    }
  }

  // Validate exact amounts before an FX lookup or any database mutation.
  // Converting an unsafe bigint to Number first would silently round it.
  const lines = input.lines.map((line, index) => ({
    account_id: line.account_id,
    description: line.description ?? null,
    debit_minor: toSafeMinorNumber(
      typeof line.debit_minor === "bigint" ? line.debit_minor : BigInt(line.debit_minor),
      `Journal line ${index + 1} debit`,
    ),
    credit_minor: toSafeMinorNumber(
      typeof line.credit_minor === "bigint" ? line.credit_minor : BigInt(line.credit_minor),
      `Journal line ${index + 1} credit`,
    ),
  }));
  const fxRate = await resolveFxRate(supabase, input);

  const payload = {
    company_id: input.company_id,
    journal_date: input.journal_date,
    memo: input.memo ?? null,
    currency_code: input.currency_code ?? null,
    fx_rate_to_base: fxRate,
    source_type: input.source_type ?? "manual",
    source_id: input.source_id ?? null,
    idempotency_key: input.idempotency_key ?? null,
    reverses_journal_id: input.reverses_journal_id ?? null,
    lines,
  };

  // An auto-reversing journal is posted by `post_auto_reversing_journal`, which calls post_journal
  // and records the reversal schedule in the same transaction.
  const call = () =>
    supabase.rpc(
      (input.auto_reverse_on ? "post_auto_reversing_journal" : "post_journal") as never,
      {
        payload: input.auto_reverse_on
          ? { ...payload, reverse_on: input.auto_reverse_on }
          : payload,
      } as never,
    );
  let { data, error } = await call();
  if (error && isNoPeriodError(error.message)) {
    // AC-01: create the financial year covering this date once, then retry. Locked or
    // out-of-range dates are rejected by the RPC itself, so this never opens a closed year.
    const created = await ensureFiscalPeriodForDate(supabase, input.company_id, input.journal_date);
    if (created.ok) {
      ({ data, error } = await call());
    }
  }
  if (error) throw new Error(error.message);
  const journalId =
    input.auto_reverse_on && data && typeof data === "object"
      ? (data as { journal_id?: unknown }).journal_id
      : data;
  if (!journalId || typeof journalId !== "string") {
    throw new Error("Posting failed: no journal id returned");
  }
  return { journalId };
}

/**
 * Resolve the exchange-rate snapshot for a journal. Never manufacture a 1:1
 * conversion for a currency the caller explicitly supplied: only a valid
 * database lookup or a positive explicit rate can establish that value.
 *
 * When no currency is specified, the posting RPC uses the company's base
 * currency; 1 is therefore the intentional default for base-only journals.
 */
export async function resolveFxRate(
  supabase: AuthedClient,
  input: Pick<
    PostJournalInput,
    "company_id" | "journal_date" | "currency_code" | "fx_rate_to_base"
  >,
): Promise<number> {
  if (input.fx_rate_to_base != null) {
    if (!Number.isFinite(input.fx_rate_to_base) || input.fx_rate_to_base <= 0) {
      throw new Error("FX rate must be a positive finite number");
    }
    return input.fx_rate_to_base;
  }

  if (input.currency_code === undefined || input.currency_code === null) return 1;
  const currency = input.currency_code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Currency code must have three letters");
  }

  const { data, error } = await supabase.rpc(
    "lookup_fx_rate_to_base" as never,
    {
      _company_id: input.company_id,
      _from_currency: currency,
      _as_of: input.journal_date,
    } as never,
  );
  if (error) {
    if (/No exchange rate for/i.test(error.message ?? "")) {
      throw new Error(
        `No exchange rate for ${currency} on or before ${input.journal_date}. Enter the rate on the document, or add a manual rate in Settings, then try again.`,
      );
    }
    if (isMissingRpcError(error)) {
      throw new Error(
        "Exchange-rate lookup is unavailable. Apply the FX migration or supply an explicitly verified rate before posting.",
      );
    }
    throw new Error(error.message);
  }

  // PostgreSQL NUMERIC may reach the client as a number or a decimal string.
  if (
    !(
      (typeof data === "number" && Number.isFinite(data)) ||
      (typeof data === "string" && /^\d+(?:\.\d+)?$/.test(data))
    )
  ) {
    throw new Error(`Exchange-rate lookup returned an invalid rate for ${currency}`);
  }
  const rate = Number(data);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Exchange-rate lookup returned an invalid rate for ${currency}`);
  }
  return rate;
}

export function isNoPeriodError(message: string | null | undefined): boolean {
  return /No accounting period covers posting date/i.test(message ?? "");
}

/** True when PostgREST/Postgres says the function does not exist yet (migration not applied). */
export function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function|does not exist/i.test(error.message ?? "")
  );
}

/**
 * Ensure an accounting period covers `date` (creates the company's financial year, clipped so it
 * never overlaps existing periods). Returns `{ ok: false }` without throwing when the migration is
 * not applied, so posting keeps its original behaviour.
 */
export async function ensureFiscalPeriodForDate(
  supabase: AuthedClient,
  companyId: string,
  date: string,
): Promise<{ ok: true; periodId: string } | { ok: false; reason: string }> {
  const { data, error } = await supabase.rpc(
    "ensure_fiscal_period_for_date" as never,
    {
      _company_id: companyId,
      _date: date,
    } as never,
  );
  if (error) {
    return { ok: false, reason: isMissingRpcError(error) ? "rpc_missing" : error.message };
  }
  if (typeof data !== "string") return { ok: false, reason: "no_period_returned" };
  return { ok: true, periodId: data };
}

export async function reverseJournal(
  supabase: AuthedClient,
  journalId: string,
  idempotencyKey?: string,
): Promise<{ journalId: string }> {
  const { data, error } = await supabase.rpc(
    "reverse_journal" as never,
    {
      _journal_id: journalId,
      _idempotency_key: idempotencyKey ?? null,
    } as never,
  );
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "string") throw new Error("Reversal failed: no journal id returned");
  return { journalId: data };
}

/**
 * Categorise a bank transaction by posting one balanced journal and linking
 * the bank-side journal line — does not create a second financial movement.
 */
export async function categoriseBankTransaction(
  supabase: AuthedClient,
  args: {
    company_id: string;
    bank_transaction_id: string;
    bank_gl_account_id: string;
    offset_account_id: string;
    journal_date: string;
    amount_minor: bigint | number;
    description?: string;
    idempotency_key: string;
  },
): Promise<{ journalId: string; linkId: string }> {
  if (typeof args.amount_minor === "number" && !Number.isSafeInteger(args.amount_minor)) {
    throw new Error("Bank amount must be an exact integer in minor units");
  }
  const amount =
    typeof args.amount_minor === "number" ? BigInt(args.amount_minor) : args.amount_minor;
  if (amount === 0n) throw new Error("Bank amount cannot be zero");

  // Positive amount = money in (DR bank, CR offset); negative = money out (DR offset, CR bank)
  const abs = amount < 0n ? -amount : amount;
  const bankIsDebit = amount > 0n;

  const { journalId } = await postJournal(supabase, {
    company_id: args.company_id,
    journal_date: args.journal_date,
    memo: args.description ?? "Bank categorisation",
    source_type: "bank_transaction",
    source_id: args.bank_transaction_id,
    idempotency_key: args.idempotency_key,
    lines: bankIsDebit
      ? [
          {
            account_id: args.bank_gl_account_id,
            debit_minor: abs,
            credit_minor: 0n,
            ...(args.description ? { description: args.description } : {}),
          },
          {
            account_id: args.offset_account_id,
            debit_minor: 0n,
            credit_minor: abs,
            ...(args.description ? { description: args.description } : {}),
          },
        ]
      : [
          {
            account_id: args.offset_account_id,
            debit_minor: abs,
            credit_minor: 0n,
            ...(args.description ? { description: args.description } : {}),
          },
          {
            account_id: args.bank_gl_account_id,
            debit_minor: 0n,
            credit_minor: abs,
            ...(args.description ? { description: args.description } : {}),
          },
        ],
  });

  const { data: bankLine, error: lineErr } = await supabase
    .from("journal_lines" as never)
    .select("id")
    .eq("journal_id" as never, journalId as never)
    .eq("account_id" as never, args.bank_gl_account_id as never)
    .maybeSingle();
  if (lineErr) throw new Error(lineErr.message);
  const journalLineId = (bankLine as { id?: string } | null)?.id;
  if (!journalLineId) throw new Error("Posted journal missing bank GL line");

  const { data: link, error: linkErr } = await supabase
    .from("reconciliation_links" as never)
    .insert({
      company_id: args.company_id,
      bank_transaction_id: args.bank_transaction_id,
      journal_line_id: journalLineId,
    } as never)
    .select("id")
    .single();
  if (linkErr) throw new Error(linkErr.message);

  await supabase
    .from("bank_transactions" as never)
    .update({ status: "matched" } as never)
    .eq("id" as never, args.bank_transaction_id as never);

  return { journalId, linkId: (link as { id: string }).id };
}

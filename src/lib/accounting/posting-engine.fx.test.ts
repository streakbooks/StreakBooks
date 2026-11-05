import { describe, expect, it, vi } from "vitest";
import { categoriseBankTransaction, postJournal, resolveFxRate } from "./posting-engine";

const companyId = "11111111-1111-4111-8111-111111111111";
const debits = [
  { account_id: "22222222-2222-4222-8222-222222222222", debit_minor: 100n, credit_minor: 0n },
  { account_id: "33333333-3333-4333-8333-333333333333", debit_minor: 0n, credit_minor: 100n },
];
const input = (over: Record<string, unknown> = {}) => ({
  company_id: companyId,
  journal_date: "2026-11-04",
  lines: debits,
  ...over,
});

describe("posting currency and date safeguards", () => {
  it("does not call the database when a journal date is not a real calendar day", async () => {
    const rpc = vi.fn();
    for (const journal_date of ["2026-02-29", "2026-04-31", "2026-13-01", "2026-11-4"]) {
      await expect(postJournal({ rpc } as never, input({ journal_date }))).rejects.toThrow(
        /valid YYYY-MM-DD calendar date/,
      );
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("validates reversal dates and manual source before an exchange-rate lookup", async () => {
    const rpc = vi.fn();
    for (const auto_reverse_on of ["2026-11-04", "2026-02-30", "2026-11-03"]) {
      await expect(
        postJournal({ rpc } as never, input({ currency_code: "USD", auto_reverse_on })),
      ).rejects.toThrow(/reversal date|calendar date/);
    }
    await expect(
      postJournal(
        { rpc } as never,
        input({
          currency_code: "USD",
          auto_reverse_on: "2026-11-05",
          source_type: "sales_invoice",
        }),
      ),
    ).rejects.toThrow(/Only manual/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects unsafe minor units before contacting the FX service", async () => {
    const rpc = vi.fn();
    const tooLarge = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    await expect(
      postJournal(
        { rpc } as never,
        input({
          currency_code: "USD",
          lines: [
            { ...debits[0], debit_minor: tooLarge },
            { ...debits[1], credit_minor: tooLarge },
          ],
        }),
      ),
    ).rejects.toThrow(/safe integer range/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("preserves exact, safe journal line minor units in the posted request", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", error: null });
    await postJournal({ rpc } as never, input({ currency_code: "GBP", fx_rate_to_base: 1 }));
    expect(rpc).toHaveBeenCalledTimes(1);
    const request = rpc.mock.calls[0]?.[1]?.payload;
    expect(
      request.lines.map(
        (line: { debit_minor: number; credit_minor: number }) =>
          line.debit_minor - line.credit_minor,
      ),
    ).toEqual([100, -100]);
    expect(request.fx_rate_to_base).toBe(1);
  });

  it("uses the base-currency default only when no currency is provided", async () => {
    const rpc = vi.fn();
    expect(await resolveFxRate({ rpc } as never, input())).toBe(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts a verified positive explicit FX rate without a lookup", async () => {
    const rpc = vi.fn();
    expect(
      await resolveFxRate({ rpc } as never, input({ currency_code: "USD", fx_rate_to_base: 0.82 })),
    ).toBe(0.82);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([0, -0.5, NaN, Infinity, -Infinity])(
    "rejects invalid explicit FX rates instead of posting at that rate",
    async (fx_rate_to_base) => {
      const rpc = vi.fn();
      await expect(resolveFxRate({ rpc } as never, input({ fx_rate_to_base }))).rejects.toThrow(
        /positive finite/,
      );
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("uses a company and date-scoped rate lookup for explicit currency", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "0.815", error: null });
    expect(await resolveFxRate({ rpc } as never, input({ currency_code: "usd" }))).toBe(0.815);
    expect(rpc).toHaveBeenCalledWith("lookup_fx_rate_to_base", {
      _company_id: companyId,
      _from_currency: "USD",
      _as_of: "2026-11-04",
    });
  });

  it("accepts a database-proven base-currency 1:1 rate", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    expect(await resolveFxRate({ rpc } as never, input({ currency_code: "GBP" }))).toBe(1);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it.each([null, "", "Infinity", "NaN", "0", "-1", 0, -1, Infinity, [], {}])(
    "never treats missing or malformed rate responses as 1:1",
    async (data) => {
      const rpc = vi.fn().mockResolvedValue({ data, error: null });
      await expect(
        resolveFxRate({ rpc } as never, input({ currency_code: "USD" })),
      ).rejects.toThrow(/invalid rate/);
    },
  );

  it("does not silently fall back to 1:1 if the FX RPC is unavailable", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });
    await expect(resolveFxRate({ rpc } as never, input({ currency_code: "EUR" }))).rejects.toThrow(
      /Exchange-rate lookup is unavailable/,
    );
  });

  it("keeps the missing-date-specific helpful error and never posts", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "No exchange rate for JPY → GBP on or before 2026-11-04" },
    });
    await expect(postJournal({ rpc } as never, input({ currency_code: "JPY" }))).rejects.toThrow(
      /No exchange rate/,
    );
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0]?.[0]).toBe("lookup_fx_rate_to_base");
  });

  it("propagates failed rate lookups and rejects invalid currency strings", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "Permission denied" } });
    await expect(resolveFxRate({ rpc } as never, input({ currency_code: "GBP" }))).rejects.toThrow(
      /Permission denied/,
    );
    await expect(
      resolveFxRate({ rpc } as never, input({ currency_code: "USD;DROP" })),
    ).rejects.toThrow(/three letters/);
    expect(rpc).toHaveBeenCalledOnce();
  });

  it("refuses unsafe bank categorisation amounts before posting or reconciling", async () => {
    const rpc = vi.fn();
    const args = {
      company_id: companyId,
      bank_transaction_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      bank_gl_account_id: debits[0]!.account_id,
      offset_account_id: debits[1]!.account_id,
      journal_date: "2026-11-04",
      amount_minor: Number.MAX_SAFE_INTEGER + 1,
      idempotency_key: "bank:unsafe",
    };
    await expect(categoriseBankTransaction({ rpc } as never, args)).rejects.toThrow(
      /exact integer/,
    );
    expect(rpc).not.toHaveBeenCalled();
  });
});

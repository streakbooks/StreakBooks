import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/accounting/posting-engine", () => ({ postJournal: vi.fn() }));
vi.mock("@/lib/banking/server-helpers", () => ({
  loadBankTxn: vi.fn(),
  loadBankAccount: vi.fn(),
  nextCodingKey: vi.fn(),
  linkPostedJournalToBankTxn: vi.fn(),
}));
vi.mock("@/lib/banking/rpc", () => ({ recordAudit: vi.fn(), isMissingSchema: () => false }));
import { postJournal } from "@/lib/accounting/posting-engine";
import {
  loadBankTxn,
  loadBankAccount,
  nextCodingKey,
  linkPostedJournalToBankTxn,
  type AnyClient,
} from "./server-helpers";
import { codeBankTransactionOnce } from "./coding-server";
const query = {
  select: () => query,
  eq: () => query,
  in: async () => ({
    data: [
      {
        id: "expense",
        code: "6000",
        name: "Expense",
        is_active: true,
        is_postable: true,
        is_control: false,
        archived_at: null,
      },
    ],
    error: null,
  }),
};
const client = { from: () => query } as unknown as AnyClient;
const args = {
  companyId: "company",
  bankTransactionId: "transaction",
  splits: [{ accountId: "expense", amountMinor: 10000 }],
  treatment: "inclusive" as const,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadBankTxn).mockResolvedValue({
    id: "transaction",
    bank_account_id: "bank",
    txn_date: "2026-11-01",
    amount_minor: -10000,
    description: "Hosting",
    status: "uncategorised",
  });
  vi.mocked(loadBankAccount).mockResolvedValue({
    id: "bank",
    name: "Euro Bank",
    currency_code: "EUR",
    gl_account_id: "bank-gl",
    is_active: true,
  });
  vi.mocked(nextCodingKey).mockResolvedValue("stable-key");
  vi.mocked(postJournal).mockResolvedValue({ journalId: "journal" });
});
describe("bank coding posting boundary", () => {
  it("preserves the bank currency for the authoritative FX/posting engine", async () => {
    await codeBankTransactionOnce(client, "user", args);
    expect(postJournal).toHaveBeenCalledWith(
      client,
      expect.objectContaining({
        currency_code: "EUR",
        source_type: "bank_transaction",
        source_id: "transaction",
        idempotency_key: "stable-key",
        lines: expect.arrayContaining([
          expect.objectContaining({ account_id: "expense", debit_minor: 10000n }),
          expect.objectContaining({ account_id: "bank-gl", credit_minor: 10000n }),
        ]),
      }),
    );
    expect(linkPostedJournalToBankTxn).toHaveBeenCalledTimes(1);
  });
  it("does not link or teach when the authoritative posting engine rejects", async () => {
    vi.mocked(postJournal).mockRejectedValueOnce(new Error("Period locked"));
    await expect(codeBankTransactionOnce(client, "user", args)).rejects.toThrow("Period locked");
    expect(linkPostedJournalToBankTxn).not.toHaveBeenCalled();
  });
});

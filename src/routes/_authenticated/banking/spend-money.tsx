import { createFileRoute } from "@tanstack/react-router";
import { NewExpense } from "@/screens/purchases/expenses.new";

/**
 * Canonical Banking Spend Money entry.
 * Reuses the authorised `saveAndPostExpense` / `purchase_expenses` engine under Banking ownership
 * so GL posting stays single-sourced (no duplicate spend engine).
 */
export const Route = createFileRoute("/_authenticated/banking/spend-money")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { bankAccountId?: string; returnTo?: string } => {
    const out: { bankAccountId?: string; returnTo?: string } = {};
    const bank = search["bankAccountId"];
    if (typeof bank === "string" && /^[0-9a-f-]{36}$/i.test(bank)) out.bankAccountId = bank;
    const ret = search["returnTo"];
    if (typeof ret === "string" && ret.startsWith("/") && !ret.startsWith("//")) out.returnTo = ret;
    return out;
  },
  head: () => ({ meta: [{ title: "Spend money — StreakBooks" }] }),
  component: SpendMoneyRoute,
});

function SpendMoneyRoute() {
  const { bankAccountId, returnTo } = Route.useSearch();
  return (
    <NewExpense
      ownership="banking"
      {...(bankAccountId ? { initialBankAccountId: bankAccountId } : {})}
      {...(returnTo ? { returnTo } : {})}
    />
  );
}

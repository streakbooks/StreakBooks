import { createFileRoute } from "@tanstack/react-router";
import { MoneyDocumentPanel } from "@/components/create-new/MoneyDocumentPanel";

/**
 * Canonical Banking Receive Money entry.
 * Posts via existing `saveMoneyDocument` / `receive_money` engine — no duplicate ledger path.
 */
export const Route = createFileRoute("/_authenticated/banking/receive-money")({
  validateSearch: (search: Record<string, unknown>): { bankAccountId?: string } => {
    const raw = search["bankAccountId"];
    if (typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw)) {
      return { bankAccountId: raw };
    }
    return {};
  },
  head: () => ({ meta: [{ title: "Receive money — StreakBooks" }] }),
  component: ReceiveMoneyRoute,
});

function ReceiveMoneyRoute() {
  const { bankAccountId } = Route.useSearch();
  return (
    <MoneyDocumentPanel
      kind="receive_money"
      {...(bankAccountId ? { initialBankAccountId: bankAccountId } : {})}
    />
  );
}

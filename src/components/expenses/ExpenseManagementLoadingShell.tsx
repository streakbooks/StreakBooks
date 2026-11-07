import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { LoadingState, PageHeader } from "@/components/common/states";
import type { ExpenseManagementSectionKey } from "@/lib/expenses/sections";

/** Keeps EM chrome visible while a section query loads. */
export function ExpenseManagementLoadingShell({
  title,
  current,
  description = "Expense Management",
}: {
  title: string;
  current: ExpenseManagementSectionKey;
  description?: string;
}) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <ExpenseManagementSubnav current={current} />
      <LoadingState />
    </>
  );
}

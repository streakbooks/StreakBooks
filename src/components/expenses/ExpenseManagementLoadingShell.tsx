import { ExpenseManagementSubnav } from "@/components/expenses/ExpenseManagementSubnav";
import { LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import type { ExpenseManagementSectionKey } from "@/lib/expenses/sections";

/** Keeps EM chrome visible while a section query loads. */
export function ExpenseManagementLoadingShell({
  title,
  current,
  description = "Expenses",
}: {
  title: string;
  current: ExpenseManagementSectionKey;
  description?: string;
}) {
  return (
    <ListWorkspace
      title={title}
      description={description}
      subnav={<ExpenseManagementSubnav current={current} />}
    >
      <LoadingState />
    </ListWorkspace>
  );
}

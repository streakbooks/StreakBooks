// In-memory UI fixture only. The SQL suite separately tests real permission and transition boundaries.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PracticeWorkBoardView } from "../../src/components/accountant/PracticeWorkBoardView";
import type { PracticeTask, PracticeWorkspace } from "../../src/lib/accountant/practice-work";
const c1 = "00000000-0000-4000-8000-000000000001",
  c2 = "00000000-0000-4000-8000-000000000002",
  user = "00000000-0000-4000-8000-000000000003";
const task: PracticeTask = {
  id: "00000000-0000-4000-8000-000000000004",
  company_id: c1,
  title: "Reconcile October bank",
  kind: "month_end",
  period_end: "2026-10-31",
  due_date: "2020-01-01",
  status: "ready",
  assignee_id: null,
  note: "Bank agrees to statement",
  version: 3,
  prepared_by: user,
  reviewed_by: null,
  completed_at: null,
  updated_at: "2026-11-01T00:00:00Z",
};
export function Fixture() {
  const [workspace, setWorkspace] = useState<PracticeWorkspace>({
    clients: [
      { id: c1, name: "Writable client", canManage: true },
      { id: c2, name: "View only client", canManage: false },
    ],
    tasks: [
      task,
      {
        ...task,
        id: "00000000-0000-4000-8000-000000000005",
        company_id: c2,
        title: "View-only tax review",
        status: "todo",
      },
    ],
    userId: user,
    hasMore: false,
    page: 0,
  });
  return (
    <PracticeWorkBoardView
      workspace={workspace}
      busy={false}
      onRefresh={() => {}}
      renderAssignees={() => null}
      onSave={async (input) => {
        setWorkspace((w) => ({
          ...w,
          tasks: [
            ...w.tasks,
            {
              ...task,
              ...input.payload,
              id: crypto.randomUUID(),
              company_id: input.companyId,
              status: "todo",
              prepared_by: null,
              reviewed_by: null,
              completed_at: null,
              version: 1,
            } as PracticeTask,
          ],
        }));
      }}
      onBulk={async (input) => {
        if (input.note === "Simulate version conflict")
          throw new Error("Task changed. Refresh before retrying");
        setWorkspace((w) => ({
          ...w,
          tasks: w.tasks.map((t) =>
            input.items.some((i) => i.id === t.id)
              ? { ...t, status: input.status, note: input.note, version: t.version + 1 }
              : t,
          ),
        }));
      }}
      onPack={async (input) =>
        input.companyIds.map((companyId) => ({ companyId, created: 6, error: null }))
      }
    />
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);

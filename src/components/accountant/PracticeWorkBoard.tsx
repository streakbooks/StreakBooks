import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listPracticeWork,
  savePracticeTask,
  bulkPracticeTasks,
  createMonthEndWork,
  listPracticeAssignees,
} from "@/lib/accountant/practice.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
import {
  PracticeWorkBoardView,
  type TaskInput,
  type BulkInput,
  type PackInput,
} from "./PracticeWorkBoardView";
export function PracticeWorkBoard({ companyId, firmId }: { companyId?: string; firmId?: string }) {
  const load = useServerFn(listPracticeWork);
  const save = useServerFn(savePracticeTask);
  const bulk = useServerFn(bulkPracticeTasks);
  const pack = useServerFn(createMonthEndWork);
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const workspace = useQuery({
    queryKey: ["practice-work", firmId ?? companyId, page],
    queryFn: () => load({ data: firmId ? { firmId, page } : { companyId: companyId!, page } }),
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["practice-work"] });
  const saveM = useMutation({
    mutationFn: (data: TaskInput) => save({ data }),
    onSuccess: async () => {
      await invalidate();
      toast.success("Client work saved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const bulkM = useMutation({
    mutationFn: (data: BulkInput) => bulk({ data }),
    onSuccess: async (result) => {
      await invalidate();
      toast.success(`${result.updated} tasks updated`);
    },
    onError: async (e) => {
      await invalidate();
      toast.error(friendlyAuthError(e));
    },
  });
  const packM = useMutation({
    mutationFn: (data: PackInput) => pack({ data }),
    onSuccess: invalidate,
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  if (workspace.isPending) return <LoadingState />;
  if (workspace.isError)
    return (
      <QueryErrorState queries={[workspace]} title="Could not load practice work" />
    );
  return (
    <PracticeWorkBoardView
      key={`${firmId ?? companyId}:${page}`}
      workspace={workspace.data}
      onNext={() => setPage((p) => p + 1)}
      onPrevious={() => setPage((p) => Math.max(0, p - 1))}
      busy={saveM.isPending || bulkM.isPending || packM.isPending}
      onSave={saveM.mutateAsync}
      onBulk={bulkM.mutateAsync}
      onPack={packM.mutateAsync}
      renderAssignees={(companyId) => <AssigneeOptions companyId={companyId} />}
      onRefresh={() => {
        void workspace.refetch();
      }}
    />
  );
}
function AssigneeOptions({ companyId }: { companyId: string }) {
  const fetch = useServerFn(listPracticeAssignees);
  const members = useQuery({
    queryKey: ["practice-assignees", companyId],
    queryFn: () => fetch({ data: { companyId } }),
    enabled: Boolean(companyId),
  });
  return (
    <>
      {members.isError ? (
        <option disabled>Team could not be loaded</option>
      ) : (
        (members.data ?? []).map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.name}
          </option>
        ))
      )}
    </>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getCorrectionSetup,
  findCorrectionLines,
  previewCorrection,
  applyCorrection,
  undoCorrection,
  getCorrectionUndoSnapshot,
  listCorrectionHistory,
} from "@/lib/accounting/corrections/correction.functions";
import {
  type CorrectionFilter,
  type CorrectionInput,
  type CorrectionBatch,
} from "@/lib/accounting/corrections/contracts";
import {
  assertCorrectionUndoSnapshot,
  correctionUndoDateIssue,
} from "@/lib/accounting/corrections/history-review";
import {
  getCorrectionApprovalSettings,
  submitCorrectionApproval,
} from "@/lib/accounting/corrections/approval.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { LoadingState } from "@/components/common/states";
import { TransactionCorrectionsView } from "./TransactionCorrectionsView";
import { CorrectionApprovalsPanel } from "./CorrectionApprovalsPanel";
export function TransactionCorrections({ companyId }: { companyId: string }) {
  const setupFn = useServerFn(getCorrectionSetup),
    find = useServerFn(findCorrectionLines),
    preview = useServerFn(previewCorrection),
    apply = useServerFn(applyCorrection),
    undo = useServerFn(undoCorrection),
    liveUndo = useServerFn(getCorrectionUndoSnapshot),
    historyFn = useServerFn(listCorrectionHistory),
    settingsFn = useServerFn(getCorrectionApprovalSettings),
    submitApproval = useServerFn(submitCorrectionApproval);
  const [page, setPage] = useState(0);
  const qc = useQueryClient();
  const setup = useQuery({
    queryKey: ["transaction-correction-setup", companyId],
    queryFn: () => setupFn({ data: { companyId } }),
  });
  const approvalSettings = useQuery({
    queryKey: ["correction-approval-settings", companyId],
    queryFn: () => settingsFn({ data: { companyId } }),
  });
  const history = useQuery({
    queryKey: ["transaction-correction-history", companyId, page],
    queryFn: () => historyFn({ data: { companyId, page } }),
  });
  const invalidate = () =>
    qc.invalidateQueries({ predicate: (q) => q.queryKey.includes(companyId) });
  const findM = useMutation({
    mutationFn: (filters: CorrectionFilter) => find({ data: { companyId, filters } }),
  });
  const previewM = useMutation({
    mutationFn: (input: CorrectionInput) => preview({ data: input }),
  });
  const applyM = useMutation({
    mutationFn: (data: { input: CorrectionInput; requestKey: string; previewHash: string }) =>
      apply({ data }),
    onSuccess: invalidate,
  });
  const submitM = useMutation({
    mutationFn: (data: { input: CorrectionInput; requestKey: string; previewHash: string }) =>
      submitApproval({ data }),
    onSuccess: invalidate,
  });
  const undoM = useMutation({
    mutationFn: async (data: { batch: CorrectionBatch; date: string; reason: string }) => {
      const issue = correctionUndoDateIssue(data.batch, data.date, data.reason);
      if (issue) throw new Error(issue);
      const latest = await liveUndo({ data: { companyId, batchId: data.batch.id } });
      assertCorrectionUndoSnapshot(data.batch, latest);
      return undo({
        data: { companyId, batchId: data.batch.id, date: data.date, reason: data.reason },
      });
    },
    onSuccess: invalidate,
  });
  if (setup.isPending || approvalSettings.isPending) return <LoadingState />;
  if (setup.isError)
    return <QueryErrorState queries={[setup]} title="Transaction corrections unavailable" />;
  if (approvalSettings.isError)
    return (
      <QueryErrorState
        queries={[approvalSettings]}
        title="Correction approval settings unavailable"
      />
    );
  return (
    <div className="space-y-5">
      <TransactionCorrectionsView
        key={companyId}
        companyId={companyId}
        setup={setup.data}
        busy={
          findM.isPending ||
          previewM.isPending ||
          applyM.isPending ||
          submitM.isPending ||
          undoM.isPending
        }
        onSearch={findM.mutateAsync}
        onPreview={previewM.mutateAsync}
        onApply={applyM.mutateAsync}
        approvalRequired={approvalSettings.data.required}
        onSubmitApproval={submitM.mutateAsync}
        onUndo={undoM.mutateAsync}
        history={history.data ?? { rows: [], has_more: false, page }}
        historyLoading={history.isPending}
        historyLoad={history}
        onHistoryPage={setPage}
        onHistoryRefresh={() => {
          void history.refetch();
        }}
      />
      <CorrectionApprovalsPanel
        companyId={companyId}
        settings={approvalSettings.data}
        canPost={setup.data.can_apply}
        decimals={setup.data.decimals}
      />
    </div>
  );
}

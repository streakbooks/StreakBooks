import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getCorrectionSetup,
  findCorrectionLines,
  previewCorrection,
  applyCorrection,
  undoCorrection,
  listCorrectionHistory,
} from "@/lib/accounting/corrections/correction.functions";
import {
  type CorrectionFilter,
  type CorrectionInput,
} from "@/lib/accounting/corrections/contracts";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { ErrorState, LoadingState } from "@/components/common/states";
import { TransactionCorrectionsView } from "./TransactionCorrectionsView";
export function TransactionCorrections({ companyId }: { companyId: string }) {
  const setupFn = useServerFn(getCorrectionSetup),
    find = useServerFn(findCorrectionLines),
    preview = useServerFn(previewCorrection),
    apply = useServerFn(applyCorrection),
    undo = useServerFn(undoCorrection),
    historyFn = useServerFn(listCorrectionHistory);
  const [page, setPage] = useState(0);
  const qc = useQueryClient();
  const setup = useQuery({
    queryKey: ["transaction-correction-setup", companyId],
    queryFn: () => setupFn({ data: { companyId } }),
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
  const undoM = useMutation({
    mutationFn: (data: { batchId: string; date: string; reason: string }) =>
      undo({ data: { ...data, companyId } }),
    onSuccess: invalidate,
  });
  if (setup.isPending) return <LoadingState />;
  if (setup.isError)
    return (
      <ErrorState
        onRetry={() => void setup.refetch()}
        title="Transaction corrections unavailable"
        description={friendlyAuthError(setup.error)}
      />
    );
  return (
    <TransactionCorrectionsView
      key={companyId}
      companyId={companyId}
      setup={setup.data}
      busy={findM.isPending || previewM.isPending || applyM.isPending || undoM.isPending}
      onSearch={findM.mutateAsync}
      onPreview={previewM.mutateAsync}
      onApply={applyM.mutateAsync}
      onUndo={undoM.mutateAsync}
      history={history.data ?? { rows: [], has_more: false, page }}
      historyLoading={history.isPending}
      historyError={history.isError ? friendlyAuthError(history.error) : ""}
      onHistoryPage={setPage}
      onHistoryRefresh={() => {
        void history.refetch();
      }}
    />
  );
}

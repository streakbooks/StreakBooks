import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LookupSelect } from "@/components/lookup/LookupSelect";
import { useLookupQuery } from "@/components/lookup/use-lookup-query";
import { searchReportingModels, getReportingModel } from "@/lib/reports/ecosystem.functions";
export type ReportingModelChoice = {
  id: string;
  name: string;
  kind: string;
  version: number;
  config: unknown;
};
/** Search all accessible models instead of filtering a capped workspace snapshot. */
export function ReportingModelSelect({
  companyId,
  kind,
  label,
  onSelect,
  revision = "",
}: {
  companyId: string;
  kind: "dashboard" | "forecast" | "pack_template";
  label: string;
  onSelect: (model: ReportingModelChoice) => void;
  revision?: string;
}) {
  const search = useServerFn(searchReportingModels);
  const load = useServerFn(getReportingModel);
  const [opening, setOpening] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const request = useRef(0);
  const lifecycle = useRef({ active: true });
  useEffect(() => {
    const scope = { active: true };
    lifecycle.current = scope;
    setOpening(false);
    setOpenError(null);
    return () => {
      scope.active = false;
    };
  }, [companyId, kind]);
  const query = useLookupQuery<Omit<ReportingModelChoice, "config">>({
    companyId,
    kind: `report-model:${kind}:${revision}`,
    fetchPage: ({ companyId, query, page, pageSize }) =>
      search({ data: { companyId, kind, query, page, pageSize } }),
  });
  return (
    <div className="space-y-1">
      <LookupSelect
        ariaLabel={label}
        placeholder={label}
        value=""
        allowClear={false}
        clientFilter={false}
        options={query.rows.map((row) => ({ id: row.id, label: row.name }))}
        search={query.query}
        onSearchChange={query.setQuery}
        loading={query.loading || opening}
        error={openError ?? query.error}
        onRetry={() => {
          setOpenError(null);
          query.retry();
        }}
        hasMore={query.hasMore}
        onLoadMore={query.loadMore}
        loadingMore={query.loading && query.rows.length > 0}
        disabled={opening}
        onChange={async (id) => {
          const attempt = ++request.current;
          const scope = lifecycle.current;
          setOpening(true);
          setOpenError(null);
          try {
            const model = await load({ data: { companyId, id } });
            if (!scope.active || attempt !== request.current) return;
            if (model.kind !== kind)
              throw new Error("The model type changed; refresh and try again.");
            onSelect(model);
          } catch (error) {
            if (scope.active && attempt === request.current)
              setOpenError(error instanceof Error ? error.message : "Could not open this model");
          } finally {
            if (scope.active && attempt === request.current) setOpening(false);
          }
        }}
      />
      {opening && (
        <p role="status" className="text-xs text-muted-foreground">
          Opening current saved configuration…
        </p>
      )}
      {openError && (
        <p role="alert" className="text-sm text-destructive">
          {openError}
        </p>
      )}
    </div>
  );
}

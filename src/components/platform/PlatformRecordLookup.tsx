import { LookupSelect } from "@/components/lookup/LookupSelect";
import { useLookupQuery } from "@/components/lookup/use-lookup-query";
import { useServerFn } from "@tanstack/react-start";
import { lookupOps } from "@/lib/platform/operations.functions";
import type { OpsOption } from "@/lib/platform/operations";
export function PlatformRecordLookup({
  kind,
  value,
  label,
  onChange,
  disabled = false,
  required = false,
}: {
  kind: "business" | "staff";
  value: string;
  label?: string | undefined;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  const load = useServerFn(lookupOps);
  const lookup = useLookupQuery<OpsOption>({
    companyId: "platform",
    kind: `operations-${kind}`,
    pageSize: 25,
    enabled: !disabled,
    fetchPage: async ({ query, page, signal }) => {
      const result = await load({ data: { kind, search: query, page }, signal });
      return { rows: result.rows, hasMore: (page + 1) * 25 < result.total };
    },
  });
  const options =
    lookup.rows.some((r) => r.id === value) || !value
      ? lookup.rows
      : [{ id: value, label: label || value }, ...lookup.rows];
  return (
    <LookupSelect
      options={options}
      value={value}
      onChange={onChange}
      ariaLabel={kind === "business" ? "Business" : "Assigned support staff"}
      searchPlaceholder={
        kind === "business" ? "Search businesses by name or ID" : "Search eligible support staff"
      }
      clientFilter={false}
      search={lookup.query}
      onSearchChange={lookup.setQuery}
      loading={lookup.loading}
      error={lookup.error}
      onRetry={lookup.retry}
      hasMore={lookup.hasMore}
      onLoadMore={lookup.loadMore}
      loadingMore={lookup.loading && lookup.rows.length > 0}
      disabled={disabled}
      required={required}
      allowClear={!required}
    />
  );
}

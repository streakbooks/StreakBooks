import { LookupSelect, type LookupSelectProps } from "./LookupSelect";
import { Button } from "@/components/ui/button";
import { formatLookupLabel } from "@/lib/lookup/search";
/** Multi-record selection composes the same ID-based, searchable and accessible lookup. */
export function MultiLookupSelect({
  values,
  onValuesChange,
  ...props
}: Omit<LookupSelectProps, "value" | "onChange"> & {
  values: string[];
  onValuesChange: (ids: string[]) => void;
}) {
  return (
    <div className="space-y-2">
      <LookupSelect
        {...props}
        value=""
        onChange={(id) => {
          if (id && !values.includes(id)) onValuesChange([...values, id]);
        }}
        allowClear={false}
        options={props.options.map((o) => ({
          ...o,
          disabled: o.disabled || values.includes(o.id),
        }))}
      />
      <div
        className="flex flex-wrap gap-2"
        aria-label={`${props.ariaLabel ?? "Record"} selections`}
      >
        {values.map((id) => {
          const option = props.options.find((o) => o.id === id);
          return (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
            >
              {option ? formatLookupLabel(option) : `Unavailable record ${id}`}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-5 px-1"
                disabled={props.disabled}
                aria-label={`Remove ${option?.label ?? id}`}
                onClick={() => onValuesChange(values.filter((value) => value !== id))}
              >
                ×
              </Button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

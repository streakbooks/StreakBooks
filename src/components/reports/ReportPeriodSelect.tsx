import { LookupSelect } from "@/components/lookup/LookupSelect";
import { Label } from "@/components/ui/label";
import { PERIOD_PRESETS, reportPeriod } from "@/lib/reports/report-periods";
import { todayIso } from "@/lib/accounting/fiscal-year";
export function ReportPeriodSelect({
  from,
  to,
  onChange,
  fyMonth = 12,
  fyDay = 31,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  fyMonth?: number;
  fyDay?: number;
}) {
  const today = todayIso();
  const selected =
    PERIOD_PRESETS.find(([id]) => {
      const p = reportPeriod(id, today, fyMonth, fyDay);
      return p.from === from && p.to === to;
    })?.[0] ?? "custom";
  return (
    <div className="space-y-1">
      <Label>Report period</Label>
      <LookupSelect
        ariaLabel="Report period preset"
        value={selected}
        allowClear={false}
        options={[
          { id: "custom", label: "Custom dates" },
          ...PERIOD_PRESETS.map(([id, label]) => ({ id, label })),
        ]}
        onChange={(id) => {
          if (id !== "custom") onChange(reportPeriod(id, today, fyMonth, fyDay));
        }}
      />
    </div>
  );
}

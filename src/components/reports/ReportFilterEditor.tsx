import { LookupSelect } from "@/components/lookup/LookupSelect";
import { MultiLookupSelect } from "@/components/lookup/MultiLookupSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ReportAccount } from "@/lib/reports/custom-definition";
import {
  FILTER_FIELDS,
  FILTER_LABELS,
  OPERATOR_LABELS,
  filterOperators,
  type FilterField,
  type FilterOperator,
  type ReportFilter,
  type ReportFilters,
} from "@/lib/reports/report-filters";

export function ReportFilterEditor({
  value,
  onChange,
  accounts,
  filterOptions,
}: {
  value: ReportFilters;
  onChange: (value: ReportFilters) => void;
  accounts: ReportAccount[];
  filterOptions: { currencies: string[]; sources: string[] };
}) {
  function patch(id: string, changes: Partial<ReportFilter>) {
    onChange({
      ...value,
      clauses: value.clauses.map((c) => (c.id === id ? { ...c, ...changes } : c)),
    });
  }
  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Report filters">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Report filters</h3>
        <Button
          variant="outline"
          size="sm"
          disabled={value.clauses.length >= 30}
          onClick={() =>
            onChange({
              ...value,
              clauses: [
                ...value.clauses,
                { id: crypto.randomUUID(), field: "account_id", op: "in", values: [] },
              ],
            })
          }
        >
          Add condition
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Conditions match posted journal lines before aggregation. Amounts use the company base
        currency. Filtered reports can exclude balancing entries and are labelled in exports.
      </p>
      {value.clauses.length > 0 && (
        <LookupSelect
          ariaLabel="Match conditions"
          value={value.logic}
          allowClear={false}
          options={[
            { id: "and", label: "Match all conditions (AND)" },
            { id: "or", label: "Match any condition (OR)" },
          ]}
          onChange={(logic) => onChange({ ...value, logic: logic as ReportFilters["logic"] })}
        />
      )}
      {value.clauses.map((clause, index) => {
        const unary = clause.op === "empty" || clause.op === "not_empty";
        const list = clause.op === "in" || clause.op === "not_in";
        const options =
          clause.field === "account_id"
            ? accounts.map((a) => ({ id: a.id, label: `${a.code} — ${a.name}` }))
            : clause.field === "account_type"
              ? ["asset", "liability", "equity", "income", "expense"].map((id) => ({
                  id,
                  label: id,
                }))
              : clause.field === "status"
                ? [{ id: "posted", label: "Posted" }]
                : clause.field === "currency"
                  ? filterOptions.currencies.map((id) => ({ id, label: id }))
                  : clause.field === "source_type"
                    ? filterOptions.sources.map((id) => ({ id, label: id.replaceAll("_", " ") }))
                    : clause.field === "account_group"
                      ? [...new Set(accounts.flatMap((a) => (a.fs_line ? [a.fs_line] : [])))]
                          .sort()
                          .map((id) => ({ id, label: id.replaceAll("_", " ") }))
                      : null;
        return (
          <div key={clause.id} className="space-y-2 rounded-md border p-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <LookupSelect
                ariaLabel={`Condition ${index + 1} field`}
                value={clause.field}
                allowClear={false}
                options={FILTER_FIELDS.map((id) => ({ id, label: FILTER_LABELS[id] }))}
                onChange={(field) =>
                  patch(clause.id, { field: field as FilterField, op: "eq", values: [""] })
                }
              />
              <LookupSelect
                ariaLabel={`Condition ${index + 1} operator`}
                value={clause.op}
                allowClear={false}
                options={filterOperators(clause.field).map((id) => ({
                  id,
                  label: OPERATOR_LABELS[id],
                }))}
                onChange={(op) =>
                  patch(clause.id, {
                    op: op as FilterOperator,
                    values:
                      op === "empty" || op === "not_empty" || op === "in" || op === "not_in"
                        ? []
                        : op === "between"
                          ? ["", ""]
                          : [""],
                  })
                }
              />
              <Button
                variant="ghost"
                aria-label={`Remove condition ${index + 1}`}
                onClick={() =>
                  onChange({ ...value, clauses: value.clauses.filter((c) => c.id !== clause.id) })
                }
              >
                Remove
              </Button>
            </div>
            {!unary &&
              (options ? (
                list ? (
                  <MultiLookupSelect
                    ariaLabel={`Condition ${index + 1} values`}
                    options={options}
                    values={clause.values}
                    onValuesChange={(values) => patch(clause.id, { values })}
                  />
                ) : (
                  <LookupSelect
                    ariaLabel={`Condition ${index + 1} value`}
                    options={options}
                    value={clause.values[0] ?? ""}
                    onChange={(v) => patch(clause.id, { values: [v] })}
                  />
                )
              ) : list ? (
                <Textarea
                  aria-label={`Condition ${index + 1} values`}
                  placeholder="One exact value per line"
                  value={clause.values.join("\n")}
                  onChange={(e) => patch(clause.id, { values: e.target.value.split("\n") })}
                />
              ) : (
                <div className="flex gap-2">
                  {Array.from({ length: clause.op === "between" ? 2 : 1 }, (_, i) => (
                    <Input
                      key={i}
                      aria-label={`Condition ${index + 1} value ${i + 1}`}
                      type={clause.field === "journal_date" ? "date" : "text"}
                      placeholder={
                        clause.field === "currency"
                          ? "e.g. GBP"
                          : clause.field === "debit" || clause.field === "credit"
                            ? "Exact amount, e.g. 100.50"
                            : "Exact value"
                      }
                      value={clause.values[i] ?? ""}
                      onChange={(e) => {
                        const values = [...clause.values];
                        values[i] = e.target.value;
                        patch(clause.id, { values });
                      }}
                    />
                  ))}
                </div>
              ))}
          </div>
        );
      })}
    </section>
  );
}

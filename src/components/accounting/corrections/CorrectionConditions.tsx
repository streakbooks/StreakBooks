import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  conditionFields,
  conditionOperators,
  operatorsFor,
  type SearchCondition,
  type ConditionField,
  type ConditionOperator,
} from "@/lib/accounting/corrections/contracts";
export function CorrectionConditions({
  conditions,
  match,
  currency,
  disabled,
  onChange,
  onMatch,
}: {
  conditions: SearchCondition[];
  match: "all" | "any";
  currency: string;
  disabled: boolean;
  onChange: (conditions: SearchCondition[]) => void;
  onMatch: (match: "all" | "any") => void;
}) {
  const update = (index: number, patch: Partial<SearchCondition>) =>
    onChange(conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  return (
    <fieldset disabled={disabled} className="space-y-3 rounded border p-3">
      <legend className="px-1 text-sm font-medium">Additional conditions</legend>
      <label className="flex items-center gap-2 text-sm">
        Match
        <select
          aria-label="Condition matching"
          className="rounded border bg-background p-2"
          value={match}
          onChange={(e) => onMatch(e.target.value as "all" | "any")}
        >
          <option value="all">Every condition (AND)</option>
          <option value="any">At least one condition (OR)</option>
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        Date range, statement, account and basic filters always apply. Amounts use {currency}. Tax
        conditions inspect source lines assigned to this account; missing metadata is searchable
        with “is empty”. Reconciliation dates refer to completed, active sessions for the journal.
      </p>
      {conditions.map((c, index) => {
        const kind = conditionFields[c.field].kind;
        const empty = c.operator === "empty" || c.operator === "not_empty";
        return (
          <div className="grid items-start gap-2 md:grid-cols-[2fr_2fr_2fr_2fr_auto]" key={index}>
            <select
              aria-label={`Condition ${index + 1} field`}
              className="rounded border bg-background p-2"
              value={c.field}
              onChange={(e) => {
                const field = e.target.value as ConditionField;
                update(index, { field, operator: "is", value: "", value_to: "" });
              }}
            >
              {Object.entries(conditionFields).map(([value, f]) => (
                <option key={value} value={value}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              aria-label={`Condition ${index + 1} operator`}
              className="rounded border bg-background p-2"
              value={c.operator}
              onChange={(e) => update(index, { operator: e.target.value as ConditionOperator })}
            >
              {operatorsFor(c.field).map((op) => (
                <option key={op} value={op}>
                  {conditionOperators[op]}
                </option>
              ))}
            </select>
            {!empty ? (
              <Input
                aria-label={`Condition ${index + 1} value`}
                required
                type={kind === "date" ? "date" : "text"}
                inputMode={kind === "money" || kind === "rate" ? "decimal" : "text"}
                maxLength={200}
                value={c.value}
                onChange={(e) => update(index, { value: e.target.value })}
                placeholder={
                  c.field === "side"
                    ? "debit or credit"
                    : c.field === "eligibility"
                      ? "eligible or blocked"
                      : kind === "money"
                        ? `Amount in ${currency}`
                        : conditionFields[c.field].label
                }
              />
            ) : (
              <span />
            )}
            {c.operator === "between" ? (
              <Input
                aria-label={`Condition ${index + 1} upper value`}
                required
                type={kind === "date" ? "date" : "text"}
                inputMode={kind === "date" ? "text" : "decimal"}
                maxLength={200}
                value={c.value_to}
                onChange={(e) => update(index, { value_to: e.target.value })}
              />
            ) : (
              <span />
            )}
            <Button
              type="button"
              variant="outline"
              aria-label={`Remove condition ${index + 1}`}
              onClick={() => onChange(conditions.filter((_, i) => i !== index))}
            >
              Remove
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="outline"
        disabled={conditions.length >= 30}
        onClick={() =>
          onChange([
            ...conditions,
            { field: "account_type", operator: "is", value: "", value_to: "" },
          ])
        }
      >
        Add condition
      </Button>
      {!!conditions.length && (
        <Button type="button" variant="ghost" onClick={() => onChange([])}>
          Clear conditions
        </Button>
      )}
    </fieldset>
  );
}

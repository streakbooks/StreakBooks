import { ReportFilterEditor } from "./ReportFilterEditor";
import { MultiLookupSelect } from "@/components/lookup/MultiLookupSelect";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CustomDefinition, CustomRow, ReportAccount } from "@/lib/reports/custom-definition";
import { customRowSchema, customColumnSchema } from "@/lib/reports/custom-definition";
const select = "h-9 rounded-md border border-input bg-background px-2 text-sm";
export function CustomReportDesigner({
  definition: d,
  onChange,
  accounts,
  filterOptions,
}: {
  definition: CustomDefinition;
  onChange: (v: CustomDefinition) => void;
  accounts: ReportAccount[];
  filterOptions: { currencies: string[]; sources: string[] };
}) {
  const [selected, setSelected] = useState(d.rows[0]?.id ?? "");
  const row = d.rows.find((r) => r.id === selected);
  function patchRow(patch: Partial<CustomRow>) {
    onChange({ ...d, rows: d.rows.map((r) => (r.id === selected ? { ...r, ...patch } : r)) });
  }
  function move<T>(array: T[], index: number, offset: number): T[] {
    const out = [...array];
    const target = index + offset;
    if (target < 0 || target >= out.length) return out;
    [out[index], out[target]] = [out[target]!, out[index]!];
    return out;
  }
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="builder-title">Report title</Label>
          <Input
            id="builder-title"
            value={d.title}
            maxLength={80}
            onChange={(e) => onChange({ ...d, title: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="builder-subtitle">Subtitle</Label>
          <Input
            id="builder-subtitle"
            value={d.subtitle}
            maxLength={300}
            onChange={(e) => onChange({ ...d, subtitle: e.target.value })}
          />
        </div>
      </div>
      <ReportFilterEditor
        value={d.filters}
        filterOptions={filterOptions}
        accounts={accounts}
        onChange={(filters) => onChange({ ...d, filters })}
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(220px,1fr)_minmax(300px,2fr)]">
        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Report rows</h3>
            <Button
              size="sm"
              variant="outline"
              disabled={d.rows.length >= 150}
              onClick={() => {
                const r = customRowSchema.parse({
                  id: `row_${crypto.randomUUID().slice(0, 8)}`,
                  label: "New row",
                  kind: "accounts",
                });
                onChange({ ...d, rows: [...d.rows, r] });
                setSelected(r.id);
              }}
            >
              Add row
            </Button>
          </div>
          <ol className="space-y-2">
            {d.rows.map((r, i) => (
              <li key={r.id} className="rounded-md border p-2">
                <button
                  className={`w-full text-left text-sm ${selected === r.id ? "font-semibold text-primary" : ""}`}
                  aria-pressed={selected === r.id}
                  onClick={() => setSelected(r.id)}
                >
                  {r.label}
                  {r.hidden ? " (hidden)" : ""}
                  <span className="block font-mono text-xs text-muted-foreground">
                    [{r.id}] · {r.kind}
                  </span>
                </button>
                <div className="mt-2 flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Move ${r.label} up`}
                    disabled={i === 0}
                    onClick={() => onChange({ ...d, rows: move(d.rows, i, -1) })}
                  >
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Move ${r.label} down`}
                    disabled={i === d.rows.length - 1}
                    onClick={() => onChange({ ...d, rows: move(d.rows, i, 1) })}
                  >
                    ↓
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={d.rows.length === 1}
                    aria-label={`Remove ${r.label}`}
                    onClick={() => {
                      const rows = d.rows.filter((x) => x.id !== r.id);
                      onChange({ ...d, rows });
                      if (selected === r.id) setSelected(rows[0]!.id);
                    }}
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        </section>
        {row && (
          <section className="space-y-4 rounded-lg border p-4">
            <h3 className="font-semibold">Configure {row.label}</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="row-label">Row label</Label>
                <Input
                  id="row-label"
                  value={row.label}
                  maxLength={160}
                  onChange={(e) => patchRow({ label: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="row-kind">Row type</Label>
                <select
                  id="row-kind"
                  className={`${select} w-full`}
                  value={row.kind}
                  onChange={(e) => patchRow({ kind: e.target.value as CustomRow["kind"] })}
                >
                  <option value="heading">Section heading</option>
                  <option value="accounts">Accounts</option>
                  <option value="group">Group / subtotal</option>
                  <option value="formula">Calculated row</option>
                </select>
              </div>
            </div>
            {row.kind === "accounts" && (
              <>
                <Label>Selected accounts</Label>
                <MultiLookupSelect
                  ariaLabel="Custom report accounts"
                  options={accounts.map((a) => ({
                    id: a.id,
                    label: a.name,
                    name: a.name,
                    code: a.code,
                    group: a.account_type,
                  }))}
                  values={row.accountIds}
                  onValuesChange={(accountIds) => patchRow({ accountIds })}
                  placeholder="Find and add accounts"
                />
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">Include account types</legend>
                  {(["asset", "liability", "equity", "income", "expense"] as const).map((type) => (
                    <label key={type} className="mr-4 inline-flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={row.accountTypes.includes(type)}
                        onChange={(e) =>
                          patchRow({
                            accountTypes: e.target.checked
                              ? [...row.accountTypes, type]
                              : row.accountTypes.filter((t) => t !== type),
                          })
                        }
                      />
                      {type}
                    </label>
                  ))}
                </fieldset>
                <Label htmlFor="row-sign">Balance convention</Label>
                <select
                  id="row-sign"
                  className={select}
                  value={row.sign}
                  onChange={(e) => patchRow({ sign: e.target.value as CustomRow["sign"] })}
                >
                  <option value="natural">Account's normal side</option>
                  <option value="debit">Debit minus credit</option>
                  <option value="credit">Credit minus debit</option>
                </select>
              </>
            )}
            {row.kind === "formula" && (
              <div className="space-y-2">
                <Label htmlFor="row-formula">Formula</Label>
                <Input
                  id="row-formula"
                  className="font-mono"
                  value={row.formula}
                  maxLength={1000}
                  placeholder="[revenue] - [expenses]"
                  onChange={(e) => patchRow({ formula: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Use [row_id], numbers in the report currency, + − × / and parentheses. For a
                  percentage, divide the amounts and choose Percent below. A zero denominator is
                  shown as Unavailable, without replacing it with a zero value.
                </p>
              </div>
            )}
            {row.kind === "group" && (
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.collapsed}
                  onChange={(e) => patchRow({ collapsed: e.target.checked })}
                />
                Collapse group details in output
              </label>
            )}
            {row.kind === "group" && (
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Rows included in this subtotal</legend>
                {d.rows
                  .filter((r) => r.id !== row.id && r.kind !== "heading")
                  .map((r) => (
                    <label key={r.id} className="flex gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={row.children.includes(r.id)}
                        onChange={(e) =>
                          patchRow({
                            children: e.target.checked
                              ? [...row.children, r.id]
                              : row.children.filter((id) => id !== r.id),
                          })
                        }
                      />
                      {r.label} [{r.id}]
                    </label>
                  ))}
              </fieldset>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="row-format">Number format</Label>
                <select
                  id="row-format"
                  className={`${select} w-full`}
                  value={row.format}
                  onChange={(e) => patchRow({ format: e.target.value as CustomRow["format"] })}
                >
                  <option value="money">Currency</option>
                  <option value="number">Number</option>
                  <option value="percent">Percent</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="row-decimals">Decimals</Label>
                <Input
                  id="row-decimals"
                  type="number"
                  min={0}
                  max={6}
                  value={row.decimals}
                  onChange={(e) =>
                    patchRow({ decimals: Math.min(6, Math.max(0, Number(e.target.value))) })
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="row-indent">Indentation</Label>
                <Input
                  id="row-indent"
                  type="number"
                  min={0}
                  max={6}
                  value={row.indent}
                  onChange={(e) =>
                    patchRow({ indent: Math.min(6, Math.max(0, Number(e.target.value))) })
                  }
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={row.hidden}
                  onChange={(e) => patchRow({ hidden: e.target.checked })}
                />
                Hide in output
              </label>
              <Label htmlFor="row-negative">Negative values</Label>
              <select
                id="row-negative"
                className={select}
                value={row.negative}
                onChange={(e) => patchRow({ negative: e.target.value as CustomRow["negative"] })}
              >
                <option value="parentheses">Parentheses</option>
                <option value="minus">Minus sign</option>
              </select>
            </div>
          </section>
        )}
      </div>
      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="font-semibold">Display settings</h3>
        <p className="text-xs text-muted-foreground">
          Display scaling, hiding and sorting preserve the underlying balances and formula results.
          Percentages are not divided by the monetary scale.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1 text-sm">
            Divide monetary / number figures by
            <select
              aria-label="Display scale"
              className={`${select} w-full`}
              value={d.display.scale}
              onChange={(e) =>
                onChange({
                  ...d,
                  display: { ...d.display, scale: e.target.value as typeof d.display.scale },
                })
              }
            >
              <option value="1">1</option>
              <option value="100">100</option>
              <option value="1000">1,000</option>
              <option value="1000000">1,000,000</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Zero values
            <select
              aria-label="Zero value display"
              className={`${select} w-full`}
              value={d.display.zero}
              onChange={(e) =>
                onChange({
                  ...d,
                  display: { ...d.display, zero: e.target.value as typeof d.display.zero },
                })
              }
            >
              <option value="zero">Zero</option>
              <option value="dash">Dash</option>
              <option value="blank">Blank</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Show rows
            <select
              aria-label="Row balance visibility"
              className={`${select} w-full`}
              value={d.display.rows}
              onChange={(e) =>
                onChange({
                  ...d,
                  display: { ...d.display, rows: e.target.value as typeof d.display.rows },
                })
              }
            >
              <option value="all">All configured rows</option>
              <option value="non_zero">Non-zero rows</option>
              <option value="zero">Zero-balance rows</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Show columns
            <select
              aria-label="Column balance visibility"
              className={`${select} w-full`}
              value={d.display.columns}
              onChange={(e) =>
                onChange({
                  ...d,
                  display: { ...d.display, columns: e.target.value as typeof d.display.columns },
                })
              }
            >
              <option value="all">All configured columns</option>
              <option value="non_zero">Non-zero columns</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Row order
            <select
              aria-label="Output row order"
              className={`${select} w-full`}
              value={d.display.sort}
              onChange={(e) =>
                onChange({
                  ...d,
                  display: { ...d.display, sort: e.target.value as typeof d.display.sort },
                })
              }
            >
              <option value="custom">Custom order</option>
              <option value="label_asc">Label A–Z</option>
              <option value="label_desc">Label Z–A</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-4">
          {(
            [
              ["thousands", "Thousands separators"],
              ["negativeRed", "Negative values in red"],
              ["currencySymbol", "Currency symbols"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex gap-2 text-sm">
              <input
                type="checkbox"
                checked={d.display[key]}
                onChange={(e) =>
                  onChange({ ...d, display: { ...d.display, [key]: e.target.checked } })
                }
              />
              {label}
            </label>
          ))}
        </div>
      </section>
      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex justify-between">
          <h3 className="font-semibold">Report columns</h3>
          <Button
            size="sm"
            variant="outline"
            disabled={d.columns.length >= 24}
            onClick={() =>
              onChange({
                ...d,
                columns: [
                  ...d.columns,
                  customColumnSchema.parse({
                    id: `col_${crypto.randomUUID().slice(0, 8)}`,
                    label: "New column",
                    mode: "prior_period",
                    monthOffset: 0,
                    hidden: false,
                  }),
                ],
              })
            }
          >
            Add column
          </Button>
        </div>
        <div className="space-y-3">
          {d.columns.map((c, i) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 rounded border p-3">
              <Input
                aria-label={`Column ${i + 1} label`}
                className="w-44"
                value={c.label}
                onChange={(e) =>
                  onChange({
                    ...d,
                    columns: d.columns.map((v, j) =>
                      j === i ? { ...v, label: e.target.value } : v,
                    ),
                  })
                }
              />
              <select
                className={select}
                aria-label={`Column ${i + 1} period`}
                value={c.mode}
                onChange={(e) =>
                  onChange({
                    ...d,
                    columns: d.columns.map((v, j) =>
                      j === i ? { ...v, mode: e.target.value as typeof c.mode } : v,
                    ),
                  })
                }
              >
                <option value="period">Selected period</option>
                <option value="prior_period">Prior period</option>
                <option value="prior_year">Prior year</option>
                <option value="month">Month offset</option>
                <option value="fixed">Fixed dates</option>
                <option value="calculated">Calculated column</option>
              </select>
              <span className="font-mono text-xs text-muted-foreground">[{c.id}]</span>
              <select
                className={select}
                aria-label={`Column ${i + 1} format`}
                value={c.format}
                onChange={(e) =>
                  onChange({
                    ...d,
                    columns: d.columns.map((v, j) =>
                      j === i ? { ...v, format: e.target.value as typeof c.format } : v,
                    ),
                  })
                }
              >
                <option value="inherit">Row format</option>
                <option value="money">Currency</option>
                <option value="number">Number</option>
                <option value="percent">Percentage</option>
              </select>
              {c.mode === "calculated" && (
                <div className="w-full space-y-1">
                  <Input
                    aria-label={`Column ${i + 1} formula`}
                    value={c.formula}
                    maxLength={1000}
                    placeholder="[current] - [prior]"
                    className="font-mono"
                    onChange={(e) =>
                      onChange({
                        ...d,
                        columns: d.columns.map((v, j) =>
                          j === i ? { ...v, formula: e.target.value } : v,
                        ),
                      })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Use column identifiers in brackets. For variance percentage, divide the
                    difference by the comparison column and select Percentage. Undefined division is
                    reported explicitly.
                  </p>
                </div>
              )}
              {c.mode === "month" && (
                <Input
                  aria-label={`Column ${i + 1} month offset`}
                  className="w-24"
                  type="number"
                  min={-120}
                  max={120}
                  value={c.monthOffset}
                  onChange={(e) =>
                    onChange({
                      ...d,
                      columns: d.columns.map((v, j) =>
                        j === i ? { ...v, monthOffset: Number(e.target.value) } : v,
                      ),
                    })
                  }
                />
              )}{" "}
              {c.mode === "fixed" && (
                <>
                  <Input
                    aria-label={`Column ${i + 1} from`}
                    className="w-40"
                    type="date"
                    value={c.from ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...d,
                        columns: d.columns.map((v, j) =>
                          j === i ? { ...v, from: e.target.value } : v,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label={`Column ${i + 1} to`}
                    className="w-40"
                    type="date"
                    value={c.to ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...d,
                        columns: d.columns.map((v, j) =>
                          j === i ? { ...v, to: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </>
              )}
              <label className="flex gap-1 text-sm">
                <input
                  type="checkbox"
                  checked={c.hidden}
                  onChange={(e) =>
                    onChange({
                      ...d,
                      columns: d.columns.map((v, j) =>
                        j === i ? { ...v, hidden: e.target.checked } : v,
                      ),
                    })
                  }
                />
                Hidden
              </label>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Move column ${i + 1} left`}
                disabled={i === 0}
                onClick={() => onChange({ ...d, columns: move(d.columns, i, -1) })}
              >
                ←
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Move column ${i + 1} right`}
                disabled={i === d.columns.length - 1}
                onClick={() => onChange({ ...d, columns: move(d.columns, i, 1) })}
              >
                →
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={d.columns.length === 1}
                aria-label={`Remove column ${i + 1}`}
                onClick={() => onChange({ ...d, columns: d.columns.filter((_, j) => j !== i) })}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="builder-header">Report header / firm name</Label>
          <Input
            id="builder-header"
            maxLength={300}
            value={d.header}
            onChange={(e) => onChange({ ...d, header: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="builder-footer">Footer</Label>
          <Input
            id="builder-footer"
            maxLength={300}
            value={d.footer}
            onChange={(e) => onChange({ ...d, footer: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="builder-notes">Report notes</Label>
        <Textarea
          id="builder-notes"
          maxLength={4000}
          value={d.notes}
          onChange={(e) => onChange({ ...d, notes: e.target.value })}
        />
      </div>
      <label className="flex items-center gap-2 text-sm">
        Page orientation
        <select
          className={select}
          value={d.orientation}
          onChange={(e) => onChange({ ...d, orientation: e.target.value as typeof d.orientation })}
        >
          <option value="portrait">Portrait</option>
          <option value="landscape">Landscape</option>
        </select>
      </label>
    </div>
  );
}

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { LookupSelect } from "@/components/lookup/LookupSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  standardSettingsSchema,
  encodeStandardSettings,
  type StandardSettings,
} from "@/lib/reports/standard-settings";
import { ReportFilterEditor } from "./ReportFilterEditor";
import type { ReportAccount } from "@/lib/reports/custom-definition";
const comparisons = [
  { id: "none", label: "No comparison" },
  { id: "prior_period", label: "Previous period" },
  { id: "prior_year", label: "Previous year" },
  { id: "ytd", label: "Financial year to date" },
  { id: "prior_ytd", label: "Previous financial year to date" },
  { id: "custom", label: "Custom comparison period" },
];
function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <LookupSelect
        ariaLabel={label}
        value={value}
        onChange={onChange}
        allowClear={false}
        options={options.map(([id, label]) => ({ id, label }))}
      />
    </div>
  );
}
export function StandardReportControls({
  settings,
  onApply,
  report,
  accounts,
  filterOptions,
  filterError,
  loadingFilters,
  onOpen,
  onRetryFilters,
}: {
  settings: StandardSettings;
  onApply: (value: StandardSettings) => void;
  report: "profit-and-loss" | "balance-sheet";
  accounts: ReportAccount[];
  filterOptions: { currencies: string[]; sources: string[] };
  filterError?: string;
  loadingFilters?: boolean;
  onOpen?: () => void;
  onRetryFilters?: () => void;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState(settings),
    [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("comparisons");
  const openEditor = (tab: string, value = settings) => {
    setDraft(value);
    setError("");
    setActiveTab(tab);
    setOpen(true);
    onOpen?.();
  };
  const apply = (value: StandardSettings) => {
    try {
      encodeStandardSettings(value);
      onApply(value);
      return true;
    } catch (error) {
      setDraft(value);
      setError(error instanceof Error ? error.message : "Could not apply settings");
      setOpen(true);
      return false;
    }
  };
  const patch = (values: Partial<StandardSettings>) =>
    setDraft((current) => ({ ...current, ...values }));
  const check = (key: keyof StandardSettings, label: string) => (
    <Label className="flex items-center gap-2 font-normal">
      <input
        type="checkbox"
        checked={Boolean(draft[key])}
        onChange={(e) => patch({ [key]: e.target.checked })}
      />
      {label}
    </Label>
  );
  return (
    <>
      <div className="space-y-1">
        <Label>Display columns</Label>
        <LookupSelect
          ariaLabel="Display statement columns"
          value={settings.group}
          onChange={(group) => apply({ ...settings, group: group as StandardSettings["group"] })}
          allowClear={false}
          options={[
            { id: "total", label: "Selected period total" },
            { id: "month", label: "Months" },
            { id: "quarter", label: "Calendar quarters" },
            { id: "year", label: "Calendar years" },
          ]}
        />
      </div>
      <div className="space-y-1">
        <Label>Compare with</Label>
        <LookupSelect
          ariaLabel="Compare statement with"
          value={settings.compare}
          allowClear={false}
          options={comparisons
            .filter((c) => report === "profit-and-loss" || !["ytd", "prior_ytd"].includes(c.id))
            .map((c) => ({
              ...c,
              label:
                c.id === "prior_period" && report === "balance-sheet"
                  ? "Previous month end"
                  : c.label,
            }))}
          onChange={(value) => {
            if (value === "custom") openEditor("comparisons", { ...settings, compare: "custom" });
            else
              apply({
                ...settings,
                compare: value as StandardSettings["compare"],
                ...(value === "none" ? { changeAmount: false, changePercent: false } : {}),
              });
          }}
        />
      </div>
      {report === "profit-and-loss" && (
        <Button variant="outline" size="sm" onClick={() => openEditor("filters")}>
          Filters{settings.filters.clauses.length ? ` · ${settings.filters.clauses.length}` : ""}
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={() => openEditor("comparisons")}>
        <SlidersHorizontal className="mr-1 size-4" aria-hidden="true" />
        Customize report
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Customize {report === "profit-and-loss" ? "Profit and Loss" : "Balance Sheet"}
            </DialogTitle>
            <DialogDescription>
              Set comparisons, layout and presentation. Apply changes together, then save this view
              to reuse them.
            </DialogDescription>
          </DialogHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <div className="overflow-x-auto">
              <TabsList aria-label="Report customization sections" className="w-max">
                <TabsTrigger value="comparisons">Comparisons</TabsTrigger>
                <TabsTrigger value="layout">Rows & numbers</TabsTrigger>
                {report === "profit-and-loss" && <TabsTrigger value="filters">Filters</TabsTrigger>}
                <TabsTrigger value="notes">Header, footer & visual</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="comparisons" className="space-y-4">
              <div className="space-y-1">
                <Label>Compare selected period with</Label>
                <LookupSelect
                  ariaLabel="Compare selected period with"
                  value={draft.compare}
                  allowClear={false}
                  options={comparisons
                    .filter(
                      (c) => report === "profit-and-loss" || !["ytd", "prior_ytd"].includes(c.id),
                    )
                    .map((c) => ({
                      ...c,
                      label:
                        c.id === "prior_period" && report === "balance-sheet"
                          ? "Previous month end"
                          : c.label,
                    }))}
                  onChange={(compare) =>
                    patch({
                      compare: compare as StandardSettings["compare"],
                      ...(compare === "none" ? { changeAmount: false, changePercent: false } : {}),
                      ...(compare !== "custom"
                        ? { compareFrom: undefined, compareTo: undefined }
                        : {}),
                    })
                  }
                />
              </div>
              {draft.compare === "custom" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {report === "profit-and-loss" && (
                    <div>
                      <Label htmlFor="comparison-from">Comparison from</Label>
                      <Input
                        id="comparison-from"
                        type="date"
                        value={draft.compareFrom ?? ""}
                        onChange={(e) => patch({ compareFrom: e.target.value })}
                      />
                    </div>
                  )}
                  <div>
                    <Label htmlFor="comparison-to">
                      {report === "balance-sheet" ? "Comparison date" : "Comparison to"}
                    </Label>
                    <Input
                      id="comparison-to"
                      type="date"
                      value={draft.compareTo ?? ""}
                      onChange={(e) =>
                        patch({
                          compareTo: e.target.value,
                          ...(report === "balance-sheet" ? { compareFrom: e.target.value } : {}),
                        })
                      }
                    />
                  </div>
                </div>
              )}
              {draft.compare !== "none" && (
                <div className="space-y-3">
                  {check("changeAmount", "Show change in amount")}
                  {check("changePercent", "Show percentage change")}
                  <p className="text-xs text-muted-foreground">
                    Changes compare the complete selected period with the comparison. Percentage
                    change uses the absolute comparison amount; a zero denominator is shown as
                    unavailable.
                  </p>
                </div>
              )}
              <Label className="flex items-center gap-2 font-normal">
                <input
                  type="checkbox"
                  checked={draft.incomePercent}
                  onChange={(e) =>
                    patch({
                      incomePercent: e.target.checked,
                      percentBasis: report === "balance-sheet" ? "assets" : draft.percentBasis,
                    })
                  }
                />
                Show percentage columns
              </Label>
              {draft.incomePercent && (
                <Choice
                  label="Percentage denominator"
                  value={draft.percentBasis}
                  onChange={(v) => patch({ percentBasis: v as StandardSettings["percentBasis"] })}
                  options={
                    report === "profit-and-loss"
                      ? [
                          ["income", "Trading income"],
                          ["expense", "Total expenses"],
                          ["row", "Selected-period row amount"],
                        ]
                      : [
                          ["assets", "Total assets"],
                          ["row", "Selected-period row amount"],
                        ]
                  }
                />
              )}
              {report === "profit-and-loss" &&
                draft.group !== "total" &&
                check("showTotal", "Show selected period total")}
            </TabsContent>
            <TabsContent value="layout" className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Choice
                  label="Report detail"
                  value={draft.detail}
                  onChange={(v) => patch({ detail: v as StandardSettings["detail"] })}
                  options={[
                    ["accounts", "Account details"],
                    ["summary", "Section totals only"],
                  ]}
                />
                <Choice
                  label="Decimal places"
                  value={draft.decimals}
                  onChange={(v) => patch({ decimals: v as StandardSettings["decimals"] })}
                  options={[
                    ["currency", "Currency precision"],
                    ["0", "Whole numbers"],
                    ["2", "Two decimal places"],
                    ["3", "Three decimal places"],
                  ]}
                />
                <Choice
                  label="Number scale"
                  value={draft.scale}
                  onChange={(v) => patch({ scale: v as StandardSettings["scale"] })}
                  options={[
                    ["1", "Full amounts"],
                    ["1000", "Thousands"],
                    ["1000000", "Millions"],
                  ]}
                />
                <Choice
                  label="Negative amounts"
                  value={draft.negative}
                  onChange={(v) => patch({ negative: v as StandardSettings["negative"] })}
                  options={[
                    ["parentheses", "Parentheses"],
                    ["minus", "Minus sign"],
                  ]}
                />
                <Choice
                  label="Zero amounts"
                  value={draft.zero}
                  onChange={(v) => patch({ zero: v as StandardSettings["zero"] })}
                  options={[
                    ["zero", "Show zero"],
                    ["dash", "Show dash"],
                    ["blank", "Leave blank"],
                  ]}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {check("includeZero", "Include zero-balance accounts")}
                {check("accountCodes", "Show account codes")}
                {check("negativeRed", "Show negative amounts in red")}
                {check("currencySymbol", "Show currency with amounts")}
                {check("compact", "Compact rows")}
                {check("showBasis", "Show accounting basis")}
                {check("showCurrencyNote", "Show currency conversion note")}
              </div>
              <p className="text-xs text-muted-foreground">
                Unused active posting accounts can be included. With filters, only matching activity
                is included. Inactive accounts with actual balances remain reportable.
              </p>
            </TabsContent>
            {report === "profit-and-loss" && (
              <TabsContent value="filters" className="space-y-3">
                {filterError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {filterError}
                  </p>
                ) : loadingFilters ? (
                  <p role="status">Loading company filter choices…</p>
                ) : (
                  <ReportFilterEditor
                    value={draft.filters}
                    onChange={(filters) => patch({ filters })}
                    accounts={accounts}
                    filterOptions={filterOptions}
                  />
                )}
              </TabsContent>
            )}
            <TabsContent value="notes" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice
                  label="Header layout"
                  value={draft.headerOrder}
                  onChange={(value) => patch({ headerOrder: value as StandardSettings["headerOrder"] })}
                  options={[["company-first", "Company name first"], ["title-first", "Report title first"]]}
                />
                <Choice
                  label="Header alignment"
                  value={draft.headerAlignment}
                  onChange={(value) => patch({ headerAlignment: value as StandardSettings["headerAlignment"] })}
                  options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]}
                />
                <Choice
                  label="Footer alignment"
                  value={draft.footerAlignment}
                  onChange={(value) => patch({ footerAlignment: value as StandardSettings["footerAlignment"] })}
                  options={[["left", "Left"], ["center", "Center"], ["right", "Right"]]}
                />
                <Choice
                  label="Report gridlines"
                  value={draft.reportBorders}
                  onChange={(value) => patch({ reportBorders: value as StandardSettings["reportBorders"] })}
                  options={[["default", "Standard"], ["all", "All cells"], ["none", "None"]]}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {check("showCompanyName", "Show company name")}
                {check("showReportTitle", "Show report title")}
                {check("showReportPeriod", "Show report period")}
                {check("showDatePrepared", "Show date prepared")}
                {check("showTimePrepared", "Show time prepared")}
                {check("bandedRows", "Banded data rows")}
              </div>
              {(
                [
                  ["header", "Report header"],
                  ["subtitle", "Subtitle"],
                  ["footer", "Report footer"],
                ] as const
              ).map(([key, label]) => (
                <div key={key}>
                  <Label htmlFor={`statement-${key}`}>{label}</Label>
                  <Input
                    id={`statement-${key}`}
                    value={draft[key]}
                    maxLength={300}
                    onChange={(e) => patch({ [key]: e.target.value })}
                  />
                </div>
              ))}
              <Label htmlFor="statement-notes">Report notes</Label>
              <Textarea
                id="statement-notes"
                maxLength={4000}
                value={draft.notes}
                onChange={(e) => patch({ notes: e.target.value })}
              />
            </TabsContent>
          </Tabs>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(standardSettingsSchema.parse({}));
                setError("");
              }}
            >
              Reset settings
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const parsed = standardSettingsSchema.safeParse(draft);
                if (!parsed.success) {
                  setError(parsed.error.issues.map((i) => i.message).join(". "));
                  return;
                }
                if (apply(parsed.data)) setOpen(false);
              }}
            >
              Apply report settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { Label } from "@/components/ui/label";

export function StatementBasisSelect({
  basis,
  report,
  onChange,
}: {
  basis: "accrual" | "cash";
  report: "profit-and-loss" | "balance-sheet";
  onChange: (basis: "accrual" | "cash") => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor="statement-accounting-method">Accounting method</Label>
      <select
        id="statement-accounting-method"
        className="flex h-9 rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        value={basis}
        onChange={(event) => onChange(event.target.value as "accrual" | "cash")}
        aria-describedby="statement-cash-note"
      >
        <option value="accrual">Accrual</option>
        {report === "profit-and-loss" && <option value="cash">Cash</option>}
      </select>
      <p id="statement-cash-note" className="max-w-56 text-xs text-muted-foreground">
        {report === "profit-and-loss"
          ? "Cash recognizes allocated receipts, payments and direct cash transactions on their cash dates."
          : "Balance Sheet remains on accrual basis."}
      </p>
    </div>
  );
}

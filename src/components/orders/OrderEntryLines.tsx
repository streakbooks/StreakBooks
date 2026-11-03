import { AccountLookup } from "@/components/lookup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyOrderLine, type PurchaseOrderLineForm } from "@/lib/purchases/purchase-order";
export function OrderEntryLines({
  lines,
  onChange,
  accounts,
  companyId,
  currency,
}: {
  lines: PurchaseOrderLineForm[];
  onChange: (lines: PurchaseOrderLineForm[]) => void;
  accounts: Array<{ id: string; code: string; name: string }>;
  companyId: string;
  currency: string;
}) {
  const update = (index: number, patch: Partial<PurchaseOrderLineForm>) =>
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  return (
    <div className="space-y-3">
      {lines.map((line, index) => (
        <section
          className="rounded-md border p-4"
          key={index}
          aria-label={`Order line ${index + 1}`}
        >
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-medium">Line {index + 1}</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={lines.length === 1}
              onClick={() => onChange(lines.filter((_, i) => i !== index))}
            >
              Remove line {index + 1}
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor={`order-description-${index}`}>Description</Label>
              <Input
                id={`order-description-${index}`}
                value={line.description}
                maxLength={2000}
                onChange={(e) => update(index, { description: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Account</Label>
              <AccountLookup
                ariaLabel={`Line ${index + 1} account`}
                companyId={companyId}
                accounts={accounts}
                value={line.accountId}
                onChange={(accountId) => update(index, { accountId })}
                allowClear={false}
              />
            </div>
            {(
              [
                ["quantity", "Quantity"],
                ["unitPrice", `Unit price (${currency})`],
                ["discount", `Line discount (${currency})`],
                ["taxPercent", "Tax (%)"],
              ] as const
            ).map(([field, label]) => (
              <div key={field} className="space-y-2">
                <Label htmlFor={`order-${field}-${index}`}>{label}</Label>
                <Input
                  id={`order-${field}-${index}`}
                  inputMode="decimal"
                  value={line[field]}
                  onChange={(e) => update(index, { [field]: e.target.value })}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={lines.length >= 200}
        onClick={() => onChange([...lines, emptyOrderLine()])}
      >
        Add line
      </Button>
    </div>
  );
}

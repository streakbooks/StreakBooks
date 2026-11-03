import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type ReportAccountOption = {
  id: string;
  code: string;
  name: string;
  account_type?: string;
  is_active?: boolean;
};

const MAX_SELECTED = 100;
const types: Record<string, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  income: "Income",
  expense: "Expenses",
};

/**
 * Reporting-only selector: selecting an account never offers account creation or
 * disables non-postable parent/control accounts. This is not a posting lookup.
 * Undefined selection means ALL accounts; an explicit list means exactly those IDs.
 */
export function ReportAccountMultiSelect({
  accounts,
  selected,
  onChange,
  label = "Accounts",
  disabled = false,
}: {
  accounts: ReportAccountOption[];
  selected?: string[] | undefined;
  onChange: (ids: string[] | undefined) => void;
  label?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");
  const chosen = useMemo(() => new Set(selected ?? []), [selected]);
  const available = useMemo(
    () =>
      accounts
        .filter((a) => showArchived || a.is_active !== false || chosen.has(a.id))
        .filter((a) =>
          `${a.code} ${a.name} ${a.account_type ?? ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
        )
        .sort((a, b) => a.code.localeCompare(b.code)),
    [accounts, chosen, search, showArchived],
  );
  const grouped = useMemo(() => {
    const map = new Map<string, ReportAccountOption[]>();
    for (const account of available) {
      const label = types[account.account_type ?? ""] ?? "Other accounts";
      map.set(label, [...(map.get(label) ?? []), account]);
    }
    return [...map.entries()];
  }, [available]);
  const update = (next: string[] | undefined) => {
    // Clearing the final checkbox restores the explicit All accounts mode.
    if (next && next.length === 0) next = undefined;
    if (next && next.length > MAX_SELECTED) {
      setError(`Choose up to ${MAX_SELECTED} accounts, or select All accounts.`);
      return;
    }
    setError("");
    onChange(next);
  };
  const toggle = (id: string) => {
    if (chosen.has(id)) update((selected ?? []).filter((item) => item !== id));
    else update([...(selected ?? []), id]);
  };
  const activeCount = selected?.length ?? 0;
  const title =
    selected === undefined
      ? "All accounts"
      : `${activeCount} account${activeCount === 1 ? "" : "s"} selected`;

  return (
    <div className="min-w-48 space-y-1">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            aria-label={`Choose ${label.toLowerCase()}`}
            aria-expanded={open}
            className="h-10 w-full min-w-48 max-w-72 justify-between font-normal"
          >
            <span className="truncate">{title}</span>
            <ChevronDown className="ml-2 size-4 shrink-0 opacity-60" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0 sm:w-96">
          <div className="border-b p-3">
            <p className="mb-2 text-sm font-semibold">Choose reporting accounts</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search account code or name"
                aria-label="Search reporting accounts"
                className="pl-8"
              />
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => update(undefined)}>
                {selected === undefined && <Check className="mr-1 size-3" />}
                All accounts
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={available.length === 0}
                onClick={() => update(available.map((a) => a.id))}
              >
                Select matches
              </Button>
            </div>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs">
              <Checkbox
                checked={showArchived}
                onCheckedChange={(value) => setShowArchived(value === true)}
              />
              Show archived accounts
            </label>
          </div>
          <div
            role="group"
            aria-label="Reporting account selection"
            className="max-h-72 overflow-y-auto p-2"
          >
            {grouped.length === 0 && (
              <p className="px-2 py-5 text-center text-sm text-muted-foreground">
                No matching accounts
              </p>
            )}
            {grouped.map(([type, rows]) => (
              <div key={type} className="mb-2">
                <p className="px-2 py-1 text-xs font-semibold text-muted-foreground">{type}</p>
                {rows.map((account) => (
                  <label
                    key={account.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-sm hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={chosen.has(account.id)}
                      onCheckedChange={() => toggle(account.id)}
                      aria-label={`Include ${account.code} ${account.name}`}
                    />
                    <span
                      className="min-w-0 flex-1 truncate"
                      title={`${account.code} — ${account.name}`}
                    >
                      <span className="font-mono text-xs">{account.code}</span> — {account.name}
                    </span>
                    {account.is_active === false && (
                      <span className="text-xs text-muted-foreground">Archived</span>
                    )}
                  </label>
                ))}
              </div>
            ))}
          </div>
          {error && (
            <p role="alert" className="px-3 pb-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex items-center justify-between border-t px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {selected === undefined ? "All accounts included" : `${activeCount} chosen`}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
              Done <X className="ml-1 size-3" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

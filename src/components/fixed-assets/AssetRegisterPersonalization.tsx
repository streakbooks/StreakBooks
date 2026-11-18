import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useEffect, useState } from "react";
import { Columns3, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  parseSavedAssetFilterViews,
  removeAssetFilterView,
  saveAssetFilterView,
  type SavedAssetFilterView,
} from "@/lib/fixed-assets/saved-filter-views";
import type { AssetRegisterFilters } from "@/lib/fixed-assets/register-view";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Density } from "@/lib/table-prefs";

export const FIXED_ASSET_TABLE_COLUMNS = [
  { id: "asset", label: "Asset identity", required: true },
  { id: "status", label: "Asset status" },
  { id: "purchased", label: "Purchase date" },
  { id: "method", label: "Depreciation method" },
  { id: "type", label: "Asset type" },
  { id: "account", label: "Cost GL account" },
  { id: "cost", label: "Original cost" },
  { id: "residual", label: "Residual value" },
  { id: "accumulated", label: "Accumulated depreciation" },
  { id: "bookValue", label: "Net book value" },
  { id: "depreciatedTo", label: "Depreciated through" },
  { id: "actions", label: "Available actions", required: true },
] as const;

export const FIXED_ASSET_COLUMN_IDS = FIXED_ASSET_TABLE_COLUMNS.map((column) => column.id);

/** Reuses the shared table-preferences hook; only the desktop table is configurable. */
export function FixedAssetTableColumns({
  visible,
  hiddenCount,
  density,
  toggle,
  setDensity,
  reset,
}: {
  visible: (id: string) => boolean;
  hiddenCount: number;
  density: Density;
  toggle: (id: string) => void;
  setDensity: (density: Density) => void;
  reset: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" aria-label="Configure fixed asset register columns">
          <Columns3 className="mr-2 size-4" />
          Columns{hiddenCount ? " (" + hiddenCount + " hidden)" : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Register columns</h3>
          <p className="text-xs text-muted-foreground">
            Choose desktop table columns. Asset identity and actions remain visible.
          </p>
        </div>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {FIXED_ASSET_TABLE_COLUMNS.map((column) => (
            <label
              key={column.id}
              className="flex cursor-pointer items-center gap-3 rounded-md px-1 py-1 text-sm"
            >
              <Checkbox
                checked={"required" in column && column.required ? true : visible(column.id)}
                disabled={"required" in column && column.required}
                onCheckedChange={(value) => {
                  if (typeof value === "boolean" && !("required" in column && column.required)) {
                    if (value !== visible(column.id)) toggle(column.id);
                  }
                }}
                aria-label={"Show " + column.label + " column"}
              />
              <span>{column.label}</span>
            </label>
          ))}
        </div>
        <div className="space-y-1 border-t pt-3">
          <Label htmlFor="fixed-asset-table-density">Row density</Label>
          <select
            id="fixed-asset-table-density"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={density}
            onChange={(event) => setDensity(event.target.value as Density)}
          >
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </div>
        <Button size="sm" variant="outline" onClick={reset} className="w-full">
          Reset table layout
        </Button>
        <p className="text-xs text-muted-foreground">
          Table layout is saved in this browser for the current organisation.
        </p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Browser-only per-user/per-organisation filter presets.
 * No raw company data is uploaded or used for authorisation.
 */
export function FixedAssetSavedFilterViews({
  companyId,
  filters,
  onApply,
}: {
  companyId: string;
  filters: AssetRegisterFilters;
  onApply: (filters: AssetRegisterFilters) => void;
}) {
  const [views, setViews] = useState<SavedAssetFilterView[]>([]);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState("");
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setViews([]);
    setSelected("");
    setName("");
    setStorageKey(null);
    setStorageError(null);
    setLoading(true);
    void supabase.auth
      .getUser()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data.user?.id) {
          setStorageError("Your session could not be verified for saved views.");
          setLoading(false);
          return;
        }
        const key = "linkbooks-fixed-assets-views:v1:" + data.user.id + ":" + companyId;
        try {
          setViews(parseSavedAssetFilterViews(window.localStorage.getItem(key)));
          setStorageKey(key);
        } catch {
          setStorageError("Browser storage is unavailable. Saved views are disabled.");
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setStorageError("Saved views are unavailable until your session is restored.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const persist = (updated: SavedAssetFilterView[]) => {
    if (!storageKey) return false;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(updated));
      setViews(updated);
      setStorageError(null);
      return true;
    } catch {
      setStorageError("Cannot write to browser storage. Check your privacy settings.");
      return false;
    }
  };
  const save = () => {
    if (!storageKey || loading) return;
    try {
      const existing = views.find((view) => view.name.toLowerCase() === name.trim().toLowerCase());
      if (existing && !window.confirm("Replace saved view '" + existing.name + "'?")) return;
      const updated = saveAssetFilterView(views, name, filters);
      if (persist(updated)) {
        setSelected(name.trim());
        setName("");
        toast.success(existing ? "Saved view updated" : "Filter view saved to this browser");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save this filter view");
    }
  };
  const chosen = views.find((view) => view.name === selected);
  return (
    <div
      className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
      aria-label="Saved fixed asset filter views"
    >
      <Input
        aria-label="Name current fixed asset filters"
        className="min-w-32 flex-1 sm:max-w-48"
        placeholder="Name this view"
        value={name}
        maxLength={48}
        disabled={!storageKey || loading}
        onChange={(event) => setName(event.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={!storageKey || loading || !name.trim()}
        onClick={save}
        title="Save current filters and sorting on this device"
      >
        <Save className="mr-2 size-4" /> Save view
      </Button>
      <RecordLookupSelect
        className="h-9 min-w-36 max-w-full rounded-md border bg-background px-3 text-sm"
        aria-label="Select a saved fixed assets filter view"
        value={selected}
        disabled={!storageKey || loading || views.length === 0}
        onValueChange={(event) => setSelected(event)}
      >
        <option value="">Saved views ({views.length})</option>
        {views.map((view) => (
          <option key={view.name} value={view.name}>
            {view.name}
          </option>
        ))}
      </RecordLookupSelect>
      <Button
        size="sm"
        variant="outline"
        disabled={!chosen}
        onClick={() => {
          if (chosen) {
            onApply(chosen.filters);
            toast.success("Applied view: " + chosen.name);
          }
        }}
      >
        Apply
      </Button>
      <Button
        size="sm"
        variant="ghost"
        aria-label="Delete selected fixed asset filter view"
        disabled={!chosen}
        onClick={() => {
          if (!chosen || !window.confirm("Delete saved view '" + chosen.name + "'?")) return;
          if (persist(removeAssetFilterView(views, chosen.name))) {
            setSelected("");
            toast.success("Saved view deleted");
          }
        }}
      >
        <Trash2 className="size-4" />
      </Button>
      {storageError ? (
        <span className="w-full text-xs text-destructive" role="status">
          {storageError}
        </span>
      ) : (
        <span className="w-full text-xs text-muted-foreground">
          Saves filters and sorting only, on this browser for your account and organisation. Column
          layout is saved separately.
        </span>
      )}
    </div>
  );
}

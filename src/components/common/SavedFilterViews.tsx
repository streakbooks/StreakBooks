import { useEffect, useState, type FormEvent } from "react";
import { Bookmark, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  MAX_SAVED_VIEWS,
  normaliseViewName,
  parseSavedViews,
  removeSavedView,
  upsertSavedView,
  type SavedWorkspaceView,
  type ViewSchema,
  type ViewSnapshot,
} from "@/lib/workspaces/saved-filter-views";

const STORAGE_PREFIX = "linkbooks.workspace.filter-views.v1:";

function storeViews(key: string, views: SavedWorkspaceView[]): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(views));
    return true;
  } catch {
    toast.error("This browser could not save your views");
    return false;
  }
}

/**
 * Original LinkBooks saved search workspace.
 * The caller owns server-backed filters and permission checks; this control stores
 * only explicitly allowlisted filter settings, scoped by user, company and module.
 */
export function SavedFilterViews({
  scope,
  schema,
  current,
  defaults,
  onApply,
  onReset,
}: {
  scope: string;
  schema: ViewSchema;
  current: ViewSnapshot;
  defaults: ViewSnapshot;
  onApply: (snapshot: ViewSnapshot) => void;
  onReset: () => void;
}) {
  const storageKey = STORAGE_PREFIX + scope;
  const [views, setViews] = useState<SavedWorkspaceView[]>([]);
  const [name, setName] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setViews(parseSavedViews(window.localStorage.getItem(storageKey), schema));
    } catch {
      setViews([]);
    }
    setName("");
    setOpen(false);
  }, [storageKey, schema]);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = normaliseViewName(name);
    if (!label) return;
    const next = upsertSavedView(views, label, current, schema);
    if (!storeViews(storageKey, next)) return;
    setViews(next);
    setName("");
    toast.success("Filter view saved");
  }

  function remove(view: SavedWorkspaceView) {
    const next = removeSavedView(views, view.name);
    if (!storeViews(storageKey, next)) return;
    setViews(next);
    toast.success("Filter view removed");
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 print:hidden"
      role="group"
      aria-label="Saved filter views"
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" variant="outline" aria-label="Saved views">
            <Bookmark className="size-4" aria-hidden />
            Saved views{views.length ? " (" + views.length + ")" : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Your saved filter views</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Save current filters for this company. Views stay on this browser.
            </p>
          </div>
          <form onSubmit={save} className="flex items-center gap-2">
            <Input
              aria-label="New view name"
              placeholder="e.g. Overdue this month"
              value={name}
              maxLength={48}
              onChange={(event) => setName(event.target.value)}
            />
            <Button size="sm" type="submit" disabled={!normaliseViewName(name)}>
              <Save className="size-4" aria-hidden />
              Save
            </Button>
          </form>
          {views.length ? (
            <ul aria-label="Saved views list" className="max-h-60 space-y-1 overflow-y-auto">
              {views.map((view) => (
                <li
                  key={view.name.toLocaleLowerCase()}
                  className="flex items-center gap-1 rounded-md hover:bg-accent"
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 truncate rounded-md px-3 py-2 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => {
                      onApply({ ...defaults, ...view.filters });
                      setOpen(false);
                    }}
                    title={"Apply " + view.name}
                  >
                    {view.name}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => remove(view)}
                    aria-label={"Delete saved view " + view.name}
                    title={"Delete " + view.name}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
              No saved views yet. Choose filters and save your first view.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {views.length} of {MAX_SAVED_VIEWS} saved views. Saving an existing name updates it.
          </p>
        </PopoverContent>
      </Popover>
      <Button variant="ghost" size="sm" onClick={onReset} aria-label="Clear filters">
        <RotateCcw className="size-4" aria-hidden />
        Clear filters
      </Button>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, SlidersHorizontal } from "lucide-react";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useFormat } from "@/hooks/use-format";
import {
  globalSearch,
  type GlobalSearchHit,
  type SearchCategory,
} from "@/lib/search/global-search.functions";
import {
  buildPaletteActions,
  filterPaletteActions,
  type PaletteAction,
} from "@/lib/search/palette-items";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const ENTITY_LABEL: Record<GlobalSearchHit["entity"], string> = {
  contact: "Contacts",
  invoice: "Invoices",
  bill: "Bills",
  account: "Accounts",
  product: "Products & services",
  journal: "Journals",
  bank_transaction: "Bank transactions",
};

/**
 * Ctrl/Cmd+K command palette: jump to pages, reports and create screens, or find records
 * (invoices, bills by supplier invoice number, contacts, accounts, journals). Arrow keys and
 * Enter work through cmdk; the same palette opens from the button on small screens.
 */
export function GlobalSearch({ className }: { className?: string }) {
  const { company } = useActiveCompany();
  const fmt = useFormat();
  const companyId = company?.id;
  const navigate = useNavigate();
  const runSearch = useServerFn(globalSearch);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [category, setCategory] = useState<SearchCategory>("all");
  const [resultLimit, setResultLimit] = useState(12);
  const [showAllFilters, setShowAllFilters] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState({ top: 72, left: 12, width: 520 });
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const rect = anchorRef.current?.getBoundingClientRect();
      const width = Math.min(560, window.innerWidth - 24);
      const left = rect
        ? Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12))
        : 12;
      setPosition({ top: rect ? rect.bottom + 8 : 64, left, width });
    };
    reposition();
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const searchQ = useQuery({
    queryKey: ["global-search", companyId, debounced, category, resultLimit],
    enabled: Boolean(companyId) && (debounced.length >= 2 || /^[0-9]$/.test(debounced)) && open,
    queryFn: () =>
      runSearch({ data: { companyId: companyId!, q: debounced, category, limit: resultLimit } }),
    staleTime: 15_000,
  });

  const allActions = useMemo(() => buildPaletteActions(), []);
  const actions = useMemo(
    () => (category !== "all" || q.trim() === "" ? [] : filterPaletteActions(allActions, q)),
    [allActions, q, category],
  );
  const [isMac, setIsMac] = useState(false);
  useEffect(() => {
    setIsMac(/mac|iphone|ipad/i.test(navigator.platform));
  }, []);
  const shortcut = isMac ? "⌘K" : "Ctrl K";
  const hits = searchQ.data ?? [];

  function close() {
    setOpen(false);
    setQ("");
    setDebounced("");
    setCategory("all");
    setResultLimit(12);
    setShowAllFilters(false);
  }

  function goAction(a: PaletteAction) {
    close();
    void navigate({ to: a.href as never, ...(a.search ? { search: a.search as never } : {}) });
  }

  function goHit(h: GlobalSearchHit) {
    close();
    void navigate({ to: h.href as never, ...(h.search ? { search: h.search as never } : {}) });
  }

  function handleNativeLinkClick(event: React.MouseEvent<HTMLAnchorElement>) {
    // Preserve native modifier-click and middle-click behavior without dismissing search.
    event.stopPropagation();
    if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      close();
    }
  }

  const groups = (["Create", "Go to", "Reports"] as const)
    .map((g) => ({ name: g, items: actions.filter((a) => a.group === g).slice(0, 6) }))
    .filter((g) => g.items.length > 0);
  const hitGroups = (Object.keys(ENTITY_LABEL) as GlobalSearchHit["entity"][])
    .map((e) => ({ entity: e, items: hits.filter((h) => h.entity === e) }))
    .filter((g) => g.items.length > 0);
  const typed = q.trim().length >= 2 || /^[0-9]$/.test(q.trim());
  const canLoadMore = resultLimit < 36 && hitGroups.some((g) => g.items.length >= resultLimit);
  const nothing =
    typed &&
    groups.length === 0 &&
    hitGroups.length === 0 &&
    !searchQ.isFetching &&
    !searchQ.isError;

  return (
    <>
      {/* Desktop: looks like the old search box, opens the palette */}
      <button
        type="button"
        ref={anchorRef}
        onClick={() => setOpen(true)}
        aria-label={`Search (${shortcut})`}
        aria-keyshortcuts="Control+K Meta+K"
        className={cn(
          "hidden h-9 w-full max-w-md items-center gap-2 rounded-md border border-input bg-background px-3 text-left text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent md:flex",
          className,
        )}
      >
        <Search className="size-4" />
        <span className="flex-1 truncate">Search invoices, bills, contacts…</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
          {shortcut}
        </kbd>
      </button>
      {/* Mobile: icon button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Search"
        onClick={() => setOpen(true)}
      >
        <Search className="size-5" aria-hidden />
      </Button>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
        <DialogContent
          className="!translate-x-0 !translate-y-0 overflow-hidden rounded-xl p-0 shadow-2xl data-[state=open]:slide-in-from-top-1"
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            width: position.width,
            maxWidth: "calc(100vw - 24px)",
            maxHeight: `calc(100dvh - ${position.top + 12}px)`,
            transform: "none",
            display: "block",
          }}
        >
          <DialogTitle className="sr-only">Search</DialogTitle>
          <DialogDescription className="sr-only">
            Search records, pages and reports. Use the arrow keys and Enter.
          </DialogDescription>
          <Command shouldFilter={false} label="Search" className="max-h-full">
            <CommandInput
              autoFocus
              value={q}
              onValueChange={(value) => {
                setQ(value);
                setResultLimit(12);
              }}
              placeholder="Search amount, invoice number, contact, reference…"
            />
            <div className="border-b px-3 py-2.5" aria-label="Search category filters">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <SlidersHorizontal className="size-3.5" /> Search within
                </span>
                <button
                  type="button"
                  aria-expanded={showAllFilters}
                  className="text-xs text-primary hover:underline"
                  onClick={() => setShowAllFilters((v) => !v)}
                >
                  {showAllFilters ? "Fewer filters" : "All filters"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["all", "All"],
                    ["invoice", "Invoices"],
                    ["bill", "Bills"],
                    ["contact", "Contacts"],
                    ["account", "Accounts"],
                    ["product", "Products"],
                    ["journal", "Journals"],
                    ["bank_transaction", "Bank transactions"],
                  ] as const
                )
                  .slice(0, showAllFilters ? undefined : 4)
                  .map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={category === id}
                      onClick={() => {
                        setCategory(id);
                        setResultLimit(12);
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary",
                        category === id
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-accent",
                      )}
                    >
                      {label}
                    </button>
                  ))}
              </div>
            </div>
            <CommandList className="max-h-[min(45vh,340px)]">
              {searchQ.isFetching ? (
                <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" /> Searching…
                </div>
              ) : null}
              {searchQ.isError ? (
                <div role="alert" className="px-3 py-2 text-sm text-destructive">
                  {searchQ.error instanceof Error ? searchQ.error.message : "Search failed"}
                </div>
              ) : null}
              {nothing ? <CommandEmpty>No matches in this organisation.</CommandEmpty> : null}
              {groups.map((g) => (
                <CommandGroup key={g.name} heading={g.name}>
                  {g.items.map((a) => (
                    <CommandItem key={a.id} value={a.id} onSelect={() => goAction(a)}>
                      <Link
                        to={a.href as never}
                        {...(a.search ? { search: a.search as never } : {})}
                        onClick={handleNativeLinkClick}
                        className="w-full cursor-pointer"
                      >
                        {a.label}
                      </Link>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {hitGroups.map((g) => (
                <CommandGroup key={g.entity} heading={ENTITY_LABEL[g.entity]}>
                  {g.items.map((h) => (
                    <CommandItem
                      key={`${h.entity}-${h.id}`}
                      value={`${h.entity}-${h.id}`}
                      onSelect={() => goHit(h)}
                      className="flex-col items-start gap-0.5"
                    >
                      <Link
                        to={h.href as never}
                        {...(h.search ? { search: h.search as never } : {})}
                        onClick={handleNativeLinkClick}
                        className="flex w-full flex-col items-start gap-0.5"
                      >
                      <span className="flex w-full justify-between gap-2">
                        <span className="font-medium">{h.title}</span>
                        {h.amount_minor !== undefined && h.currency ? (
                          <span className="tabular-nums text-muted-foreground">
                            {fmt.money(h.amount_minor, h.currency)}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-xs text-muted-foreground">{h.subtitle}</span>
                      </Link>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {canLoadMore ? (
                <div className="border-t px-3 py-2 text-center">
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setResultLimit(36)}
                  >
                    Show more matching records
                  </button>
                </div>
              ) : null}
              {!typed ? (
                <div className="border-t px-3 py-3 text-sm text-muted-foreground">
                  Start typing to search by amount, date, number, name or reference in{" "}
                  {category === "all" ? "all records" : (ENTITY_LABEL[category] ?? "records")}.
                  <span className="mt-1 block text-xs">
                    Select a filter above to narrow results. Press Enter on a result to open it.
                  </span>
                </div>
              ) : null}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

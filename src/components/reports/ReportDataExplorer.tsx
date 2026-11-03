import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Columns3, Layers3, RotateCcw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  prepareReportExplorer,
  selectedExplorerColumns,
  type ExplorerCsv,
} from "@/lib/reports/report-explorer";
import type { ReportCtx } from "./ReportShell";

const selectClass =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function ReportDataExplorer({ ctx, data }: { ctx: ReportCtx; data: ExplorerCsv | null }) {
  const [draftQuery, setDraftQuery] = useState(ctx.search.exploreQuery ?? "");
  const [draftMatch, setDraftMatch] = useState(ctx.search.exploreMatch ?? "");
  const [columnSearch, setColumnSearch] = useState("");
  useEffect(() => setDraftQuery(ctx.search.exploreQuery ?? ""), [ctx.search.exploreQuery]);
  useEffect(() => setDraftMatch(ctx.search.exploreMatch ?? ""), [ctx.search.exploreMatch]);

  if (!data) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          Load this report and choose any required account or budget to explore its available rows.
        </CardContent>
      </Card>
    );
  }

  const selected = selectedExplorerColumns(data.headers, ctx.search.exploreColumns);
  const explorer = prepareReportExplorer(data, {
    columns: ctx.search.exploreColumns,
    query: ctx.search.exploreQuery,
    field: ctx.search.exploreField,
    match: ctx.search.exploreMatch,
    group: ctx.search.exploreGroup,
    sort: ctx.search.exploreSort,
    direction: ctx.search.exploreDirection,
    page: ctx.search.explorePage,
    pageSize: ctx.search.explorePageSize,
  });
  const choose = (indices: number[]) => {
    if (!indices.length) return;
    const all = data.headers.map((_, i) => i);
    ctx.setSearch({
      exploreColumns: indices.join(",") === all.join(",") ? undefined : indices.join(","),
      explorePage: undefined,
    });
  };
  const move = (index: number, offset: number) => {
    const at = selected.indexOf(index);
    if (at < 0 || at + offset < 0 || at + offset >= selected.length) return;
    const next = [...selected];
    const item = next.splice(at, 1)[0];
    if (item === undefined) return;
    next.splice(at + offset, 0, item);
    choose(next);
  };
  const reset = () => {
    setDraftQuery("");
    setDraftMatch("");
    ctx.setSearch({
      exploreColumns: undefined,
      exploreQuery: undefined,
      exploreField: undefined,
      exploreMatch: undefined,
      exploreGroup: undefined,
      exploreSort: undefined,
      exploreDirection: undefined,
      explorePage: undefined,
      explorePageSize: undefined,
    });
  };
  const apply = () =>
    ctx.setSearch({
      exploreQuery: draftQuery.trim() || undefined,
      exploreMatch:
        ctx.search.exploreField === undefined ? undefined : draftMatch.trim() || undefined,
      explorePage: undefined,
    });
  const chosenField = ctx.search.exploreField;
  const hasCustom = Boolean(
    ctx.search.exploreColumns ||
    ctx.search.exploreQuery ||
    ctx.search.exploreField !== undefined ||
    ctx.search.exploreGroup !== undefined ||
    ctx.search.exploreSort !== undefined,
  );

  return (
    <div className="space-y-4">
      <section
        className="rounded-xl border bg-card p-4 shadow-xs print:hidden"
        aria-label="Report customization"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers3 className="size-5 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-semibold">Customize & explore</h2>
              <Badge variant="secondary">Loaded rows</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Adjust the presentation without changing accounting data or source totals.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                  <Columns3 className="mr-1 size-4" aria-hidden="true" /> Columns ({selected.length}
                  )
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Choose & reorder columns</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => choose(data.headers.map((_, i) => i))}
                  >
                    Show all
                  </Button>
                </div>
                <Input
                  aria-label="Find report column"
                  placeholder="Find a column…"
                  value={columnSearch}
                  onChange={(event) => setColumnSearch(event.target.value)}
                  className="mb-2"
                />
                <div className="max-h-80 space-y-1 overflow-auto">
                  {[
                    ...selected,
                    ...data.headers.map((_, i) => i).filter((i) => !selected.includes(i)),
                  ]
                    .filter((i) =>
                      (data.headers[i] ?? "")
                        .toLocaleLowerCase()
                        .includes(columnSearch.toLocaleLowerCase()),
                    )
                    .map((index) => {
                      const active = selected.includes(index);
                      const at = selected.indexOf(index);
                      return (
                        <div
                          key={index}
                          className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted/50"
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="size-4 accent-primary"
                              checked={active}
                              disabled={active && selected.length === 1}
                              onChange={() =>
                                choose(
                                  active
                                    ? selected.filter((item) => item !== index)
                                    : [...selected, index],
                                )
                              }
                            />
                            <span className="truncate" title={data.headers[index]}>
                              {data.headers[index] || "Column " + (index + 1)}
                            </span>
                          </label>
                          {active && (
                            <div className="flex shrink-0">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                disabled={at === 0}
                                aria-label={"Move " + data.headers[index] + " left"}
                                onClick={() => move(index, -1)}
                              >
                                <ArrowUp className="size-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7"
                                disabled={at === selected.length - 1}
                                aria-label={"Move " + data.headers[index] + " right"}
                                onClick={() => move(index, 1)}
                              >
                                <ArrowDown className="size-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              </PopoverContent>
            </Popover>
            <Button type="button" size="sm" variant="ghost" onClick={reset} disabled={!hasCustom}>
              <RotateCcw className="mr-1 size-4" aria-hidden="true" /> Reset
            </Button>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1 xl:col-span-2">
            <Label htmlFor="explorer-query">Search loaded report rows</Label>
            <div className="flex gap-2">
              <Input
                id="explorer-query"
                type="search"
                placeholder="Search any source column…"
                maxLength={120}
                value={draftQuery}
                onChange={(event) => setDraftQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && apply()}
              />
              <Button size="sm" variant="secondary" onClick={apply}>
                <Search className="mr-1 size-4" aria-hidden="true" /> Apply
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="explorer-field">Filter column</Label>
            <select
              id="explorer-field"
              className={selectClass}
              value={chosenField ?? ""}
              onChange={(event) => {
                setDraftMatch("");
                ctx.setSearch({
                  exploreField: event.target.value ? Number(event.target.value) : undefined,
                  exploreMatch: undefined,
                  explorePage: undefined,
                });
              }}
            >
              <option value="">All columns</option>
              {data.headers.map((label, index) => (
                <option key={index} value={index}>
                  {label || "Column " + (index + 1)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="explorer-match">Column contains</Label>
            <Input
              id="explorer-match"
              disabled={chosenField === undefined}
              type="search"
              placeholder="Contains…"
              maxLength={120}
              value={draftMatch}
              onChange={(event) => setDraftMatch(event.target.value)}
              onBlur={apply}
              onKeyDown={(event) => event.key === "Enter" && apply()}
            />
          </div>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <Label htmlFor="explorer-group">Group rows by</Label>
            <select
              id="explorer-group"
              className={selectClass}
              value={ctx.search.exploreGroup ?? ""}
              onChange={(event) =>
                ctx.setSearch({
                  exploreGroup: event.target.value ? Number(event.target.value) : undefined,
                  explorePage: undefined,
                })
              }
            >
              <option value="">No grouping</option>
              {data.headers.map((label, index) => (
                <option key={index} value={index}>
                  {label || "Column " + (index + 1)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="explorer-sort">Sort rows by</Label>
            <select
              id="explorer-sort"
              className={selectClass}
              value={ctx.search.exploreSort ?? ""}
              onChange={(event) =>
                ctx.setSearch({
                  exploreSort: event.target.value ? Number(event.target.value) : undefined,
                  explorePage: undefined,
                })
              }
            >
              <option value="">Original report order</option>
              {data.headers.map((label, index) => (
                <option key={index} value={index}>
                  {label || "Column " + (index + 1)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="explorer-direction">Sort direction</Label>
            <select
              id="explorer-direction"
              className={selectClass}
              value={ctx.search.exploreDirection ?? "asc"}
              disabled={ctx.search.exploreSort === undefined}
              onChange={(event) =>
                ctx.setSearch({
                  exploreDirection: event.target.value === "desc" ? "desc" : undefined,
                  explorePage: undefined,
                })
              }
            >
              <option value="asc">Ascending</option>
              <option value="desc">Descending</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="explorer-rows">Rows per page</Label>
            <select
              id="explorer-rows"
              className={selectClass}
              value={ctx.search.explorePageSize ?? 50}
              onChange={(event) =>
                ctx.setSearch({
                  explorePageSize: Number(event.target.value),
                  explorePage: undefined,
                })
              }
            >
              {[25, 50, 100, 200].map((amount) => (
                <option key={amount} value={amount}>
                  {amount}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          This view operates on loaded rows, including original total lines. Grouping creates labels
          and counts, not recalculated accounting subtotals. Return to Standard view for the
          authoritative statement layout.
        </p>
      </section>
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <div>
              <h3 className="font-semibold">Report data</h3>
              <p className="text-xs text-muted-foreground">
                {explorer.total} matching of {explorer.sourceTotal} loaded rows
                {ctx.search.exploreGroup !== undefined
                  ? " · " + explorer.groupCount + " groups"
                  : ""}
              </p>
            </div>
            <Badge variant="outline">{explorer.headers.length} columns</Badge>
          </div>
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  {explorer.headers.map((heading, index) => (
                    <TableHead
                      key={String(selected[index]) + "-" + index}
                      className="whitespace-nowrap"
                    >
                      {heading || "Column " + ((selected[index] ?? index) + 1)}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {explorer.rows.length ? (
                  explorer.rows.map((row) =>
                    row.kind === "group" ? (
                      <TableRow key={"group-" + row.key} className="bg-muted/50">
                        <TableCell colSpan={explorer.headers.length} className="font-semibold">
                          {row.label}{" "}
                          <span className="font-normal text-muted-foreground">
                            ({row.count} rows)
                          </span>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={"data-" + row.key} className="hover:bg-muted/25">
                        {row.cells.map((value, index) => (
                          <TableCell key={index} className="max-w-80 whitespace-nowrap text-sm">
                            {value === null || value === undefined ? "" : String(value)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ),
                  )
                ) : (
                  <TableRow>
                    <TableCell
                      colSpan={explorer.headers.length}
                      className="py-12 text-center text-muted-foreground"
                    >
                      No loaded rows match these filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 text-sm print:hidden">
            <span className="text-muted-foreground">
              Page {explorer.page} of {explorer.totalPages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={explorer.page <= 1}
                onClick={() =>
                  ctx.setSearch({
                    explorePage: explorer.page - 1 === 1 ? undefined : explorer.page - 1,
                  })
                }
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={explorer.page >= explorer.totalPages}
                onClick={() => ctx.setSearch({ explorePage: explorer.page + 1 })}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Downloads in this customized view use only the rows and columns shown on its current page.
        Save this view to retain customization settings.
      </p>
    </div>
  );
}

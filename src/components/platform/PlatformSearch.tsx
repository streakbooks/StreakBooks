import { useRef, useState, type KeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search } from "lucide-react";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { searchPlatform } from "@/lib/platform/platform.functions";
import { searchDestination } from "@/lib/platform/navigation";
import type { PlatformContext } from "@/lib/platform/catalog";

export function PlatformSearch({ context }: { context: PlatformContext }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const list = useRef<HTMLUListElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const search = useServerFn(searchPlatform);
  const result = useQuery({
    queryKey: ["platform", "search", context.userId, submitted],
    queryFn: () => search({ data: { query: submitted } }),
    enabled: open && Array.from(submitted).length >= 2,
    retry: false,
  });
  const canSearch = ["businesses.view", "users.view", "firms.view"].some((permission) =>
    context.permissions.includes(permission),
  );
  function move(event: KeyboardEvent<HTMLUListElement>) {
    const links = Array.from(list.current?.querySelectorAll<HTMLAnchorElement>("a") ?? []);
    if (!links.length) return;
    const index = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      links[(index + (event.key === "ArrowDown" ? 1 : -1) + links.length) % links.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      links[event.key === "Home" ? 0 : links.length - 1]?.focus();
    }
  }
  if (!canSearch) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) {
          setQuery("");
          setSubmitted("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Search className="size-4" />
          Search platform
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Search platform</DialogTitle>
          <DialogDescription>
            Find a business, user or accounting firm by name, email or record ID. Results follow
            your platform permissions.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(query.trim());
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Search platform records</span>
            <Input
              ref={input}
              value={query}
              maxLength={160}
              onChange={(event) => {
                setQuery(event.target.value);
                setSubmitted("");
              }}
              placeholder="Name, email or record ID"
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  list.current?.querySelector("a")?.focus();
                }
              }}
            />
          </label>
          <Button type="submit" disabled={Array.from(query.trim()).length < 2 || result.isFetching}>
            Search records
          </Button>
        </form>
        <div aria-live="polite">
          {submitted.length < 2 ? (
            <p className="text-sm text-muted-foreground">
              Enter at least two characters and search.
            </p>
          ) : result.isFetching ? (
            <p role="status">Searching platform records…</p>
          ) : result.isError ? (
            <QueryErrorState queries={[result]} title="Could not search platform records" />
          ) : result.isSuccess && result.data?.length === 0 ? (
            <p>No matching platform records.</p>
          ) : null}
        </div>
        {submitted && result.isSuccess && result.data && !result.isFetching ? (
          <>
            <ul
              ref={list}
              onKeyDown={move}
              className="space-y-2"
              aria-label="Platform search results"
            >
              {result.data.map((hit) => (
                <li key={`${hit.kind}:${hit.id}`}>
                  <Link
                    to="/platform"
                    search={searchDestination(hit)}
                    className="block rounded-lg border p-3 text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(event) => {
                      if (
                        !event.ctrlKey &&
                        !event.metaKey &&
                        !event.shiftKey &&
                        !event.altKey &&
                        event.button === 0
                      ) {
                        setOpen(false);
                        setQuery("");
                        setSubmitted("");
                      }
                    }}
                  >
                    <span className="block break-words font-medium">{hit.label}</span>
                    <span className="text-muted-foreground">
                      {hit.kind === "business"
                        ? "Business"
                        : hit.kind === "firm"
                          ? "Accounting firm"
                          : "User"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground">
              Showing up to 20 matches. Refine your search to find more.
            </p>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

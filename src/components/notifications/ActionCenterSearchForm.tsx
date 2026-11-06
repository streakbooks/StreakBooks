import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Search is submitted explicitly rather than changing the URL and issuing
 * database queries on every keystroke. Enter and the visible button both work.
 * The parent keys this component by the applied search, keeping browser history in sync.
 */
export function ActionCenterSearchForm({
  appliedSearch,
  onSearch,
}: {
  appliedSearch: string;
  onSearch: (value: string) => void;
}) {
  const [draft, setDraft] = useState(appliedSearch);
  const changed = draft !== appliedSearch;
  return (
    <form
      role="search"
      aria-label="Search Action Center"
      className="flex min-w-0 items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (changed) onSearch(draft);
      }}
    >
      <Input
        aria-label="Search notifications"
        placeholder="Search actions, invoices, bills…"
        value={draft}
        maxLength={120}
        className="min-w-0 flex-1"
        onChange={(event) => setDraft(event.target.value)}
      />
      <Button variant="secondary" type="submit" size="sm" disabled={!changed}>
        <Search className="mr-1 size-4" aria-hidden="true" />
        Search
      </Button>
    </form>
  );
}

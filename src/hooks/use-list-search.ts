import { useMemo, useState } from "react";
import { matchesQuery } from "@/lib/list-search";
/** Search box state for a list that is already loaded in the browser. */
export function useListSearch<T>(rows: readonly T[], textOf: (row: T) => string) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => rows.filter((r) => matchesQuery(textOf(r), query)),
    [rows, query, textOf],
  );
  return { query, setQuery, filtered };
}

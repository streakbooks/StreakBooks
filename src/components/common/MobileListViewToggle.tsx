import { LayoutGrid, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MobileListView = "cards" | "table";

/** The data source is unchanged; only one presentation is rendered at a time. */
export function MobileListViewToggle({
  view,
  onChange,
  context,
}: {
  view: MobileListView;
  onChange: (view: MobileListView) => void;
  context: string;
}) {
  const next = view === "cards" ? "table" : "cards";
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="md:hidden"
      aria-label={"Switch " + context + " to " + next + " view"}
      aria-pressed={view === "table"}
      onClick={() => onChange(next)}
    >
      {next === "table" ? (
        <Table2 className="size-4" aria-hidden />
      ) : (
        <LayoutGrid className="size-4" aria-hidden />
      )}
      {next === "table" ? "Table" : "Cards"}
    </Button>
  );
}

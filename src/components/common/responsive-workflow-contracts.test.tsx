import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@/components/ui/button";
import { DataTableToolbar } from "./data-table-toolbar";
import { SelectionActionBar } from "./SelectionActionBar";
import { PageHeader, SectionHeader } from "./states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";

describe("LinkBooks responsive workflow contract", () => {
  it("keeps table search available with an accessible, keyboard-reachable field", () => {
    const markup = renderToStaticMarkup(
      <DataTableToolbar search="invoice" onSearchChange={() => {}} />,
    );
    expect(markup).toContain('role="search"');
    expect(markup).toContain('aria-label="Filter records"');
    expect(markup).toContain('type="search"');
    expect(markup).toContain('value="invoice"');
    expect(markup).toContain('aria-label="Clear search"');
    expect(markup).toContain("w-full");
  });

  it("never submits a surrounding form when exporting CSV", () => {
    const markup = renderToStaticMarkup(
      <form>
        <DataTableToolbar onExport={() => {}} />
      </form>,
    );
    expect(markup).toContain("Export CSV");
    const exportButtonOpening = markup.slice(markup.lastIndexOf("<button", markup.indexOf("Export CSV")), markup.indexOf("Export CSV"));
    expect(exportButtonOpening).toContain('type="button"');
  });

  it("clears bulk selection without submitting an enclosing form", () => {
    const markup = renderToStaticMarkup(
      <form>
        <DataTableToolbar selectedCount={3} onClearSelection={() => {}} />
      </form>,
    );
    expect(markup).toContain('aria-label="Bulk actions"');
    expect(markup).toContain("3 selected");
    const clearButtonOpening = markup.slice(
      markup.lastIndexOf("<button", markup.indexOf('aria-label="Clear selected records"')),
      markup.indexOf('aria-label="Clear selected records"'),
    );
    expect(clearButtonOpening).toContain('type="button"');
  });

  it("does not invent actions or an active selection for an empty batch", () => {
    expect(renderToStaticMarkup(
      <SelectionActionBar count={0} onClear={() => {}} />,
    )).toBe("");
  });

  it("retains selected record count, clear action and responsive wrapping", () => {
    const markup = renderToStaticMarkup(
      <SelectionActionBar count={2} onClear={() => {}}>
        <Button type="button">Assign</Button>
      </SelectionActionBar>,
    );
    expect(markup).toContain('aria-label="Selected record actions"');
    expect(markup).toContain('aria-label="Clear selected records"');
    expect(markup).toContain("2 records selected");
    expect(markup).toContain("Assign");
    expect(markup).toContain("sm:w-auto");
    expect(markup).toContain('type="button"');
  });

  it("preserves headings and mobile action wrapping for page and section headers", () => {
    const page = renderToStaticMarkup(
      <PageHeader title="Products" actions={<Button type="button">New product</Button>} />,
    );
    expect(page).toContain("<h1");
    expect(page).toContain("Products");
    expect(page).toContain("sm:w-auto");
    const section = renderToStaticMarkup(
      <SectionHeader title="Price lists" actions={<Button type="button">Add list</Button>} />,
    );
    expect(section).toContain("<h2");
    expect(section).toContain("flex-wrap");
    expect(section).toContain("Add list");
  });

  it("shared workspaces keep page headings and labelled landmarks", () => {
    const list = renderToStaticMarkup(
      <ListWorkspace title="Sales" actions={<Button type="button">New invoice</Button>}>
        <p>Rows</p>
      </ListWorkspace>,
    );
    expect(list).toContain('data-slot="list-workspace"');
    expect(list).toContain("<h1");
    expect(list).toContain("Sales");
    expect(list).toContain("New invoice");
    const record = renderToStaticMarkup(
      <RecordWorkspace title="Bill detail">
        <p>Lines</p>
      </RecordWorkspace>,
    );
    expect(record).toContain('data-slot="record-workspace"');
    expect(record).toContain("<h1");
    expect(record).toContain("Bill detail");
  });
});


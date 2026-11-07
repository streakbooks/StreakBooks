import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { RecordWorkspace } from "@/components/workspace/RecordWorkspace";

describe("shared workspaces", () => {
  it("ListWorkspace exposes labelled section chrome and optional insight rail", () => {
    const html = renderToStaticMarkup(
      <ListWorkspace
        title="Banking"
        description="Accounts"
        actions={<button type="button">Import</button>}
        insights={<p>Next step</p>}
      >
        <p>Rows</p>
      </ListWorkspace>,
    );
    expect(html).toContain('data-slot="list-workspace"');
    expect(html).toContain('aria-label="Banking"');
    expect(html).toContain("Banking");
    expect(html).toContain("Accounts");
    expect(html).toContain("Import");
    expect(html).toContain('aria-label="Contextual insights"');
    expect(html).toContain("Next step");
    expect(html).toContain("Rows");
  });

  it("RecordWorkspace exposes labelled section chrome", () => {
    const html = renderToStaticMarkup(
      <RecordWorkspace title="Invoice INV-1" meta={<span>Paid</span>}>
        <div>Body</div>
      </RecordWorkspace>,
    );
    expect(html).toContain('data-slot="record-workspace"');
    expect(html).toContain('aria-label="Invoice INV-1"');
    expect(html).toContain("Paid");
    expect(html).toContain("Body");
    expect(html).not.toContain("Contextual insights");
  });

  it("omits undefined optional header props under exactOptionalPropertyTypes-safe spreading", () => {
    const html = renderToStaticMarkup(
      <ListWorkspace title="Contacts">
        <span>Directory</span>
      </ListWorkspace>,
    );
    expect(html).toContain("Contacts");
    expect(html).toContain("Directory");
  });
});

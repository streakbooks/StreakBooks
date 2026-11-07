import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Input } from "./input";
import { Textarea } from "./textarea";
import { Label } from "./label";
import { Button } from "./button";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Table, TableBody, TableCell, TableRow } from "./table";

describe("LinkBooks shared premium form and data primitives", () => {
  it("keeps a native and labelled input accessible when validation fails", () => {
    const markup = renderToStaticMarkup(
      <div>
        <Label htmlFor="supplier-name">Supplier</Label>
        <Input id="supplier-name" aria-invalid="true" aria-describedby="supplier-error" />
        <p id="supplier-error">Enter a supplier name</p>
      </div>,
    );
    expect(markup).toContain('for="supplier-name"');
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain('aria-describedby="supplier-error"');
    expect(markup).toContain("focus-visible:ring-2");
  });

  it("preserves native disabled controls and multline form semantics", () => {
    const markup = renderToStaticMarkup(
      <div>
        <Input disabled aria-label="Locked period" />
        <Textarea defaultValue="Notes already entered" aria-label="Posting notes" />
      </div>,
    );
    expect(markup).toContain("disabled");
    expect(markup).toContain("Notes already entered");
    expect(markup).toContain('aria-label="Posting notes"');
    expect(markup).toContain("resize-y");
  });

  it("preserves real buttons and their disabled or busy state", () => {
    const markup = renderToStaticMarkup(
      <Button disabled aria-busy="true" type="submit">Save draft</Button>,
    );
    expect(markup).toContain("<button");
    expect(markup).toContain('type="submit"');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("disabled");
    expect(markup).toContain("Save draft");
  });

  it("retains semantic card headings for every module", () => {
    const markup = renderToStaticMarkup(
      <Card>
        <CardHeader><CardTitle>Profit and loss</CardTitle></CardHeader>
        <CardContent>Verified reporting data</CardContent>
      </Card>,
    );
    expect(markup).toContain('data-slot="card"');
    expect(markup).toContain("Profit and loss");
    expect(markup).toContain("Verified reporting data");
  });

  it("keeps dense data tables scrollable without hiding keyboard reachability", () => {
    const markup = renderToStaticMarkup(
      <Table aria-label="Account balances">
        <TableBody>
          <TableRow><TableCell>Cash account</TableCell></TableRow>
        </TableBody>
      </Table>,
    );
    expect(markup).toContain('role="region"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).toContain('aria-label="Account balances table"');
    expect(markup).toContain("Cash account");
  });
});

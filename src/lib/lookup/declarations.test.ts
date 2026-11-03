import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { declaredLookupOptions } from "./declarations";
import { appendUniqueLookupRows } from "@/components/lookup/use-lookup-query";
describe("shared lookup migration adapter", () => {
  it("preserves unique IDs, disabled states, groups, placeholder and selected-label text", () => {
    const options = declaredLookupOptions([
      createElement("option", { value: "" }, "All records"),
      createElement("optgroup", { label: "Expenses" }, [
        createElement("option", { value: "account-a" }, "6000 — Expenses"),
        createElement("option", { value: "account-b", disabled: true }, "Unavailable"),
      ]),
    ]);
    expect(options.placeholder).toBe("All records");
    expect(options.options).toEqual([
      { id: "account-a", label: "6000 — Expenses", group: "Expenses" },
      { id: "account-b", label: "Unavailable", group: "Expenses", disabled: true },
    ]);
  });
  it("retains nested Radix-style trigger labeling and option declarations", () => {
    const options = declaredLookupOptions([
      createElement("div", { id: "selected-record", "aria-label": "Choose contact" }),
      createElement("div", {}, createElement("div", { value: "contact-1" }, "Actual contact")),
    ]);
    expect(options.id).toBe("selected-record");
    expect(options.ariaLabel).toBe("Choose contact");
    expect(options.options[0]!.id).toBe("contact-1");
  });
  it("replaying cached pages does not duplicate options or retain obsolete labels", () => {
    expect(
      appendUniqueLookupRows(
        [
          { id: "a", label: "Old" },
          { id: "b", label: "B" },
        ],
        [
          { id: "a", label: "Updated" },
          { id: "c", label: "C" },
        ],
      ),
    ).toEqual([
      { id: "a", label: "Updated" },
      { id: "b", label: "B" },
      { id: "c", label: "C" },
    ]);
  });
});

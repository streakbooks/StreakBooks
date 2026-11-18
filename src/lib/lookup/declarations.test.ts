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
  it("preserves trigger validation descriptions without letting option metadata overwrite them", () => {
    const result = declaredLookupOptions([
      createElement("button", {
        id: "customer",
        "aria-labelledby": "customer-label",
        "aria-describedby": "customer-help customer-error",
        "aria-invalid": true,
        disabled: false,
      }),
      createElement(
        "div",
        {},
        createElement(
          "div",
          {
            id: "option-id",
            value: "c-1",
            "aria-label": "Option label",
            "aria-invalid": false,
            disabled: true,
          },
          "Inactive customer",
        ),
      ),
    ]);
    expect(result).toMatchObject({
      id: "customer",
      labelledBy: "customer-label",
      describedBy: "customer-help customer-error",
      invalid: true,
      disabled: false,
    });
    expect(result.ariaLabel).toBeUndefined();
    expect(result.options[0]).toMatchObject({ id: "c-1", disabled: true });
  });
  it("preserves an explicitly valid trigger state", () => {
    expect(declaredLookupOptions(createElement("button", { "aria-invalid": false })).invalid).toBe(
      false,
    );
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

describe("declarative trigger layout", () => {
  it("preserves shared trigger sizing without inheriting popup or option styles", async () => {
    const { SelectTrigger, SelectContent, SelectItem } = await import("@/components/ui/select");
    const result = declaredLookupOptions([
      createElement(SelectTrigger, { className: "w-48", "aria-label": "Account" }),
      createElement(
        SelectContent,
        { className: "max-h-96" },
        createElement(SelectItem, { value: "a", className: "text-red-500" }, "Account A"),
      ),
    ]);
    expect(result.triggerClassName).toBe("w-48");
    expect(result.options).toEqual([{ id: "a", label: "Account A" }]);
  });
});

import { describe, expect, it } from "vitest";
import {
  parseSavedViews,
  removeSavedView,
  sanitiseViewSnapshot,
  upsertSavedView,
  MAX_SAVED_VIEWS,
  type ViewSchema,
} from "./saved-filter-views";

const schema = {
  q: { type: "text", maxLength: 100 },
  status: { type: "choice", choices: ["all", "draft", "paid"] },
  from: { type: "date" },
  bankAccountId: { type: "uuid" },
  overdue: { type: "boolean" },
  pageSize: { type: "integer", min: 25, max: 200 },
} satisfies ViewSchema;

describe("saved workspace filters", () => {
  it("accepts only allowlisted fields and valid values", () => {
    expect(
      sanitiseViewSnapshot(
        {
          q: "a".repeat(120),
          status: "administrator",
          from: "2026-10-01",
          overdue: true,
          pageSize: 50,
          sql: "drop table",
          page: 99,
          bankAccountId: "not-a-uuid",
        },
        schema,
      ),
    ).toEqual({
      q: "a".repeat(100),
      from: "2026-10-01",
      overdue: true,
      pageSize: 50,
    });
  });

  it("rejects invalid dates, numeric bounds, and malformed storage", () => {
    expect(sanitiseViewSnapshot({ from: "yesterday", pageSize: -1 }, schema)).toEqual({});
    expect(parseSavedViews("{broken", schema)).toEqual([]);
    expect(parseSavedViews("x".repeat(25_000), schema)).toEqual([]);
    expect(parseSavedViews('{"not":"a list"}', schema)).toEqual([]);
  });

  it("normalizes names, removes duplicate views, and discards untrusted fields", () => {
    expect(
      parseSavedViews(
        JSON.stringify([
          { name: "  Overdue  invoices ", filters: { status: "draft", page: 3 } },
          { name: "overdue invoices", filters: { status: "paid" } },
          { name: "", filters: { q: "x" } },
        ]),
        schema,
      ),
    ).toEqual([{ name: "Overdue invoices", filters: { status: "draft" } }]);
  });

  it("updates existing views by name without duplicate entries", () => {
    const first = upsertSavedView([], "Unpaid", { status: "draft" }, schema);
    const second = upsertSavedView(first, "unpaid", { status: "paid" }, schema);
    expect(second).toEqual([{ name: "unpaid", filters: { status: "paid" } }]);
    expect(removeSavedView(second, "UNPAID")).toEqual([]);
  });

  it("caps saved views at eight and ignores empty labels", () => {
    let views = upsertSavedView([], " ", { status: "paid" }, schema);
    expect(views).toHaveLength(0);
    for (let i = 0; i < 12; i++) {
      views = upsertSavedView(views, "View " + i, { overdue: i % 2 === 0 }, schema);
    }
    expect(views).toHaveLength(MAX_SAVED_VIEWS);
    expect(views[0]?.name).toBe("View 4");
  });

  it("accepts blank filters and a valid bank UUID without exposing records", () => {
    const id = "deafcafe-1111-4111-8111-aabc12345678";
    expect(sanitiseViewSnapshot({ q: "", from: "", bankAccountId: id }, schema)).toEqual({
      q: "",
      from: "",
      bankAccountId: id,
    });
  });
});

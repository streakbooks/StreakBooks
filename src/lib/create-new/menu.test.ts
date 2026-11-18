import { describe, expect, it } from "vitest";
import { CREATE_ACTIONS } from "@/lib/create-new/registry";
import {
  actionIsRunnable,
  createNavTarget,
  opensCreateAsFullPage,
  runnableCreateActions,
  searchCreateActions,
} from "@/lib/create-new/menu";
import {
  readCreatePrefs,
  rememberAction,
  toggleFavourite,
  writeCreatePrefs,
} from "@/lib/create-new/preferences";

describe("create new registry", () => {
  it("lists the 29 specified commands once", () => {
    expect(CREATE_ACTIONS).toHaveLength(29);
    expect(new Set(CREATE_ACTIONS.map((action) => action.id)).size).toBe(29);
  });

  it("keeps verified commands runnable and holds the rest", () => {
    const blocked = CREATE_ACTIONS.filter((action) => action.availability !== "ready").map(
      (action) => action.id,
    );
    expect(blocked).toEqual([]);
    expect(CREATE_ACTIONS.every((action) => action.component)).toBe(true);
    expect(runnableCreateActions("owner")).toHaveLength(29);
    expect(runnableCreateActions("read_only")).toHaveLength(1);
  });

  it("hides a ready action when the role lacks permission", () => {
    const invoice = CREATE_ACTIONS.find((action) => action.id === "invoice");
    expect(invoice && actionIsRunnable(invoice, "owner")).toBe(true);
    expect(invoice && actionIsRunnable(invoice, "read_only")).toBe(false);
    expect(runnableCreateActions("read_only").some((action) => action.id === "invoice")).toBe(
      false,
    );
  });

  it("searches labels and aliases", () => {
    const hits = searchCreateActions("spend", "owner").map((action) => action.id);
    expect(hits).toContain("expense");
    expect(searchCreateActions("estimate", "owner").map((action) => action.id)).toContain("quote");
  });
});

describe("create new preferences", () => {
  it("stores favourites and recent actions per user", () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => memory.set(k, v),
    };
    const next = rememberAction(toggleFavourite({ favourites: [], recent: [] }, "bill"), "bill");
    writeCreatePrefs(storage, "user-1", next);
    expect(readCreatePrefs(storage, "user-1")).toEqual({ favourites: ["bill"], recent: ["bill"] });
    expect(readCreatePrefs(storage, "user-2")).toEqual({ favourites: [], recent: [] });
  });
});

describe("scoped permission hints", () => {
  it("uses explicit permissions instead of broadening the display role", () => {
    const action = CREATE_ACTIONS.find((a) => a.availability === "ready");
    if (!action) throw new Error("No ready action");
    expect(actionIsRunnable(action, "read_only", [action.permission])).toBe(true);
    expect(actionIsRunnable(action, "owner", [])).toBe(false);
  });
});

describe("create full-page destinations", () => {
  it("opens invoice, bill, journal and money docs as full pages", () => {
    const invoice = CREATE_ACTIONS.find((a) => a.id === "invoice");
    const bill = CREATE_ACTIONS.find((a) => a.id === "bill");
    const journal = CREATE_ACTIONS.find((a) => a.id === "manual_journal");
    const receiveMoney = CREATE_ACTIONS.find((a) => a.id === "receive_money");
    const account = CREATE_ACTIONS.find((a) => a.id === "account");
    expect(invoice && opensCreateAsFullPage(invoice)).toBe(true);
    expect(bill && opensCreateAsFullPage(bill)).toBe(true);
    expect(journal && opensCreateAsFullPage(journal)).toBe(true);
    expect(receiveMoney && opensCreateAsFullPage(receiveMoney)).toBe(true);
    expect(account && opensCreateAsFullPage(account)).toBe(false);
  });

  it("routes recurring creates to dedicated full-page workspaces", () => {
    const recurringInvoice = CREATE_ACTIONS.find((a) => a.id === "recurring_invoice");
    const recurringBill = CREATE_ACTIONS.find((a) => a.id === "recurring_bill");
    const recurringJournal = CREATE_ACTIONS.find((a) => a.id === "recurring_journal");
    expect(recurringInvoice?.route).toBe("/sales/recurring/new");
    expect(recurringBill?.route).toBe("/purchases/recurring/new");
    expect(recurringJournal?.route).toBe("/accounting/journals/new");
    expect(recurringInvoice && opensCreateAsFullPage(recurringInvoice)).toBe(true);
    expect(recurringBill && opensCreateAsFullPage(recurringBill)).toBe(true);
    expect(recurringJournal && opensCreateAsFullPage(recurringJournal)).toBe(true);
  });

  it("preserves create intent for product and expense claim deep links", () => {
    const product = CREATE_ACTIONS.find((a) => a.id === "product")!;
    const claim = CREATE_ACTIONS.find((a) => a.id === "reimbursement")!;
    const journal = CREATE_ACTIONS.find((a) => a.id === "manual_journal")!;
    const salesReceipt = CREATE_ACTIONS.find((a) => a.id === "sales_receipt")!;
    expect(createNavTarget(product)).toEqual({
      kind: "route",
      to: "/products-services",
      search: { create: true },
    });
    expect(createNavTarget(claim)).toEqual({
      kind: "route",
      to: "/expense-management/$section",
      params: { section: "my-expenses" },
      search: { create: true },
    });
    expect(createNavTarget(journal)).toEqual({
      kind: "route",
      to: "/accounting/journals/new",
      search: { mode: "post" },
    });
    expect(createNavTarget(salesReceipt)).toEqual({
      kind: "route",
      to: "/banking/money-documents/new",
      search: { kind: "sales_receipt" },
    });
  });
});

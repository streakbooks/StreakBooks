import { describe, expect, it } from "vitest";
import { canPortalSeePurchaseOrder, canPortalSeeSalesInvoice } from "./access";

const customer = {
  membershipStatus: "active",
  membershipRole: "customer" as const,
  membershipCompanyId: "company-a",
  membershipContactId: "contact-a",
};

describe("portal document isolation", () => {
  it("shows a customer only their own authorised invoices", () => {
    expect(
      canPortalSeeSalesInvoice({
        ...customer,
        invoiceCompanyId: "company-a",
        invoiceContactId: "contact-a",
        invoiceStatus: "authorised",
      }),
    ).toBe(true);
    expect(
      canPortalSeeSalesInvoice({
        ...customer,
        invoiceCompanyId: "company-b",
        invoiceContactId: "contact-a",
        invoiceStatus: "authorised",
      }),
    ).toBe(false);
    expect(
      canPortalSeeSalesInvoice({
        ...customer,
        invoiceCompanyId: "company-a",
        invoiceContactId: "contact-b",
        invoiceStatus: "paid",
      }),
    ).toBe(false);
    expect(
      canPortalSeeSalesInvoice({
        ...customer,
        invoiceCompanyId: "company-a",
        invoiceContactId: "contact-a",
        invoiceStatus: "draft",
      }),
    ).toBe(false);
  });

  it("does not show sales invoices to a supplier login", () => {
    expect(
      canPortalSeeSalesInvoice({
        ...customer,
        membershipRole: "supplier",
        invoiceCompanyId: "company-a",
        invoiceContactId: "contact-a",
        invoiceStatus: "authorised",
      }),
    ).toBe(false);
  });

  it("shows a supplier only purchase orders that were sent to them", () => {
    expect(
      canPortalSeePurchaseOrder({
        membershipStatus: "active",
        membershipRole: "supplier",
        membershipCompanyId: "company-a",
        membershipContactId: "contact-a",
        orderCompanyId: "company-a",
        orderContactId: "contact-a",
        orderStatus: "sent",
      }),
    ).toBe(true);
    expect(
      canPortalSeePurchaseOrder({
        membershipStatus: "active",
        membershipRole: "supplier",
        membershipCompanyId: "company-a",
        membershipContactId: "contact-a",
        orderCompanyId: "company-a",
        orderContactId: "contact-a",
        orderStatus: "draft",
      }),
    ).toBe(false);
    expect(
      canPortalSeePurchaseOrder({
        membershipStatus: "invited",
        membershipRole: "supplier",
        membershipCompanyId: "company-a",
        membershipContactId: "contact-a",
        orderCompanyId: "company-a",
        orderContactId: "contact-a",
        orderStatus: "sent",
      }),
    ).toBe(false);
  });
});

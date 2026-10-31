/**
 * Portal isolation rule. SQL enforces the same conditions on every read.
 * External users never receive a company membership, so staff row-level security
 * does not apply to them and cannot be widened to make a portal query succeed.
 */

export type PortalRole = "customer" | "supplier";

export function canPortalSeeSalesInvoice(input: {
  membershipStatus: string;
  membershipRole: PortalRole | string;
  membershipCompanyId: string;
  membershipContactId: string;
  invoiceCompanyId: string;
  invoiceContactId: string;
  invoiceStatus: string;
}): boolean {
  if (input.membershipStatus !== "active") return false;
  if (input.membershipRole !== "customer") return false;
  if (input.membershipCompanyId !== input.invoiceCompanyId) return false;
  if (input.membershipContactId !== input.invoiceContactId) return false;
  return input.invoiceStatus !== "draft";
}

export function canPortalSeePurchaseOrder(input: {
  membershipStatus: string;
  membershipRole: PortalRole | string;
  membershipCompanyId: string;
  membershipContactId: string;
  orderCompanyId: string;
  orderContactId: string;
  orderStatus: string;
}): boolean {
  if (input.membershipStatus !== "active") return false;
  if (input.membershipRole !== "supplier") return false;
  if (input.membershipCompanyId !== input.orderCompanyId) return false;
  if (input.membershipContactId !== input.orderContactId) return false;
  return (
    input.orderStatus === "sent" ||
    input.orderStatus === "partially_received" ||
    input.orderStatus === "billed"
  );
}

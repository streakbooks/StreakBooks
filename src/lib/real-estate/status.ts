/** Inventory states for property development and sales. Rental occupancy stays in Property Management. */
export const UNIT_STATUSES = [
  "planned",
  "under_development",
  "available",
  "on_hold",
  "reserved",
  "booked",
  "under_agreement",
  "sold",
  "fully_paid",
  "ready_for_handover",
  "handed_over",
  "cancelled",
  "resale",
  "withdrawn",
] as const;

export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const UNIT_KINDS = [
  "apartment",
  "villa",
  "house",
  "office",
  "retail",
  "warehouse",
  "plot",
  "industrial",
  "parking",
  "other",
] as const;

export type UnitKind = (typeof UNIT_KINDS)[number];

/**
 * Edges the database may apply. Reservation, booking and cancellation use the
 * dedicated functions; the generic screen only offers `generic` edges.
 */
const EDGES: Record<UnitStatus, readonly UnitStatus[]> = {
  planned: ["under_development", "available", "withdrawn", "cancelled"],
  under_development: ["planned", "available", "on_hold", "withdrawn", "cancelled"],
  available: ["on_hold", "reserved", "withdrawn", "cancelled"],
  on_hold: ["available", "reserved", "withdrawn", "cancelled"],
  reserved: ["available", "booked", "cancelled"],
  booked: ["under_agreement", "available", "cancelled"],
  under_agreement: ["sold", "booked", "available", "cancelled"],
  sold: ["fully_paid", "under_agreement", "available", "cancelled"],
  fully_paid: ["ready_for_handover", "sold", "available", "cancelled"],
  ready_for_handover: ["handed_over", "fully_paid", "cancelled"],
  handed_over: ["resale"],
  resale: ["available", "reserved"],
  withdrawn: ["planned"],
  cancelled: ["available", "planned"],
};

const GENERIC = new Set<string>([
  "planned>under_development",
  "planned>available",
  "planned>withdrawn",
  "planned>cancelled",
  "under_development>planned",
  "under_development>available",
  "under_development>on_hold",
  "under_development>withdrawn",
  "under_development>cancelled",
  "available>on_hold",
  "available>withdrawn",
  "available>cancelled",
  "on_hold>available",
  "on_hold>withdrawn",
  "on_hold>cancelled",
  "fully_paid>ready_for_handover",
  "ready_for_handover>handed_over",
  "ready_for_handover>fully_paid",
  "handed_over>resale",
  "resale>available",
  "withdrawn>planned",
  "cancelled>available",
  "cancelled>planned",
]);

export function isUnitStatus(value: string): value is UnitStatus {
  return (UNIT_STATUSES as readonly string[]).includes(value);
}

export function statusEdgeAllowed(from: UnitStatus, to: UnitStatus): boolean {
  return EDGES[from].includes(to);
}

export function genericTransitions(from: UnitStatus): UnitStatus[] {
  return EDGES[from].filter((to) => GENERIC.has(`${from}>${to}`));
}

export function pricePerAreaMinor(priceMinor: number, area: number): number | null {
  if (!Number.isFinite(area) || area <= 0) return null;
  if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) {
    throw new Error("Price must be a non-negative minor-unit amount.");
  }
  return Math.round(priceMinor / area);
}

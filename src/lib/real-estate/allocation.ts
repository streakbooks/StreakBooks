export type AllocationMethod =
  | "saleable_area"
  | "built_up_area"
  | "land_area"
  | "unit_count"
  | "relative_value"
  | "percentage"
  | "direct";

export function allocatePool(
  poolMinor: number,
  units: readonly { id: string; weight: number }[],
): { id: string; amountMinor: number }[] {
  if (!Number.isSafeInteger(poolMinor) || poolMinor < 0) {
    throw new Error("Cost pool must be a non-negative minor amount.");
  }
  if (units.length === 0) throw new Error("Allocation needs at least one property.");
  if (poolMinor === 0) return units.map((unit) => ({ id: unit.id, amountMinor: 0 }));
  if (units.some((unit) => !Number.isFinite(unit.weight) || unit.weight < 0)) {
    throw new Error("Allocation weights cannot be negative.");
  }
  const weight = units.reduce((sum, unit) => sum + unit.weight, 0);
  if (weight <= 0) throw new Error("Allocation weights must be positive.");
  const raw = units.map((unit, index) => {
    const exact = (poolMinor * unit.weight) / weight;
    const floor = Math.floor(exact);
    return { id: unit.id, index, floor, fraction: exact - floor };
  });
  let remainder = poolMinor - raw.reduce((sum, unit) => sum + unit.floor, 0);
  const order = [...raw].sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const extra = new Map<string, number>();
  for (const unit of order) {
    if (remainder <= 0) break;
    extra.set(unit.id, (extra.get(unit.id) ?? 0) + 1);
    remainder -= 1;
  }
  return raw.map((unit) => ({
    id: unit.id,
    amountMinor: unit.floor + (extra.get(unit.id) ?? 0),
  }));
}

export function allocateDevelopmentCost(
  method: AllocationMethod,
  poolMinor: number,
  units: readonly { id: string; weight: number }[],
): { id: string; amountMinor: number }[] {
  if (method === "direct") {
    const chosen = units.filter((unit) => unit.weight > 0);
    if (chosen.length !== 1) {
      throw new Error("Direct allocation needs exactly one property.");
    }
    return units.map((unit) => ({
      id: unit.id,
      amountMinor: unit.id === chosen[0]?.id ? poolMinor : 0,
    }));
  }
  if (method === "percentage") {
    const total = units.reduce((sum, unit) => sum + unit.weight, 0);
    if (total !== 10000) throw new Error("Percentage allocation must total 100%.");
  }
  if (method === "unit_count") {
    if (units.some((unit) => unit.weight !== 1)) {
      throw new Error("Unit-count allocation gives every property a weight of 1.");
    }
  }
  return allocatePool(poolMinor, units);
}

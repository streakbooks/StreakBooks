type FeatureSearchItem = {
  label: string;
  description: string;
  consumerModules: readonly string[];
};

export function filterFeatureSettings<T extends FeatureSearchItem>(
  items: readonly T[],
  query: string,
): T[] {
  const term = query.trim().toLowerCase();
  if (!term) return [...items];
  return items.filter((item) =>
    [item.label, item.description, ...item.consumerModules].some((value) =>
      value.toLowerCase().includes(term),
    ),
  );
}

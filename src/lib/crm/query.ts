/** Untyped Supabase table helpers for CRM tables before generated types catch up. */

export type CrmQueryError = { message: string; code?: string } | null;

export type CrmFilterBuilder = {
  select: (columns: string) => CrmFilterBuilder;
  eq: (column: string, value: string | number | boolean) => CrmFilterBuilder;
  is: (column: string, value: null) => CrmFilterBuilder;
  not: (column: string, op: string, value: string | null) => CrmFilterBuilder;
  or: (filters: string) => CrmFilterBuilder;
  gte: (column: string, value: string | number | boolean) => CrmFilterBuilder;
  lt: (column: string, value: string | number | boolean) => CrmFilterBuilder;
  in: (column: string, values: string[]) => CrmFilterBuilder;
  order: (column: string, opts?: { ascending?: boolean }) => CrmFilterBuilder;
  limit: (n: number) => PromiseLike<{ data: unknown; error: CrmQueryError }>;
  range: (from: number, to: number) => PromiseLike<{ data: unknown; error: CrmQueryError }>;
  maybeSingle: () => PromiseLike<{ data: unknown; error: CrmQueryError }>;
  single: () => PromiseLike<{ data: unknown; error: CrmQueryError }>;
  then: PromiseLike<{ data: unknown; error: CrmQueryError }>["then"];
};

export type CrmTableClient = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => CrmFilterBuilder;
    select: (columns: string) => CrmFilterBuilder;
  };
};

export function crmClient(supabase: unknown): CrmTableClient {
  return supabase as CrmTableClient;
}

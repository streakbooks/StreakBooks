import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";
import { assertUuid } from "@/lib/company-validation";
import type { ExceptionFinding } from "./reconciliation-exceptions";
import type {
  ReconciliationCaseAction,
  ReconciliationCaseStatus,
  ReconciliationSavedCase,
} from "./reconciliation-review";

const SOURCES = [
  "ledger",
  "fx_realised",
  "fx_revaluation",
  "deferrals",
  "payroll",
  "fixed_assets",
] as const;
const STATUSES = ["open", "in_review", "blocked"] as const; // Batch 4 operational status RPC never sets reviewed/ready states.
const ACTIONS = ["open", "assign", "comment", "status"] as const;
function limitedString(value: unknown, name: string, max: number, optional = false): string | null {
  if (value === null || value === undefined) {
    if (optional) return null;
    throw new Error(name + " is required.");
  }
  if (typeof value !== "string" || value.trim().length > max || (!optional && !value.trim())) {
    throw new Error(name + " must be a nonempty string no longer than " + max + " characters.");
  }
  return value.trim() || null;
}
function allowed<T extends string>(value: unknown, options: readonly T[], name: string): T {
  if (typeof value !== "string" || !options.includes(value as T)) {
    throw new Error("Invalid " + name + ".");
  }
  return value as T;
}

/** On-demand, capped operational queue, not a complete audit of source postings. */
export const listReconciliationReviewCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input?.companyId),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      cases: ReconciliationSavedCase[];
      hasMore: boolean;
    }> => {
      await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
      const { data: rows, error } = await context.supabase
        .from("reconciliation_review_cases" as never)
        .select(
          "id,company_id,source_type,finding_fingerprint,severity,title,detail,source_reference,journal_id,status,assigned_to,version,created_at,updated_at,created_by,updated_by,evidence_url,evidence_added_by,evidence_added_at,submitted_by,submitted_at,reviewed_by,reviewed_at" as never,
        )
        .eq("company_id" as never, data.companyId as never)
        .order("updated_at" as never, { ascending: false })
        .limit(101);
      if (error) throw new Error(error.message);
      const cases = (rows ?? []) as unknown as ReconciliationSavedCase[];
      if (cases.some((row) => row.company_id !== data.companyId)) {
        throw new Error("Reconciliation review queue includes evidence from another organisation.");
      }
      return { cases: cases.slice(0, 100), hasMore: cases.length > 100 };
    },
  );

/** Exact, permissioned lookup keeps older cases reachable beyond the queue cap. */
export const getReconciliationReviewCase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; source: ExceptionFinding["source"]; fingerprint: string }) => {
      const source = allowed(input?.source, SOURCES, "reconciliation source");
      if (!/^f[0-9a-f]{32}$/.test(input?.fingerprint ?? "")) {
        throw new Error("Invalid reconciliation finding fingerprint.");
      }
      return { companyId: assertUuid(input?.companyId), source, fingerprint: input.fingerprint };
    },
  )
  .handler(async ({ data, context }): Promise<ReconciliationSavedCase | null> => {
    await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
    const { data: row, error } = await context.supabase
      .from("reconciliation_review_cases" as never)
      .select(
        "id,company_id,source_type,finding_fingerprint,severity,title,detail,source_reference,journal_id,status,assigned_to,version,created_at,updated_at,created_by,updated_by,evidence_url,evidence_added_by,evidence_added_at,submitted_by,submitted_at,reviewed_by,reviewed_at" as never,
      )
      .eq("company_id" as never, data.companyId as never)
      .eq("source_type" as never, data.source as never)
      .eq("finding_fingerprint" as never, data.fingerprint as never)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const found = row as unknown as ReconciliationSavedCase;
    if (
      found.company_id !== data.companyId ||
      found.source_type !== data.source ||
      found.finding_fingerprint !== data.fingerprint
    ) {
      throw new Error("Reconciliation review source or organisation mismatch.");
    }
    return found;
  });

export type SaveCaseInput = {
  companyId: string;
  source: ExceptionFinding["source"];
  fingerprint: string;
  action: ReconciliationCaseAction;
  finding?: Pick<
    ExceptionFinding,
    "title" | "detail" | "severity" | "journalId" | "reference"
  > | null;
  assignedTo?: string | null;
  status?: ReconciliationCaseStatus | null;
  note?: string;
  expectedVersion?: number | null;
};

/** All changes are version checked and event-logged by the SQL RPC.
 * No direct client DML, no "resolved" status, no journal posting or approval.
 */
export const saveReconciliationReviewCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: SaveCaseInput) => {
    const action = allowed(input?.action, ACTIONS, "review action");
    const source = allowed(input?.source, SOURCES, "reconciliation source");
    if (!/^f[0-9a-f]{32}$/.test(input?.fingerprint ?? "")) {
      throw new Error("Invalid reconciliation finding fingerprint.");
    }
    const version = input?.expectedVersion;
    if (
      action === "open"
        ? version !== undefined && version !== null
        : !Number.isSafeInteger(version) || (version ?? 0) < 1
    ) {
      throw new Error("Review versions must be absent for new cases and current for updates.");
    }
    const finding = action === "open" ? input.finding : null;
    if (action === "open" && !finding)
      throw new Error("Opening a case requires audit finding evidence.");
    const assignedTo =
      input.assignedTo == null ? null : assertUuid(input.assignedTo, "review assignee");
    const journalId =
      finding?.journalId == null ? null : assertUuid(finding.journalId, "finding journal");
    return {
      companyId: assertUuid(input.companyId),
      action,
      source,
      fingerprint: input.fingerprint,
      title: finding ? limitedString(finding.title, "Finding title", 220) : null,
      detail: finding ? limitedString(finding.detail, "Finding detail", 2000) : null,
      severity: finding
        ? allowed(finding.severity, ["error", "warning"] as const, "severity")
        : null,
      reference: finding ? limitedString(finding.reference, "Source reference", 180, true) : null,
      journalId,
      assignedTo,
      status: input.status == null ? null : allowed(input.status, STATUSES, "review status"),
      note: limitedString(input.note ?? "", "Review comment", 2000, true) ?? "",
      expectedVersion: action === "open" ? null : version,
    };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      id: string;
      status: ReconciliationCaseStatus;
      version: number;
      assigned_to: string | null;
      updated_at: string;
    }> => {
      await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
      await assertCompanyPermission(context.supabase, data.companyId, "accounting.post");
      const { data: saved, error } = await context.supabase.rpc(
        "save_reconciliation_review_case" as never,
        {
          _company_id: data.companyId,
          _source_type: data.source,
          _fingerprint: data.fingerprint,
          _action: data.action,
          _title: data.title,
          _detail: data.detail,
          _severity: data.severity,
          _source_reference: data.reference,
          _journal_id: data.journalId,
          _assigned_to: data.assignedTo,
          _status: data.status,
          _note: data.note,
          _expected_version: data.expectedVersion,
        } as never,
      );
      if (error) throw new Error(error.message);
      if (!saved || typeof saved !== "object") {
        throw new Error("Reconciliation review save returned no versioned evidence.");
      }
      return saved as {
        id: string;
        status: ReconciliationCaseStatus;
        version: number;
        assigned_to: string | null;
        updated_at: string;
      };
    },
  );

/** Team chooser, deliberately separately permissioned to avoid listing staff
 * to accounting-only readers without members.view access.
 */
export const listReconciliationReviewAssignees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) => ({
    companyId: assertUuid(input?.companyId),
  }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{
      members: Array<{ user_id: string; role: string }>;
      hasMore: boolean;
    }> => {
      await assertCompanyPermission(context.supabase, data.companyId, "accounting.view");
      await assertCompanyPermission(context.supabase, data.companyId, "members.view");
      const { data: members, error } = await context.supabase
        .from("company_members" as never)
        .select("user_id,company_id,role,status" as never)
        .eq("company_id" as never, data.companyId as never)
        .eq("status" as never, "active" as never)
        .limit(101);
      if (error) throw new Error(error.message);
      const rows = (members ?? []) as unknown as Array<{
        user_id: string;
        company_id: string;
        role: string;
        status: string;
      }>;
      if (rows.some((row) => row.company_id !== data.companyId || row.status !== "active")) {
        throw new Error("Reconciliation assignment returned foreign or inactive members.");
      }
      return {
        members: rows.slice(0, 100).map(({ user_id, role }) => ({ user_id, role })),
        hasMore: rows.length > 100,
      };
    },
  );

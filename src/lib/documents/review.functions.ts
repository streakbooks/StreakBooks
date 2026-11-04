import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyMember, assertCompanyPermission } from "@/lib/assert-company-access";
import { assertEntityAccess } from "@/lib/documents/attachments.functions";
import { assertUuid } from "@/lib/company-validation";
import {
  REVIEW_STATUSES,
  validateReviewFields,
  type ReviewFields,
  type ReviewStatus,
  type ReviewType,
} from "@/lib/documents/review-model";

const MIGRATION_HINT =
  "The Documents review workflow needs database migration 20261104054143. Ask an administrator to apply it.";

function throwReviewError(error: { code?: string; message: string }): never {
  if (error.code === "42P01" || /document_reviews|document_review_events/.test(error.message))
    throw new Error(MIGRATION_HINT);
  throw new Error(error.message);
}

export type ReviewQueueItem = {
  id: string;
  attachment_id: string;
  status: ReviewStatus;
  document_type: ReviewType;
  reference: string | null;
  supplier_name: string | null;
  document_date: string | null;
  currency_code: string | null;
  total_minor: number | null;
  note: string | null;
  version: number;
  updated_at: string;
  reviewed_at: string | null;
  file_name: string;
  content_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
};

type ReviewRow = Omit<ReviewQueueItem, "file_name" | "content_type" | "size_bytes" | "uploaded_at">;

export const listDocumentReviewQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { companyId: string; status?: string; page?: number; pageSize?: number }) => ({
      companyId: assertUuid(input.companyId),
      status:
        input.status && REVIEW_STATUSES.includes(input.status as ReviewStatus)
          ? (input.status as ReviewStatus)
          : null,
      page: Math.max(0, Math.min(100000, Math.floor(Number(input.page) || 0))),
      pageSize: Math.max(5, Math.min(100, Math.floor(Number(input.pageSize) || 25))),
    }),
  )
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    let query = context.supabase
      .from("document_reviews" as never)
      .select(
        "id, attachment_id, status, document_type, reference, supplier_name, document_date, currency_code, total_minor, note, version, updated_at, reviewed_at" as never,
        { count: "exact" },
      )
      .eq("company_id" as never, data.companyId as never);
    if (data.status) query = query.eq("status" as never, data.status as never);
    const {
      data: rows,
      error,
      count,
    } = await query
      .order("updated_at" as never, { ascending: false } as never)
      .order("id" as never, { ascending: false } as never)
      .range(data.page * data.pageSize, (data.page + 1) * data.pageSize - 1);
    if (error) throwReviewError(error);
    const reviews = (rows ?? []) as unknown as ReviewRow[];
    if (reviews.length === 0)
      return {
        rows: [] as ReviewQueueItem[],
        total: count ?? 0,
        page: data.page,
        pageSize: data.pageSize,
      };
    const attachments = await context.supabase
      .from("document_attachments" as never)
      .select("id, file_name, content_type, size_bytes, created_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("entity_type" as never, "company" as never)
      .in("id" as never, reviews.map((row) => row.attachment_id) as never);
    if (attachments.error) throw new Error(attachments.error.message);
    const attachmentRows = (attachments.data ?? []) as unknown as Array<{
      id: string;
      file_name: string;
      content_type: string | null;
      size_bytes: number | null;
      created_at: string;
    }>;
    const lookup = new Map(attachmentRows.map((row) => [row.id, row]));
    return {
      rows: reviews.flatMap((review): ReviewQueueItem[] => {
        const file = lookup.get(review.attachment_id);
        return file
          ? [
              {
                ...review,
                file_name: file.file_name,
                content_type: file.content_type,
                size_bytes: file.size_bytes,
                uploaded_at: file.created_at,
              },
            ]
          : [];
      }),
      total: count ?? reviews.length,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const updateDocumentReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (
      input: {
        companyId: string;
        attachmentId: string;
        expectedVersion: number;
      } & ReviewFields,
    ) => {
      const expectedVersion = Number(input.expectedVersion);
      if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1)
        throw new Error("Invalid review version");
      return {
        companyId: assertUuid(input.companyId),
        attachmentId: assertUuid(input.attachmentId, "file"),
        expectedVersion,
        fields: validateReviewFields(input),
      };
    },
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    await assertEntityAccess(supabase, data.companyId, "company", "manage");
    if (data.fields.status === "approved") {
      let allowed = false;
      for (const permission of ["purchases.authorise", "sales.authorise"] as const) {
        try {
          await assertCompanyPermission(supabase, data.companyId, permission);
          allowed = true;
          break;
        } catch {
          // Either authorisation permission is sufficient for document-only approval.
        }
      }
      if (!allowed) throw new Error("You do not have permission to approve this document");
    }
    const { data: saved, error } = await supabase
      .from("document_reviews" as never)
      .update({
        status: data.fields.status,
        document_type: data.fields.documentType,
        reference: data.fields.reference,
        supplier_name: data.fields.supplierName,
        document_date: data.fields.documentDate,
        currency_code: data.fields.currencyCode,
        total_minor: data.fields.totalMinor,
        note: data.fields.note,
      } as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("attachment_id" as never, data.attachmentId as never)
      .eq("version" as never, data.expectedVersion as never)
      .select("id, version" as never);
    if (error) throwReviewError(error);
    const results = (saved ?? []) as unknown as Array<{ id: string; version: number }>;
    if (results.length !== 1)
      throw new Error("Review changed, or you do not have permission. Refresh and retry.");
    return results[0]!;
  });

export const listDocumentReviewHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string; reviewId: string }) => ({
    companyId: assertUuid(input.companyId),
    reviewId: assertUuid(input.reviewId, "review"),
  }))
  .handler(async ({ data, context }) => {
    await assertCompanyMember(context.supabase, data.companyId);
    const { data: rows, error } = await context.supabase
      .from("document_review_events" as never)
      .select("id, old_status, new_status, old_type, new_type, actor_user_id, created_at" as never)
      .eq("company_id" as never, data.companyId as never)
      .eq("review_id" as never, data.reviewId as never)
      .order("created_at" as never, { ascending: false } as never)
      .limit(50);
    if (error) throwReviewError(error);
    return (rows ?? []) as unknown as Array<{
      id: string;
      old_status: string | null;
      new_status: string;
      old_type: string | null;
      new_type: string;
      actor_user_id: string | null;
      created_at: string;
    }>;
  });

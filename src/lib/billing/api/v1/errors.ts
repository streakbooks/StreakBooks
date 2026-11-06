/** Error envelope and the mapping from database and validation failures to HTTP statuses. */
export type ApiErrorCode =
  | "validation_error"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "method_not_allowed"
  | "conflict"
  | "idempotency_conflict"
  | "idempotency_in_progress"
  | "unprocessable"
  | "internal";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Maps a PostgreSQL SQLSTATE raised by a billing RPC to an HTTP status. */
export function statusForSqlState(state: string | undefined): {
  status: number;
  code: ApiErrorCode;
} {
  switch (state) {
    case "42501":
      return { status: 403, code: "forbidden" };
    case "23505":
    case "40001":
    case "23P01":
      return { status: 409, code: "conflict" };
    case "22023":
    case "22P02":
    case "23514":
    case "P0001":
      return { status: 422, code: "unprocessable" };
    case "PGRST116":
      return { status: 404, code: "not_found" };
    default:
      return { status: 500, code: "internal" };
  }
}

/** Plain errors thrown by shared server code carry user-facing messages but no SQLSTATE. */
export function statusForMessage(message: string): { status: number; code: ApiErrorCode } {
  if (/permission|not allowed|only a|cannot|must be signed in|unauthori[sz]ed/i.test(message)) {
    return { status: 403, code: "forbidden" };
  }
  if (/not found|could not be found/i.test(message)) return { status: 404, code: "not_found" };
  return { status: 422, code: "unprocessable" };
}

export function errorBody(error: ApiError, requestId: string) {
  return {
    data: null,
    error: { code: error.code, message: error.message, details: error.details ?? null },
    meta: { requestId },
  };
}

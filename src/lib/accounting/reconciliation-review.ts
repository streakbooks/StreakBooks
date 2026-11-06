import type { ExceptionFinding } from "./reconciliation-exceptions";

/** Stable across reordered exception lists. This is an operational dedupe key,
 * NOT a signature, authorization token, source attestation, or proof of resolution.
 * Changed source evidence intentionally creates a separate review case.
 */
export function reconciliationFindingFingerprint(finding: Pick<
  ExceptionFinding, "source" | "title" | "detail" | "severity" | "reference" | "journalId"
>): string {
  const material = [
    finding.source, finding.reference ?? "", finding.journalId ?? "",
    finding.severity, finding.title, finding.detail,
  ].map(x => x.length + ":" + x).join("|");
  const mod = (1n << 64n) - 1n;
  const prime = 1099511628211n;
  let first = 14695981039346656037n, second = 7809847782465536322n;
  for (let i = 0; i < material.length; i++) {
    const code = BigInt(material.charCodeAt(i));
    first = ((first ^ code) * prime) & mod;
    second = ((second ^ code) * (prime + 2n)) & mod;
  }
  return "f" + first.toString(16).padStart(16, "0") +
    second.toString(16).padStart(16, "0");
}
export type ReconciliationCaseStatus = "open" | "in_review" | "blocked";
export type ReconciliationCaseAction = "open" | "assign" | "comment" | "status";
export type ReconciliationSavedCase = {
  id: string; company_id: string; source_type: ExceptionFinding["source"];
  finding_fingerprint: string; severity: "error" | "warning";
  title: string; detail: string;
  source_reference: string | null; journal_id: string | null;
  status: ReconciliationCaseStatus; assigned_to: string | null;
  version: number; created_at: string; updated_at: string;
  created_by: string; updated_by: string;
};

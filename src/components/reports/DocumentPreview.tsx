import type { ReportDocument } from "@/lib/reports/report-document";
import { displayDocumentValue, documentCellStyle } from "@/lib/reports/document-format";
import { Link } from "@tanstack/react-router";
import { reportHeaderParts } from "@/lib/reports/report-presentation";
export function DocumentPreview({
  document: doc,
  showHeader = true,
  compact = false,
  onToggleSection,
  onAccountDrill,
  collapsedSections = [],
}: {
  document: ReportDocument;
  showHeader?: boolean;
  compact?: boolean;
  onToggleSection?: (label: string) => void;
  onAccountDrill?: (accountId: string, from: string, to: string) => void;
  collapsedSections?: string[];
}) {
  return (
    <article
      className="report-shell space-y-6 rounded-lg border bg-background p-4 sm:p-8 print:border-0 print:p-0"
      aria-label="Financial report preview"
    >
      {showHeader ? (
        <header
          className="space-y-1"
          style={{ textAlign: doc.presentation?.headerAlignment ?? "center" }}
        >
          {reportHeaderParts(doc).map((part, index) =>
            part.title ? (
              <h2 key={index} className="text-2xl font-semibold">
                {part.text}
              </h2>
            ) : (
              <p key={index} className="text-sm text-muted-foreground">
                {part.text}
              </p>
            ),
          )}
        </header>
      ) : (
        <>
          {doc.header && <p className="text-center text-sm font-medium">{doc.header}</p>}
          {doc.subtitle && (
            <p className="text-center text-sm text-muted-foreground">{doc.subtitle}</p>
          )}
        </>
      )}
      {doc.sections.map((section, index) => (
        <section key={`${section.id}-${index}`} className="space-y-3 break-inside-avoid">
          <h3 className="font-semibold">{section.title}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="min-w-48 py-3 text-left">Account / measure</th>
                  {section.columns.map((column, i) => (
                    <th key={i} className="min-w-32 px-3 py-3 text-right">
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {section.rows.map((row, i) => (
                  <tr
                    key={i}
                    className={`${doc.presentation?.reportBorders === "none" ? "" : "border-b"} ${doc.presentation?.bandedRows && i % 2 === 1 ? "bg-muted/15" : ""} ${row.kind === "heading" ? "bg-muted/40" : ""} ${["total", "subtotal", "group", "formula"].includes(row.kind) ? "font-semibold" : ""}`}
                  >
                    <td
                      className={`${compact ? "py-1" : "py-2"} ${doc.presentation?.reportBorders === "all" ? "border-x px-2" : ""}`}
                      style={{ paddingLeft: `${(row.indent ?? 0) * 12}px` }}
                    >
                      {row.accountId && !row.accountId.startsWith("__") ? (
                        doc.basis === "cash" ? (
                          onAccountDrill ? (
                            <button
                              className="text-left hover:underline"
                              onClick={() => onAccountDrill(row.accountId!, doc.from, doc.to)}
                            >
                              {row.label}
                            </button>
                          ) : (
                            row.label
                          )
                        ) : (
                          <Link
                            to="/reports/$reportId"
                            params={{ reportId: "general-ledger" }}
                            search={{ account: row.accountId, from: doc.from, to: doc.to }}
                            className="hover:underline"
                          >
                            {row.label}
                          </Link>
                        )
                      ) : row.kind === "heading" && onToggleSection ? (
                        <button
                          className="flex w-full items-center gap-2 text-left"
                          aria-label={`${collapsedSections.includes(row.label) ? "Expand" : "Collapse"} ${row.label}`}
                          aria-expanded={!collapsedSections.includes(row.label)}
                          onClick={() => onToggleSection(row.label)}
                        >
                          <span aria-hidden="true">
                            {collapsedSections.includes(row.label) ? "▸" : "▾"}
                          </span>
                          {row.label}
                        </button>
                      ) : (
                        row.label
                      )}
                    </td>
                    {row.values.map((value, j) => (
                      <td
                        key={j}
                        className={`whitespace-nowrap px-3 ${compact ? "py-1" : "py-2"} text-right tabular-nums ${doc.presentation?.reportBorders === "all" ? "border-x" : ""} ${row.negativeRed && value.startsWith("-") ? "text-destructive" : ""}`}
                      >
                        {row.accountId && section.columnPeriods?.[j] ? (
                          doc.basis === "cash" ? (
                            onAccountDrill ? (
                              <button
                                className="hover:underline"
                                aria-label={`${row.label} cash transactions ${section.columnPeriods![j]!.from} to ${section.columnPeriods![j]!.to}`}
                                onClick={() =>
                                  onAccountDrill(
                                    row.accountId!,
                                    section.columnPeriods![j]!.from,
                                    section.columnPeriods![j]!.to,
                                  )
                                }
                              >
                                {displayDocumentValue(value, documentCellStyle(row, section, j))}
                              </button>
                            ) : (
                              displayDocumentValue(value, documentCellStyle(row, section, j))
                            )
                          ) : (
                            <Link
                              to="/reports/$reportId"
                              params={{ reportId: "general-ledger" }}
                              search={{
                                account: row.accountId,
                                from: section.columnPeriods![j]!.from,
                                to: section.columnPeriods![j]!.to,
                              }}
                              className="hover:underline"
                            >
                              {displayDocumentValue(value, documentCellStyle(row, section, j))}
                            </Link>
                          )
                        ) : (
                          displayDocumentValue(value, documentCellStyle(row, section, j))
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {section.note && <p className="text-xs text-muted-foreground">{section.note}</p>}
        </section>
      ))}
      {doc.notes && (
        <section className="space-y-2">
          <h3 className="font-semibold">Report notes</h3>
          <p className="whitespace-pre-wrap text-sm">{doc.notes}</p>
        </section>
      )}
      {doc.footer && (
        <footer
          className="border-t pt-3 text-xs text-muted-foreground"
          style={{ textAlign: doc.presentation?.footerAlignment ?? "left" }}
        >
          {doc.footer}
        </footer>
      )}
    </article>
  );
}

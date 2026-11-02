import type { ReportDocument } from "@/lib/reports/report-document";
import { displayDocumentValue, documentCellStyle } from "@/lib/reports/document-format";
import { Link } from "@tanstack/react-router";
export function DocumentPreview({ document: doc }: { document: ReportDocument }) {
  return (
    <article
      className="report-shell space-y-6 rounded-lg border bg-background p-4 sm:p-8 print:border-0 print:p-0"
      aria-label="Financial report preview"
    >
      <header className="space-y-1 text-center">
        <p className="text-sm font-medium">{doc.header}</p>
        <p className="text-muted-foreground">{doc.company}</p>
        <h2 className="text-2xl font-semibold">{doc.title}</h2>
        {doc.subtitle && <p>{doc.subtitle}</p>}
        <p className="text-sm text-muted-foreground">
          {doc.from} – {doc.to} · {doc.currency}
        </p>
        <p className="text-xs text-muted-foreground">Captured {doc.capturedAt}</p>
      </header>
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
                    className={`border-b ${row.kind === "heading" ? "bg-muted/40" : ""} ${["total", "subtotal", "group", "formula"].includes(row.kind) ? "font-semibold" : ""}`}
                  >
                    <td className="py-2" style={{ paddingLeft: `${(row.indent ?? 0) * 12}px` }}>
                      {row.accountId && !row.accountId.startsWith("__") ? (
                        <Link
                          to="/reports/$reportId"
                          params={{ reportId: "general-ledger" }}
                          search={{ account: row.accountId, from: doc.from, to: doc.to }}
                          className="hover:underline"
                        >
                          {row.label}
                        </Link>
                      ) : (
                        row.label
                      )}
                    </td>
                    {row.values.map((value, j) => (
                      <td
                        key={j}
                        className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${row.negativeRed && value.startsWith("-") ? "text-destructive" : ""}`}
                      >
                        {displayDocumentValue(value, documentCellStyle(row, section, j))}
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
          <h3 className="font-semibold">Management commentary</h3>
          <p className="whitespace-pre-wrap text-sm">{doc.notes}</p>
        </section>
      )}
      {doc.footer && (
        <footer className="border-t pt-3 text-xs text-muted-foreground">{doc.footer}</footer>
      )}
    </article>
  );
}

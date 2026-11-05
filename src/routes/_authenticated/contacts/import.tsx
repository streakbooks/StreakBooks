import { useCallback, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { getContactImportTemplate, importContactsCsv } from "@/lib/contacts/contacts.functions";
import { buildContactsCsv, parseContactsCsv } from "@/lib/contacts/contact-helpers";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { PageHeader, EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/contacts/import")({
  head: () => ({ meta: [{ title: "Import contacts — LinkBooks" }] }),
  component: ContactImportPage,
});

const importColumns = [
  ["name", "Contact name (required)"],
  ["kind", "Role"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["tax_number", "Tax ID"],
  ["payment_terms_days", "Payment terms (days)"],
  ["account_number", "Account number"],
  ["notes", "Internal notes"],
] as const;

function ContactImportPage() {
  const { company } = useActiveCompany();
  const companyId = company?.id;
  const canManage = useCanDo("contacts.manage");
  const queryClient = useQueryClient();
  const templateFn = useServerFn(getContactImportTemplate);
  const importFn = useServerFn(importContactsCsv);
  const [csvText, setCsvText] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    failed: number;
    errors: Array<{ row: number; message: string }>;
  } | null>(null);

  const parsed = useMemo(() => {
    if (!csvText) return { value: null, error: null };
    try {
      return { value: parseContactsCsv(csvText), error: null };
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : "Could not read CSV",
      };
    }
  }, [csvText]);
  const sourceIndex = useCallback(
    (column: string): number => {
      const override = mapping[column];
      if (override === "none") return -1;
      if (override !== undefined) return Number(override);
      return parsed.value?.headers.indexOf(column) ?? -1;
    },
    [mapping, parsed],
  );
  const mappedCsv = useMemo(() => {
    if (!parsed.value || sourceIndex("name") < 0) return "";
    const columns = importColumns.map(([column]) => column);
    const records = parsed.value.rows.map((row) =>
      Object.fromEntries(columns.map((column) => [column, row[sourceIndex(column)] ?? ""])),
    );
    return buildContactsCsv(records, columns);
  }, [parsed, sourceIndex]);

  const importM = useMutation({
    mutationFn: () =>
      importFn({ data: { companyId: companyId!, csvText: mappedCsv, skipDuplicates } }),
    onSuccess: async (res) => {
      setResult(res);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["contacts", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["contacts-summary", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["contacts-count", companyId] }),
        queryClient.invalidateQueries({ queryKey: ["contact-duplicates", companyId] }),
      ]);
      if (res.failed > 0)
        toast.warning(`Import finished with ${res.failed} row errors. Review the results below.`);
      else toast.success(`Import finished: ${res.created} created`);
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!companyId) return <EmptyState title="No organisation" description="Select a company." />;

  return (
    <>
      <PageHeader
        title="Import contacts"
        description="Upload a CSV. Existing contacts with the same name are skipped by default."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/contacts" search={{ view: undefined }}>
              Directory
            </Link>
          </Button>
        }
      />

      <ol className="mb-6 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Download the LinkBooks template</li>
        <li>Fill name (required), kind, email, phone, tax_number, payment_terms_days</li>
        <li>Upload and review results — retries skip already-created names when enabled</li>
      </ol>

      {!canManage ? (
        <p role="status" className="mb-4 text-sm text-muted-foreground">
          You need contact management permission to import contacts.
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              const res = await templateFn();
              const blob = new Blob([res.csv], { type: "text/csv;charset=utf-8" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "linkbooks-contacts-template.csv";
              a.click();
              URL.revokeObjectURL(url);
            } catch (e) {
              toast.error(friendlyAuthError(e));
            }
          }}
        >
          Download template
        </Button>
        <Label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm">
          Choose CSV
          <input
            type="file"
            disabled={!canManage || importM.isPending}
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Choose contact CSV"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              if (file.size > 1_500_000) {
                toast.error("File too large (max ~1.5 MB)");
                return;
              }
              try {
                const text = await file.text();
                if (!text.trim()) {
                  setCsvText("");
                  setResult(null);
                  toast.error("The selected CSV file is empty");
                  return;
                }
                setCsvText(text);
                setMapping({});
                setResult(null);
                toast.message(`Loaded ${file.name}`);
              } catch {
                setCsvText("");
                setResult(null);
                toast.error("Could not read the selected CSV file");
              }
            }}
          />
        </Label>
      </div>

      <label className="mb-4 flex items-center gap-2 text-sm">
        <Checkbox checked={skipDuplicates} onCheckedChange={(v) => setSkipDuplicates(Boolean(v))} />
        Skip contacts that already exist (same name)
      </label>

      {parsed.error ? (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {parsed.error}
        </p>
      ) : null}

      {parsed.value ? (
        <section
          className="mb-5 space-y-4 rounded-lg border bg-card p-4"
          aria-label="CSV import preview"
        >
          <div>
            <h2 className="font-medium">Review column mapping</h2>
            <p className="text-sm text-muted-foreground">
              {parsed.value.rows.length} contact rows detected. Select the corresponding CSV column
              for each LinkBooks field, or leave an optional field unmapped.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {importColumns.map(([column, label]) => (
              <div className="space-y-1" key={column}>
                <Label htmlFor={`contact-map-${column}`}>{label}</Label>
                <select
                  id={`contact-map-${column}`}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                  value={
                    mapping[column] ??
                    (parsed.value!.headers.indexOf(column) >= 0
                      ? String(parsed.value!.headers.indexOf(column))
                      : "none")
                  }
                  onChange={(event) => {
                    setMapping((current) => ({ ...current, [column]: event.target.value }));
                    setResult(null);
                  }}
                >
                  {/* lookup-fixed-enum: Uploaded CSV column schema is fixed for this file. */}

                  <option value="none">Not mapped</option>
                  {parsed.value.headers.map((header, index) => (
                    <option key={index} value={String(index)}>
                      {header || `Column ${index + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {sourceIndex("name") < 0 ? (
            <p role="alert" className="text-sm text-destructive">
              Map a contact name column to continue.
            </p>
          ) : null}
          <div
            className="overflow-x-auto"
            role="region"
            aria-label="Mapped contact preview"
            tabIndex={0}
          >
            <table className="w-full text-left text-sm">
              <caption className="mb-2 text-left text-xs text-muted-foreground">
                Preview of the first five contacts. Import has not started.
              </caption>
              <thead>
                <tr className="border-b">
                  <th className="p-2 font-medium">Name</th>
                  <th className="p-2 font-medium">Role</th>
                  <th className="p-2 font-medium">Email</th>
                </tr>
              </thead>
              <tbody>
                {parsed.value.rows.slice(0, 5).map((row, index) => (
                  <tr key={index} className="border-b last:border-0">
                    <td className="p-2">{row[sourceIndex("name")] ?? "—"}</td>
                    <td className="p-2">{row[sourceIndex("kind")] ?? "customer"}</td>
                    <td className="p-2">{row[sourceIndex("email")] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <Button
        disabled={!canManage || !mappedCsv || !parsed.value?.rows.length || importM.isPending}
        onClick={() => importM.mutate()}
      >
        {importM.isPending ? "Importing…" : "Confirm import"}
      </Button>

      {result ? (
        <div role="status" className="mt-6 space-y-2 rounded-xl border bg-card p-4 text-sm">
          <p>
            Created {result.created} · Skipped {result.skipped} · Failed {result.failed}
          </p>
          {result.errors.length ? (
            <ul className="rounded-md border border-destructive/40 p-3 text-destructive">
              {result.errors.map((err) => (
                <li key={`${err.row}-${err.message}`}>
                  Row {err.row}: {err.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { mutatePlatform } from "@/lib/platform/platform.functions";
import { moduleNames, recordFields } from "@/lib/platform/catalog";
import type { Row, Section } from "@/lib/platform/catalog";
import type { z } from "zod";
import { mutationSchema } from "@/lib/platform/catalog";

type Field = {
  key: string;
  label: string;
  options?: readonly string[];
  type?: string;
  required?: boolean;
};
export type EditMode =
  "edit" | "create" | "assign" | "member" | "grant" | "revoke" | "revokeRole" | "revokeGrant";
const field = (key: string, label: string, options?: readonly string[]): Field => ({
  key,
  label,
  required: true,
  ...(options ? { options } : {}),
});
function specification(
  section: Section,
  mode: EditMode,
  row: Row | null,
): { action: z.infer<typeof mutationSchema>["action"]; fields: Field[] } {
  if (mode === "revoke") return { action: "user.revoke", fields: [] };
  if (mode === "revokeRole") return { action: "role.revoke", fields: [] };
  if (mode === "revokeGrant") return { action: "support.revoke", fields: [] };
  if (mode === "grant")
    return {
      action: "support.grant",
      fields: [field("user_id", "Staff user ID"), field("company_id", "Business ID")],
    };
  if (mode === "assign")
    return {
      action: "role.assign",
      fields: [
        field("user_id", "User ID"),
        field("role_id", "Custom role ID"),
        { key: "scope_id", label: "Business or firm ID (leave empty for platform scope)" },
      ],
    };
  if (mode === "member")
    return section === "firms"
      ? {
          action: "firm.member",
          fields: [
            field("firm_id", "Firm ID"),
            field("user_id", "User ID"),
            field("role", "Firm role", ["owner", "admin", "member"]),
          ],
        }
      : {
          action: "member.assign",
          fields: [
            field("company_id", "Business ID"),
            field("user_id", "User ID"),
            field("role", "Company role", [
              "owner",
              "admin",
              "accountant",
              "bookkeeper",
              "staff",
              "read_only",
            ]),
          ],
        };
  if (section === "businesses")
    return mode === "create"
      ? {
          action: "business.create",
          fields: [
            field("name", "Business name"),
            field("owner_id", "Owner user ID"),
            field("country_code", "Country (ISO 2 letters)"),
            field("base_currency", "Currency (ISO 3 letters)"),
            { ...field("fiscal_year_end_month", "Year-end month"), type: "number" },
            { ...field("fiscal_year_end_day", "Year-end day"), type: "number" },
            field("timezone", "IANA time zone"),
          ],
        }
      : {
          action: "business.update",
          fields: [
            field("name", "Business name"),
            field("status", "Account status", ["active", "inactive", "suspended", "archived"]),
            {
              key: "storage_quota_bytes",
              label: "Storage quota in bytes (empty = plan limit)",
              type: "number",
            },
          ],
        };
  if (section === "firms") return { action: "firm.save", fields: [field("name", "Firm name")] };
  if (section === "users")
    return {
      action: "user.update",
      fields: [
        field("full_name", "Full name"),
        field("status", "Account status", ["active", "inactive", "suspended"]),
        field("require_mfa", "Require MFA", ["false", "true"]),
      ],
    };
  if (section === "roles")
    return {
      action: "role.save",
      fields: [
        field("name", "Role name"),
        field("scope", "Scope", ["platform", "firm", "company"]),
        field("permissions", "Permissions (comma separated)"),
      ],
    };
  return {
    action: "record.save",
    fields: [
      field(
        "name",
        section === "features" ? "Module" : section === "settings" ? "Setting" : "Name",
        section === "features"
          ? moduleNames
          : section === "settings"
            ? ["maintenance", "retention"]
            : undefined,
      ),
      field(
        "status",
        "Status",
        section === "support"
          ? ["open", "in_progress", "resolved"]
          : section === "integrations" || section === "api"
            ? ["draft", "disabled"]
            : ["draft", "active", "disabled"],
      ),
      { key: "company_id", label: "Business ID (empty = global)" },
      ...(recordFields[section] ?? []).map((key) => ({
        key: `document.${key}`,
        label: key.replaceAll("_", " "),
        required: section === "notifications" && key === "message",
      })),
    ],
  };
}
export function PlatformEditor({
  section,
  mode,
  row,
  onClose,
}: {
  section: Section;
  mode: EditMode;
  row: Row | null;
  onClose: () => void;
}) {
  const spec = specification(section, mode, row);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      spec.fields.map((f) => {
        const v = f.key.startsWith("document.")
          ? (row?.["document"] as Row | undefined)?.[f.key.slice(9)]
          : row?.[f.key];
        return [
          f.key,
          Array.isArray(v) ? v.join(", ") : v == null ? (f.options?.[0] ?? "") : String(v),
        ];
      }),
    ),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const queryClient = useQueryClient();
  const mutate = useServerFn(mutatePlatform);
  const mutation = useMutation({
    mutationFn: async () => {
      const payload: Row = {};
      const document: Row = {};
      for (const f of spec.fields) {
        const value = values[f.key] ?? "";
        if (f.key.startsWith("document.")) {
          if (value) document[f.key.slice(9)] = value;
        } else
          payload[f.key] =
            f.key === "permissions"
              ? value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : f.key === "require_mfa"
                ? value === "true"
                : f.type === "number"
                  ? value === ""
                    ? null
                    : Number(value)
                  : value;
      }
      if (spec.action === "record.save") {
        payload["kind"] = section;
        payload["document"] = document;
        if (row) payload["version"] = row["version"] ?? null;
      }
      return mutate({
        data: {
          action: spec.action,
          id: mode === "edit" || mode.startsWith("revoke") ? String(row?.["id"]) : null,
          payload,
          reason,
        },
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["platform"] });
      toast.success("Saved and recorded in the audit log.");
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode.startsWith("revoke")
              ? "Revoke access"
              : mode === "edit"
                ? "Edit record"
                : mode === "grant"
                  ? "Authorize one-hour support access"
                  : "Create or assign record"}
          </DialogTitle>
          <DialogDescription>
            Changes require a reason and are saved with an audit record. IDs are available in the
            corresponding platform lists.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            mutation.mutate();
          }}
        >
          {spec.fields.map((f) => (
            <label key={f.key} className="block text-sm font-medium">
              {f.label}
              {f.options ? (
                <select
                  disabled={section === "roles" && f.key === "scope" && !!row}
                  className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                >
                  {f.options.map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <Input
                  className="mt-1"
                  type={f.type ?? "text"}
                  required={f.required}
                  maxLength={f.key.includes("description") ? 4000 : 1000}
                  min={f.type === "number" ? 0 : undefined}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
              )}
            </label>
          ))}
          <label className="block text-sm font-medium">
            Reason for this action
            <textarea
              className="mt-1 min-h-20 w-full rounded-md border bg-background p-3"
              minLength={3}
              maxLength={1000}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          {mode.startsWith("revoke") ? (
            <p className="text-sm text-destructive">
              Confirm revocation for {String(row?.["email"] ?? row?.["id"])}. The user may need to
              sign in again.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={mutation.isPending} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending
                ? "Saving…"
                : mode.startsWith("revoke")
                  ? "Confirm revocation"
                  : "Save change"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

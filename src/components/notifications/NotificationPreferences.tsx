import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const OPTIONS = [
  {
    id: "bill_approval",
    title: "Bill approval queue",
    detail: "Bills that require your review or authorisation",
  },
  {
    id: "overdue_invoice",
    title: "Overdue customer invoices",
    detail: "Unpaid posted invoices after their due date",
  },
  {
    id: "bank_reconciliation",
    title: "Banking exceptions",
    detail: "Uncategorised or unreconciled bank activity",
  },
  {
    id: "document_request",
    title: "Document requests",
    detail: "Documents colleagues have requested from you",
  },
  {
    id: "contact_followup",
    title: "Contact follow-up reminders",
    detail:
      "Opt in to scheduled in-app alerts for tasks assigned to you. Email and push are not enabled.",
  },
] as const;

type Category = (typeof OPTIONS)[number]["id"];
type Preference = { category: Category; enabled: boolean };

export function NotificationPreferences({
  companyId,
  userId,
}: {
  companyId: string | null;
  userId: string;
}) {
  const client = useQueryClient();
  const key = ["action-notification-preferences", companyId, userId];
  const prefs = useQuery({
    queryKey: key,
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("action_notification_preferences" as never)
        .select("category,enabled" as never)
        .eq("company_id" as never, companyId as never)
        .eq("recipient_user_id" as never, userId as never);
      if (error) throw error;
      return (data ?? []) as Preference[];
    },
  });
  const save = useMutation({
    mutationFn: async ({ category, enabled }: Preference) => {
      const { error } = await supabase.from("action_notification_preferences" as never).upsert(
        {
          company_id: companyId,
          recipient_user_id: userId,
          category,
          enabled,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "company_id,recipient_user_id,category" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: key });
      void client.invalidateQueries({ queryKey: ["action-notifications", companyId] });
      void client.invalidateQueries({ queryKey: ["action-notifications-unread", companyId] });
      notify.success("Notification preference saved");
    },
    onError: (error) => notify.error(error, "Could not save notification preference"),
  });
  if (!companyId) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notification preferences</CardTitle>
        <p className="text-sm text-muted-foreground">
          Choose the optional alerts you want to see for this organisation. Critical and security
          alerts remain visible.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {prefs.isPending && <p className="text-sm text-muted-foreground">Loading preferences…</p>}
        {prefs.isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load preferences
          </p>
        )}
        {!prefs.isPending &&
          !prefs.isError &&
          OPTIONS.map((option) => {
            const enabled =
              prefs.data?.find((p) => p.category === option.id)?.enabled ??
              option.id !== "contact_followup";
            return (
              <label
                key={option.id}
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="block text-xs text-muted-foreground">{option.detail}</span>
                </span>
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={save.isPending}
                  aria-label={option.title}
                  onChange={(e) => save.mutate({ category: option.id, enabled: e.target.checked })}
                  className="size-4 accent-primary"
                />
              </label>
            );
          })}
      </CardContent>
    </Card>
  );
}

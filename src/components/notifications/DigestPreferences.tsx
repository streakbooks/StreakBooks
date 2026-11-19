import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { notify } from "@/lib/notify";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type Preference = { frequency: "off" | "daily" | "weekly"; weekday: number; hour_local: number };
const DEFAULTS: Preference = { frequency: "off", weekday: 1, hour_local: 8 };
export function DigestPreferences({
  companyId,
  userId,
  timezone,
  providerConfigured,
}: {
  companyId: string;
  userId: string;
  timezone: string;
  providerConfigured: boolean;
}) {
  const client = useQueryClient();
  const key = ["communication-digest-preferences", companyId, userId];
  const [value, setValue] = useState<Preference>(DEFAULTS);
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communication_digest_preferences" as never)
        .select("frequency,weekday,hour_local" as never)
        .eq("company_id" as never, companyId as never)
        .eq("user_id" as never, userId as never)
        .maybeSingle();
      if (error) throw error;
      return (data as Preference | null) ?? DEFAULTS;
    },
  });
  useEffect(() => {
    if (query.data) setValue(query.data);
  }, [query.data]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("communication_digest_preferences" as never).upsert(
        {
          company_id: companyId,
          user_id: userId,
          ...value,
          updated_at: new Date().toISOString(),
        } as never,
        { onConflict: "company_id,user_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      notify.success("Digest schedule saved");
      void client.invalidateQueries({ queryKey: key });
    },
    onError: (error) => notify.error(error, "Could not save digest schedule"),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Scheduled email digests</CardTitle>
        <p className="text-sm text-muted-foreground">
          Opt in to a daily or weekly summary of your authorized outstanding actions. Sent only to
          your verified login email.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isError ? (
          <QueryErrorState queries={[query]} title="Could not load digest schedule" />
        ) : null}
        {!providerConfigured && (
          <p className="text-sm text-muted-foreground">
            Sending requires the Resend provider and verified sender domain to be configured.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="digest-frequency">Frequency</Label>
            <select
              id="digest-frequency"
              className="w-full rounded-md border bg-background p-2 text-sm"
              disabled={query.isPending || query.isError || save.isPending}
              value={value.frequency}
              onChange={(e) =>
                setValue((v) => ({
                  ...v,
                  frequency: e.target.value as Preference["frequency"],
                }))
              }
            >
              <option value="off">Off</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          </div>
          {value.frequency === "weekly" && (
            <div className="space-y-1">
              <Label htmlFor="digest-weekday">Day</Label>
              <select
                id="digest-weekday"
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={value.weekday}
                onChange={(e) => setValue((v) => ({ ...v, weekday: Number(e.target.value) }))}
              >
                {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}
                {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
                  (d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ),
                )}
              </select>
            </div>
          )}
          {value.frequency !== "off" && (
            <div className="space-y-1">
              <Label htmlFor="digest-hour">Send at</Label>
              <select
                id="digest-hour"
                className="w-full rounded-md border bg-background p-2 text-sm"
                value={value.hour_local}
                onChange={(e) => setValue((v) => ({ ...v, hour_local: Number(e.target.value) }))}
              >
                {/* lookup-fixed-enum: Short schema or presentation enumeration, not selectable business records. */}
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Timezone: {timezone}. Quiet hours are respected. Scheduled messages require the protected
          hourly worker to be enabled on the hosting platform; saving a schedule alone does not
          guarantee delivery.
        </p>
        <Button
          size="sm"
          disabled={query.isPending || query.isError || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : "Save digest schedule"}
        </Button>
      </CardContent>
    </Card>
  );
}

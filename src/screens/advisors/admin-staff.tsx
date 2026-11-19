import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsSubnav } from "@/components/advisors/AdvisorsSubnav";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { listAdvisorsStaff, upsertAdvisorsStaff } from "@/lib/advisors/management.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";

const emptyForm = {
  id: undefined as string | undefined,
  displayName: "",
  email: "",
  timezone: "UTC",
  isActive: true,
};

export function AdvisorsAdminStaffPage() {
  const qc = useQueryClient();
  const list = useServerFn(listAdvisorsStaff);
  const upsert = useServerFn(upsertAdvisorsStaff);
  const [reason, setReason] = useState("");
  const [form, setForm] = useState(emptyForm);

  const query = useQuery({
    queryKey: ["advisors-staff"],
    queryFn: () => list(),
    retry: false,
  });

  const saveM = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: form.id,
          displayName: form.displayName,
          email: form.email,
          timezone: form.timezone,
          isActive: form.isActive,
          reason: reason || (form.id ? "Updated advisor profile" : "Created advisor profile"),
        },
      }),
    onSuccess: async () => {
      toast.success(form.id ? "Advisor updated" : "Advisor created");
      setReason("");
      setForm(emptyForm);
      await qc.invalidateQueries({ queryKey: ["advisors-staff"] });
      await qc.invalidateQueries({ queryKey: ["advisors-overview"] });
      await qc.invalidateQueries({ queryKey: ["advisors-booking-admin"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <ListWorkspace title="Advisors" description="Staff who deliver Advisors services.">
          <ErrorState
            title="Advisor directory unavailable"
            description={friendlyAuthError(query.error)}
            onRetry={() => void query.refetch()}
          />
        </ListWorkspace>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <ListWorkspace
        title="Advisors"
        description="Create and maintain advisor profiles used for assignments and booking calendars."
        subnav={<AdvisorsSubnav />}
      >
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="space-y-2">
            {query.data.length === 0 ? (
              <EmptyState
                title="No advisors configured"
                description="Add an advisor to accept assignments and consultations."
                action={
                  <Button
                    size="sm"
                    type="button"
                    onClick={() => {
                      setForm(emptyForm);
                      document
                        .getElementById("advisors-staff-form")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                  >
                    New advisor
                  </Button>
                }
              />
            ) : (
              query.data.map((member) => (
                <button
                  key={member.id}
                  type="button"
                  onClick={() =>
                    setForm({
                      id: member.id,
                      displayName: member.displayName,
                      email: member.email ?? "",
                      timezone: member.timezone,
                      isActive: member.isActive,
                    })
                  }
                  className={`w-full rounded-xl border p-4 text-left transition ${
                    form.id === member.id
                      ? "border-primary bg-primary/5"
                      : "border-border/70 hover:border-primary/40"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{member.displayName}</p>
                      <p className="text-sm text-muted-foreground">
                        {member.email || "No email"} · {member.timezone}
                      </p>
                    </div>
                    <Badge variant={member.isActive ? "default" : "secondary"}>
                      {member.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </button>
              ))
            )}
          </section>

          <section
            id="advisors-staff-form"
            className="space-y-3 rounded-xl border border-border/70 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">{form.id ? "Edit advisor" : "New advisor"}</h2>
              <Button type="button" variant="outline" size="sm" onClick={() => setForm(emptyForm)}>
                Clear
              </Button>
            </div>
            <div className="space-y-1">
              <Label htmlFor="staff-reason">Change reason</Label>
              <Input
                id="staff-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Why are you saving this advisor?"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="staff-name">Display name</Label>
              <Input
                id="staff-name"
                value={form.displayName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, displayName: event.target.value }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="staff-email">Email</Label>
              <Input
                id="staff-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="staff-timezone">Timezone</Label>
              <Input
                id="staff-timezone"
                value={form.timezone}
                onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
                placeholder="Europe/London"
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2">
              <Label htmlFor="staff-active">Active</Label>
              <Switch
                id="staff-active"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, isActive: checked }))}
              />
            </div>
            <Button type="button" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
              {form.id ? "Save advisor" : "Create advisor"}
            </Button>
          </section>
        </div>
      </ListWorkspace>
    </main>
  );
}

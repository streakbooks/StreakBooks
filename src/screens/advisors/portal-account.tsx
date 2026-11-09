import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsPortalSubnav } from "@/components/advisors/AdvisorsPortalSubnav";
import { ErrorState, LoadingState, PageHeader } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createAdvisorsPortalServiceRequest,
  getAdvisorsPortalHome,
  listAdvisorsPortalNotifications,
  markAdvisorsPortalNotificationsRead,
  updateAdvisorsPortalContact,
} from "@/lib/advisors/portal.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";

export function AdvisorsPortalAccountPage() {
  const qc = useQueryClient();
  const homeFn = useServerFn(getAdvisorsPortalHome);
  const updateContact = useServerFn(updateAdvisorsPortalContact);
  const createRequest = useServerFn(createAdvisorsPortalServiceRequest);
  const listNotes = useServerFn(listAdvisorsPortalNotifications);
  const markRead = useServerFn(markAdvisorsPortalNotificationsRead);

  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [contactDirty, setContactDirty] = useState(false);
  const [requestKind, setRequestKind] = useState<"plan_change" | "cancellation">("plan_change");
  const [requestDetails, setRequestDetails] = useState("");

  const homeQuery = useQuery({
    queryKey: ["advisors-portal-home"],
    queryFn: () => homeFn(),
    retry: false,
  });
  const notesQuery = useQuery({
    queryKey: ["advisors-portal-notifications"],
    queryFn: () => listNotes(),
    retry: false,
  });

  useEffect(() => {
    if (!homeQuery.data || contactDirty) return;
    setName(homeQuery.data.client.name);
    setBusinessName(homeQuery.data.client.businessName);
    setPhone(homeQuery.data.client.phone ?? "");
  }, [homeQuery.data, contactDirty]);

  const saveM = useMutation({
    mutationFn: () =>
      updateContact({
        data: {
          name,
          businessName,
          phone: phone || undefined,
        },
      }),
    onSuccess: async () => {
      toast.success("Contact details updated");
      await qc.invalidateQueries({ queryKey: ["advisors-portal-home"] });
      setContactDirty(false);
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const requestM = useMutation({
    mutationFn: () =>
      createRequest({
        data: {
          kind: requestKind,
          details: requestDetails,
        },
      }),
    onSuccess: async () => {
      toast.success("Request sent to Advisors");
      setRequestDetails("");
      await qc.invalidateQueries({ queryKey: ["advisors-portal-notifications"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const readM = useMutation({
    mutationFn: () => markRead({ data: {} }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["advisors-portal-notifications"] });
      await qc.invalidateQueries({ queryKey: ["advisors-portal-home"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (homeQuery.isPending) return <main className="mx-auto max-w-5xl space-y-6 p-6"><PageHeader title="Account" description="Contact details and service requests." /><AdvisorsPortalSubnav /><div role="status" aria-live="polite"><LoadingState /></div></main>;
  if (homeQuery.isError) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <PageHeader title="Account" description="Contact details and service requests." />
        <AdvisorsPortalSubnav />
        <div role="alert"><ErrorState
          title="Account unavailable"
          description={friendlyAuthError(homeQuery.error)}
          onRetry={() => void homeQuery.refetch()}
        /></div>
      </main>
    );
  }

  const client = homeQuery.data.client;

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <PageHeader
        title="Account"
        description="Update permitted contact details, notifications, and plan or cancellation requests."
      />
      <AdvisorsPortalSubnav />

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-lg font-medium">Contact</h2>
        <p className="text-sm text-muted-foreground">
          Sign-in email stays {client.email}. Ask your advisor if you need that changed.
        </p>
        <form id="portal-contact-form" className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (!saveM.isPending && name.trim() && businessName.trim()) saveM.mutate(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="portal-name">Name</Label>
            <Input id="portal-name" required maxLength={200} value={name} onChange={(e) => { setName(e.target.value); setContactDirty(true); }} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="portal-business">Business</Label>
            <Input
              id="portal-business"
              required
              maxLength={200}
              value={businessName}
              onChange={(e) => { setBusinessName(e.target.value); setContactDirty(true); }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="portal-phone">Phone</Label>
            <Input id="portal-phone" type="tel" maxLength={50} value={phone} onChange={(e) => { setPhone(e.target.value); setContactDirty(true); }} />
          </div>
        </div>
        <Button type="submit" disabled={saveM.isPending || !contactDirty || !name.trim() || !businessName.trim()}>
          {saveM.isPending ? "Saving…" : "Save contact"}
        </Button>
        </form>
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">Notifications</h2>
          <Button
            variant="outline"
            size="sm"
            disabled={readM.isPending || !notesQuery.isSuccess || !notesQuery.data.some((item) => !item.readAt)}
            onClick={() => readM.mutate()}
          >
            {readM.isPending ? "Marking read…" : "Mark all read"}
          </Button>
        </div>
        {notesQuery.isPending ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Loading notifications…</p> : null}
        {notesQuery.isError ? <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{friendlyAuthError(notesQuery.error)}</p><Button type="button" variant="outline" size="sm" onClick={() => void notesQuery.refetch()}>Retry notifications</Button></div> : null}
        {notesQuery.isSuccess && notesQuery.data.length === 0 ? <p className="text-sm text-muted-foreground">No notifications yet.</p> : null}
        <ul className="space-y-2">
          {(notesQuery.data ?? []).map((item) => (
            <li key={item.id} className="rounded-md border border-border p-3 text-sm">
              <p className="font-medium">
                {item.title}
                {!item.readAt ? <span className="ml-2 text-xs text-primary">new</span> : null}
              </p>
              <p className="text-muted-foreground">{item.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <h2 className="text-lg font-medium">Plan change or cancellation</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Service request type">
          <Button
            type="button"
            aria-pressed={requestKind === "plan_change"}
            variant={requestKind === "plan_change" ? "default" : "outline"}
            size="sm"
            onClick={() => setRequestKind("plan_change")}
          >
            Plan change
          </Button>
          <Button
            type="button"
            aria-pressed={requestKind === "cancellation"}
            variant={requestKind === "cancellation" ? "default" : "outline"}
            size="sm"
            onClick={() => setRequestKind("cancellation")}
          >
            Cancellation
          </Button>
        </div>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (!requestM.isPending && requestDetails.trim().length >= 3) requestM.mutate(); }}>
        <Textarea
          required
          minLength={3}
          value={requestDetails}
          onChange={(e) => setRequestDetails(e.target.value)}
          rows={4}
          maxLength={5000}
          aria-label="Service request details"
          placeholder="Tell us what you need"
        />
        <Button
          type="submit"
          disabled={requestM.isPending || requestDetails.trim().length < 3}
        >
          {requestM.isPending ? "Submitting…" : "Submit request"}
        </Button>
        </form>
      </section>

      <p className="text-xs text-muted-foreground">{homeQuery.data.calendarOAuth.note}</p>
    </main>
  );
}

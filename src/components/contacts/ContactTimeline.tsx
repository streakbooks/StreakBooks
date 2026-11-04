import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  createContactInteraction,
  listContactInteractions,
  setContactTaskCompleted,
} from "@/lib/contacts/contact-interactions.functions";
import type {
  ContactInteractionKind,
  ContactTimelineFilter,
} from "@/lib/contacts/contact-interactions";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ErrorState, LoadingState } from "@/components/common/states";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ContactInteractionRow = {
  id: string;
  kind: ContactInteractionKind;
  title: string;
  detail: string;
  due_on: string | null;
  completed_at: string | null;
  occurred_at: string;
  created_at: string;
  created_by: string | null;
};

const KIND_LABELS: Record<ContactInteractionKind, string> = {
  note: "Note",
  call: "Call",
  email: "Email",
  meeting: "Meeting",
  task: "Follow-up task",
};

function displayDate(value: string | null): string {
  if (!value) return "No due date";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        ...(value.length === 10 ? {} : { hour: "numeric", minute: "2-digit" }),
      });
}

export function ContactTimeline({
  companyId,
  contactId,
  canManage,
}: {
  companyId: string;
  contactId: string;
  canManage: boolean;
}) {
  const qc = useQueryClient();
  const fetchActivity = useServerFn(listContactInteractions);
  const createActivity = useServerFn(createContactInteraction);
  const setTask = useServerFn(setContactTaskCompleted);

  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<ContactTimelineFilter>("all");
  const [kind, setKind] = useState<ContactInteractionKind>("note");
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [dueOn, setDueOn] = useState("");

  const query = useQuery({
    queryKey: ["contact-interactions", companyId, contactId, filter, page],
    queryFn: () => fetchActivity({ data: { companyId, contactId, page, filter } }),
  });

  const createM = useMutation({
    mutationFn: () =>
      createActivity({
        data: {
          companyId,
          contactId,
          kind,
          title,
          detail,
          dueOn: kind === "task" && dueOn ? dueOn : null,
        },
      }),
    onSuccess: async () => {
      setTitle("");
      setDetail("");
      setDueOn("");
      setPage(0);
      await qc.invalidateQueries({ queryKey: ["contact-interactions", companyId, contactId] });
      toast.success("Contact activity recorded");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const taskM = useMutation({
    mutationFn: ({ id, completed }: { id: string; completed: boolean }) =>
      setTask({ data: { companyId, contactId, activityId: id, completed } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["contact-interactions", companyId, contactId] });
      toast.success("Follow-up task updated");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const rows = (query.data?.rows ?? []) as ContactInteractionRow[];
  const total = query.data?.count ?? 0;
  const perPage = query.data?.pageSize ?? 25;

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Contact timeline</h2>
        <p className="text-sm text-muted-foreground">
          Keep notes and a dated record of calls, emails, meetings and follow-up tasks. Historical
          entries cannot be edited or deleted.
        </p>
      </div>

      {canManage ? (
        <div className="space-y-3 rounded-md border bg-card p-4">
          <h3 className="font-medium">Record an interaction</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Activity type</Label>
              <Select
                value={kind}
                onValueChange={(value) => setKind(value as ContactInteractionKind)}
              >
                <SelectTrigger aria-label="Choose interaction type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(KIND_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {kind === "task" ? (
              <div className="space-y-1">
                <Label htmlFor="contact-timeline-due">Follow-up date (optional)</Label>
                <Input
                  id="contact-timeline-due"
                  type="date"
                  value={dueOn}
                  onChange={(event) => setDueOn(event.target.value)}
                />
              </div>
            ) : null}
          </div>
          <div className="space-y-1">
            <Label htmlFor="contact-timeline-title">Subject</Label>
            <Input
              id="contact-timeline-title"
              maxLength={160}
              value={title}
              placeholder="e.g. Discussed quarterly bookkeeping"
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="contact-timeline-detail">Details (optional)</Label>
            <Textarea
              id="contact-timeline-detail"
              maxLength={4000}
              rows={3}
              value={detail}
              placeholder="Add meeting notes, a conversation summary or follow-up details"
              onChange={(event) => setDetail(event.target.value)}
            />
          </div>
          <Button disabled={!title.trim() || createM.isPending} onClick={() => createM.mutate()}>
            {createM.isPending ? "Saving…" : "Add to timeline"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Contact activity is read-only for your role.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">Activity history</h3>
        <Select
          value={filter}
          onValueChange={(value) => {
            setFilter(value as ContactTimelineFilter);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-48" aria-label="Filter contact timeline">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All interactions</SelectItem>
            <SelectItem value="open_tasks">Open tasks</SelectItem>
            <SelectItem value="completed_tasks">Completed tasks</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          title="Could not load contact activity"
          description={friendlyAuthError(query.error)}
        />
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
          No activities match this filter.
        </p>
      ) : (
        <ol className="space-y-3">
          {rows.map((activity) => (
            <li key={activity.id} className="space-y-2 rounded-md border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{KIND_LABELS[activity.kind] ?? activity.kind}</Badge>
                  <span className="font-medium">{activity.title}</span>
                  {activity.kind === "task" ? (
                    <Badge variant={activity.completed_at ? "neutral" : "secondary"}>
                      {activity.completed_at ? "Completed" : "Open"}
                    </Badge>
                  ) : null}
                </div>
                <time className="text-xs text-muted-foreground" dateTime={activity.occurred_at}>
                  {displayDate(activity.occurred_at)}
                </time>
              </div>
              {activity.detail ? (
                <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
                  {activity.detail}
                </p>
              ) : null}
              {activity.kind === "task" ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {activity.completed_at
                      ? `Completed ${displayDate(activity.completed_at)}`
                      : `Due: ${displayDate(activity.due_on)}`}
                  </p>
                  {canManage ? (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={taskM.isPending}
                      onClick={() =>
                        taskM.mutate({
                          id: activity.id,
                          completed: !activity.completed_at,
                        })
                      }
                    >
                      {activity.completed_at ? "Reopen task" : "Mark complete"}
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ol>
      )}

      {total > perPage || page > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {total === 0 ? 0 : page * perPage + 1}–{Math.min((page + 1) * perPage, total)} of{" "}
            {total} activities
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page === 0 || query.isFetching}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={(page + 1) * perPage >= total || query.isFetching}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

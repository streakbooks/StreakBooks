import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BellRing, CalendarClock } from "lucide-react";
import { listContactFollowUps } from "@/lib/contacts/contact-interactions.functions";
import type { ContactFollowUpScope } from "@/lib/contacts/contact-interactions";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FollowUpRow = {
  id: string;
  title: string;
  contact_id: string;
  contact_name: string;
  due_on: string | null;
  remind_on: string | null;
  assigned_to: string | null;
};

function reminderStatus(
  row: FollowUpRow,
  today: string,
): {
  label: string;
  overdue: boolean;
} {
  if (row.due_on && row.due_on < today) return { label: "Overdue", overdue: true };
  if (row.due_on === today) return { label: "Due today", overdue: false };
  if (row.remind_on && row.remind_on <= today) {
    return { label: "Reminder due", overdue: false };
  }
  return { label: "Coming up", overdue: false };
}

export function ContactFollowUpsPanel({ companyId }: { companyId: string }) {
  const fetchFollowUps = useServerFn(listContactFollowUps);
  const [scope, setScope] = useState<ContactFollowUpScope>("mine");
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["contact-followups", companyId, scope, page],
    queryFn: () => fetchFollowUps({ data: { companyId, scope, page } }),
    refetchInterval: 60_000,
  });

  const tasks = (query.data?.rows ?? []) as FollowUpRow[];
  const today = query.data?.today ?? "";
  const count = query.data?.count ?? 0;
  const pageSize = query.data?.pageSize ?? 25;

  return (
    <section className="rounded-lg border bg-card p-4" aria-label="Contact follow-up reminders">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 font-semibold">
            <BellRing className="size-4" />
            Contact follow-ups
          </h2>
          <p className="text-xs text-muted-foreground">
            In-app reminders for overdue tasks, tasks due within seven days and reminders due today.
            Updates while this page is open.
          </p>
        </div>
        <Select
          value={scope}
          onValueChange={(value) => {
            setScope(value as ContactFollowUpScope);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-44" aria-label="Choose follow-up owner scope">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mine">Assigned to me</SelectItem>
            <SelectItem value="team">Whole team</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {query.isPending ? (
        <p className="py-4 text-sm text-muted-foreground">Loading follow-up reminders…</p>
      ) : query.isError ? (
        <QueryErrorState queries={[query]} title="Could not load follow-ups" />
      ) : tasks.length === 0 ? (
        <p className="py-4 text-sm text-muted-foreground">
          No matching tasks need a reminder in this period.
        </p>
      ) : (
        <ul className="mt-4 divide-y">
          {tasks.map((task) => {
            const status = reminderStatus(task, today);
            return (
              <li key={task.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={status.overdue ? "destructive" : "secondary"}>
                      {status.label}
                    </Badge>
                    <span className="text-sm font-medium">{task.title}</span>
                  </div>
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{task.contact_name}</span>
                    {task.due_on ? (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3" />
                        Due {task.due_on}
                      </span>
                    ) : null}
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link
                    to="/contacts/$contactId"
                    params={{ contactId: task.contact_id }}
                    search={{ tab: "timeline" }}
                  >
                    Open task
                  </Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {count > pageSize || page > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span>
            {count ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, count)} of {count}{" "}
            follow-ups
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0 || query.isFetching}
              onClick={() => setPage((value) => Math.max(0, value - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={(page + 1) * pageSize >= count || query.isFetching}
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

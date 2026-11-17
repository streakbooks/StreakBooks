import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CrmActivity } from "@/lib/crm/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Read-only monthly meeting calendar backed by actual CRM activity records.
 * The calendar never implies Google/Outlook calendar sync or live availability.
 */
export function CrmMeetingCalendar({
  activities,
  month,
  onMonthChange,
}: {
  activities: CrmActivity[];
  month: Date;
  onMonthChange: (next: Date) => void;
}) {
  const [selectedDay, setSelectedDay] = useState(() => new Date().getDate());

  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const count = new Date(year, monthIndex + 1, 0).getDate();
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7;
  const slots = Array.from({ length: Math.ceil((offset + count) / 7) * 7 }, (_, i) => {
    const day = i - offset + 1;
    return day >= 1 && day <= count ? day : null;
  });

  const byDay = useMemo(() => {
    const result = new Map<string, CrmActivity[]>();
    for (const meeting of activities) {
      if (meeting.kind !== "meeting" || !meeting.dueAt) continue;
      const date = new Date(meeting.dueAt);
      if (Number.isNaN(date.getTime())) continue;
      const key = localDateKey(date);
      result.set(key, [...(result.get(key) ?? []), meeting]);
    }
    return result;
  }, [activities]);

  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const selected = new Date(year, monthIndex, selectedDay);
  const selectedKey = localDateKey(selected);
  const selectedMeetings = byDay.get(selectedKey) ?? [];

  const moveMonth = (direction: number) => {
    onMonthChange(new Date(year, monthIndex + direction, 1));
    setSelectedDay(1);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <CardTitle>Meeting calendar</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            CRM meetings in your browser's local timezone. Provider calendar sync is not enabled.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => moveMonth(-1)}
            aria-label="Previous month"
          >
            Previous
          </Button>
          <span className="min-w-28 text-center text-sm font-semibold" aria-live="polite">
            {monthLabel}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => moveMonth(1)}
            aria-label="Next month"
          >
            Next
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-7 gap-1" aria-label={monthLabel}>
          {WEEKDAYS.map((day) => (
            <span
              key={day}
              className="py-1 text-center text-xs font-semibold text-muted-foreground"
            >
              {day}
            </span>
          ))}
          {slots.map((day, index) => {
            if (day === null) return <span key={`blank-${index}`} aria-hidden="true" />;
            const dateKey = localDateKey(new Date(year, monthIndex, day));
            const total = (byDay.get(dateKey) ?? []).length;
            const active = selectedDay === day;
            return (
              <button
                key={dateKey}
                type="button"
                aria-pressed={active}
                aria-label={`${day} ${monthLabel}, ${total} meeting${total === 1 ? "" : "s"}`}
                onClick={() => setSelectedDay(day)}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border p-1 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none ${active ? "border-primary bg-primary/10 text-primary" : "border-border/60 hover:bg-muted"}`}
              >
                <span className="tabular-nums">{day}</span>
                {total > 0 ? (
                  <span className="rounded-full bg-primary/10 px-2 text-xs font-semibold tabular-nums text-primary">
                    {total}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <section aria-live="polite" className="rounded-xl border border-border/70 bg-muted/20 p-3">
          <h3 className="text-sm font-semibold">
            {selected.toLocaleDateString(undefined, {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </h3>
          {selectedMeetings.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">
              No loaded CRM meetings on this date.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {selectedMeetings.map((meeting) => (
                <li
                  key={meeting.id}
                  className="flex flex-wrap justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-sm"
                >
                  <span className="font-medium">{meeting.subject}</span>
                  <span className="text-muted-foreground">
                    {meeting.dueAt
                      ? new Date(meeting.dueAt).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "—"}{" "}
                    · {meeting.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <p className="text-xs text-muted-foreground">
          Meetings come from the selected month (up to 500 records). Very large months require
          additional pagination.
        </p>
      </CardContent>
    </Card>
  );
}

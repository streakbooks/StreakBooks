import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { detectCustomerTimeZone, formatSlotLabel } from "@/lib/advisors/booking-slots";
import {
  bookAdvisorAppointment,
  listAdvisorAvailableSlots,
} from "@/lib/advisors/booking.functions";
import { isAdvisorServiceCode, type AdvisorServiceCode } from "@/lib/advisors/catalogue";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { QueryErrorState } from "@/components/common/QueryErrorState";

function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `book-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AdvisorsBookingPage({
  serviceCode,
  planCode,
}: {
  serviceCode?: string;
  planCode?: string;
}) {
  const timezone = useMemo(() => detectCustomerTimeZone(), []);
  const listSlots = useServerFn(listAdvisorAvailableSlots);
  const book = useServerFn(bookAdvisorAppointment);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>(() => {
    const day = new Date();
    day.setDate(day.getDate() + 2);
    return day;
  });
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmation, setConfirmation] = useState<{
    manageToken: string;
    startsAt: string;
    message: string;
  } | null>(null);

  const dayKey = selectedDay ? toDayKey(selectedDay) : "";
  const slotsQ = useQuery({
    queryKey: ["advisors-slots", dayKey, timezone],
    enabled: Boolean(dayKey),
    queryFn: () =>
      listSlots({
        data: {
          day: dayKey,
          customerTimezone: timezone,
        },
      }),
    retry: false,
  });

  const bookM = useMutation({
    mutationFn: () =>
      book({
        data: {
          startsAt: selectedSlot,
          customerTimezone: timezone,
          customerName: name,
          customerEmail: email,
          businessName: businessName || undefined,
          customerPhone: phone || undefined,
          notes: notes || undefined,
          serviceCode: isAdvisorServiceCode(serviceCode ?? "")
            ? (serviceCode as AdvisorServiceCode)
            : undefined,
          planCode: planCode || undefined,
          idempotencyKey: newIdempotencyKey(),
        },
      }),
    onSuccess: (result) => {
      setConfirmation({
        manageToken: result.manageToken,
        startsAt: result.startsAt,
        message: result.message,
      });
      toast.success("Consultation booked");
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (confirmation) {
    return (
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-12">
        <h1 className="text-3xl font-semibold">Consultation confirmed</h1>
        <p className="text-muted-foreground">
          {formatSlotLabel(new Date(confirmation.startsAt), timezone)} ({timezone})
        </p>
        <p className="text-sm text-muted-foreground">{confirmation.message}</p>
        <p className="text-sm">Save your secure manage link to reschedule or cancel:</p>
        <code className="block overflow-x-auto rounded-md bg-muted p-3 text-xs">
          /advisors/manage/{confirmation.manageToken}
        </code>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link
              to="/advisors/manage/$manageToken"
              params={{ manageToken: confirmation.manageToken }}
            >
              Manage appointment
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/advisors">Back to Advisors</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <header className="space-y-2">
        <p className="text-sm font-semibold tracking-[0.16em] text-primary uppercase">
          StreakBooks Advisors
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Book a free consultation</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          30-minute initial consultation. Times are shown in your detected timezone ({timezone}).
          Only real available slots are listed.
          {serviceCode ? ` Selected service: ${serviceCode}.` : ""}
          {planCode ? ` Selected plan: ${planCode}.` : ""}
        </p>
      </header>

      <div className="grid gap-8 lg:grid-cols-[auto_1fr]">
        <section className="rounded-2xl border border-border/70 p-3 shadow-card">
          <Calendar
            mode="single"
            selected={selectedDay}
            onSelect={(day) => {
              setSelectedDay(day);
              setSelectedSlot("");
            }}
            disabled={{ before: new Date() }}
          />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Available times</h2>
          {slotsQ.isLoading || slotsQ.isPending ? (
            <p className="text-sm text-muted-foreground">Loading slots…</p>
          ) : slotsQ.isError ? (
            <QueryErrorState queries={[slotsQ]} title="Could not load available slots" />
          ) : !slotsQ.isSuccess ? (
            <p className="text-sm text-muted-foreground">Loading slots…</p>
          ) : (
            <>
              {slotsQ.data && !slotsQ.data.ready ? (
                <p className="text-sm text-muted-foreground">{slotsQ.data.reason}</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {(slotsQ.data?.slots ?? []).map((slot) => (
                  <Button
                    key={slot.startsAt}
                    type="button"
                    size="sm"
                    variant={selectedSlot === slot.startsAt ? "default" : "outline"}
                    onClick={() => setSelectedSlot(slot.startsAt)}
                  >
                    {formatSlotLabel(new Date(slot.startsAt), timezone)}
                  </Button>
                ))}
              </div>
              {slotsQ.data?.ready && (slotsQ.data.slots ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No open slots on this day.</p>
              ) : null}
            </>
          )}

          {slotsQ.isSuccess ? (
          <form
            className="grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedSlot) {
                toast.error("Choose an available time slot.");
                return;
              }
              bookM.mutate();
            }}
          >
            <div className="space-y-1 sm:col-span-1">
              <Label htmlFor="booking-name">Your name</Label>
              <Input
                id="booking-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="booking-email">Email</Label>
              <Input
                id="booking-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="booking-business">Business name</Label>
              <Input
                id="booking-business"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="booking-phone">Phone (optional)</Label>
              <Input id="booking-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="booking-notes">Notes (optional)</Label>
              <Textarea
                id="booking-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Button
                type="submit"
                disabled={
                  bookM.isPending || !slotsQ.isSuccess || slotsQ.isError || !selectedSlot
                }
              >
                Confirm free consultation
              </Button>
            </div>
          </form>
          ) : null}
        </section>
      </div>
    </main>
  );
}

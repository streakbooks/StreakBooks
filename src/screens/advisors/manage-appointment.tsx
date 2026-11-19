import { useState } from "react";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import {
  cancelAdvisorAppointment,
  getAdvisorAppointment,
  listAdvisorAvailableSlots,
  rescheduleAdvisorAppointment,
} from "@/lib/advisors/booking.functions";
import { detectCustomerTimeZone, formatSlotLabel } from "@/lib/advisors/booking-slots";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { LoadingState } from "@/components/common/states";

function toDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function AdvisorsManageAppointmentPage({ manageToken }: { manageToken: string }) {
  const timezone = detectCustomerTimeZone();
  const qc = useQueryClient();
  const load = useServerFn(getAdvisorAppointment);
  const cancel = useServerFn(cancelAdvisorAppointment);
  const reschedule = useServerFn(rescheduleAdvisorAppointment);
  const listSlots = useServerFn(listAdvisorAvailableSlots);
  const [selectedDay, setSelectedDay] = useState<Date | undefined>();
  const [selectedSlot, setSelectedSlot] = useState("");

  const appointmentQ = useQuery({
    queryKey: ["advisors-appointment", manageToken],
    queryFn: () => load({ data: { manageToken } }),
    retry: false,
  });

  const dayKey = selectedDay ? toDayKey(selectedDay) : "";
  const slotsQ = useQuery({
    queryKey: ["advisors-slots-manage", dayKey, timezone],
    enabled: Boolean(dayKey),
    queryFn: () => listSlots({ data: { day: dayKey, customerTimezone: timezone } }),
    retry: false,
  });

  const cancelM = useMutation({
    mutationFn: () => cancel({ data: { manageToken, reason: "Customer cancelled" } }),
    onSuccess: async () => {
      toast.success("Appointment cancelled");
      await qc.invalidateQueries({ queryKey: ["advisors-appointment", manageToken] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const rescheduleM = useMutation({
    mutationFn: () =>
      reschedule({
        data: {
          manageToken,
          startsAt: selectedSlot,
          idempotencyKey: `reschedule-${manageToken}-${selectedSlot}`,
        },
      }),
    onSuccess: async (result) => {
      toast.success("Appointment rescheduled");
      const token = result.manageToken || manageToken;
      window.location.href = `/advisors/manage/${token}`;
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (appointmentQ.isPending) return <LoadingState />;
  if (appointmentQ.isError) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <QueryErrorState queries={[appointmentQ]} title="Appointment unavailable" />
      </main>
    );
  }

  const appt = appointmentQ.data;
  const startsAt = appt.startsAt;
  const status = appt.status;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <h1 className="text-3xl font-semibold">Manage consultation</h1>
      <p className="text-sm text-muted-foreground">
        Status: <strong>{status}</strong>
      </p>
      <p>
        {startsAt ? formatSlotLabel(new Date(startsAt), timezone) : "—"} ({timezone})
      </p>
      <p className="text-sm text-muted-foreground">
        {appt.customerName} · {appt.customerEmail}
      </p>

      {status === "confirmed" || status === "rescheduled" ? (
        <>
          <Button
            type="button"
            variant="destructive"
            disabled={cancelM.isPending}
            onClick={() => {
              if (window.confirm("Cancel this consultation?")) cancelM.mutate();
            }}
          >
            Cancel appointment
          </Button>

          <section className="space-y-3 rounded-xl border border-border/70 p-4">
            <h2 className="text-lg font-semibold">Reschedule</h2>
            <Calendar
              mode="single"
              selected={selectedDay}
              onSelect={(day) => {
                setSelectedDay(day);
                setSelectedSlot("");
              }}
              disabled={{ before: new Date() }}
            />
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
            <div className="space-y-1">
              <Label htmlFor="reschedule-slot">Selected slot (ISO)</Label>
              <Input id="reschedule-slot" value={selectedSlot} readOnly />
            </div>
            <Button
              type="button"
              disabled={!selectedSlot || rescheduleM.isPending}
              onClick={() => rescheduleM.mutate()}
            >
              Confirm reschedule
            </Button>
          </section>
        </>
      ) : null}

      <Button asChild variant="outline">
        <Link to="/advisors">Back to Advisors</Link>
      </Button>
    </main>
  );
}

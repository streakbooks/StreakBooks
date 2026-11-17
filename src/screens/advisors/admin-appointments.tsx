import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdvisorsSubnav } from "@/components/advisors/AdvisorsSubnav";
import { ErrorState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addAdvisorsAvailabilityException,
  getAdvisorsBookingAdmin,
  saveAdvisorsBookingSettings,
  setAdvisorsAppointmentStatus,
} from "@/lib/advisors/booking-admin.functions";
import { friendlyAuthError } from "@/lib/auth-helpers";

type AppointmentRow = {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  customerName: string;
  customerEmail: string;
  businessName: string;
  serviceCode: string | null;
};

export function AdvisorsAdminAppointmentsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getAdvisorsBookingAdmin);
  const saveSettings = useServerFn(saveAdvisorsBookingSettings);
  const addException = useServerFn(addAdvisorsAvailabilityException);
  const setStatus = useServerFn(setAdvisorsAppointmentStatus);
  const query = useQuery({
    queryKey: ["advisors-booking-admin"],
    queryFn: () => load(),
    retry: false,
  });
  const [reason, setReason] = useState("");
  const [consultationMinutes, setConsultationMinutes] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(15);
  const [noticeHours, setNoticeHours] = useState(24);
  const [maxDaily, setMaxDaily] = useState(8);
  const [timezone, setTimezone] = useState("UTC");
  const [exceptionStart, setExceptionStart] = useState("");
  const [exceptionEnd, setExceptionEnd] = useState("");
  const [exceptionLabel, setExceptionLabel] = useState("");

  useEffect(() => {
    if (!query.data) return;
    const settings = query.data.settings;
    const advisor = query.data.advisor;
    if (settings) {
      setConsultationMinutes(settings.consultationMinutes);
      setBufferMinutes(settings.bufferMinutes);
      setNoticeHours(settings.noticeHours);
      setMaxDaily(settings.maxDailyAppointments);
    }
    if (advisor) setTimezone(advisor.timezone);
  }, [query.data]);

  const saveM = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          reason,
          payload: {
            timezone,
            consultationMinutes,
            bufferMinutes,
            noticeHours,
            maxDailyAppointments: maxDaily,
            workingHours: [1, 2, 3, 4, 5].map((weekday) => ({
              weekday,
              startMinute: 9 * 60,
              endMinute: 17 * 60,
            })),
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Booking settings saved");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["advisors-booking-admin"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const exceptionM = useMutation({
    mutationFn: () =>
      addException({
        data: {
          kind: "unavailable",
          startsAt: new Date(exceptionStart).toISOString(),
          endsAt: new Date(exceptionEnd).toISOString(),
          label: exceptionLabel,
          reason,
        },
      }),
    onSuccess: async () => {
      toast.success("Unavailable period added");
      setReason("");
      await qc.invalidateQueries({ queryKey: ["advisors-booking-admin"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  const statusM = useMutation({
    mutationFn: (input: { id: string; status: "cancelled" | "completed" | "no_show" }) =>
      setStatus({
        data: {
          appointmentId: input.id,
          status: input.status,
          reason: reason || `Marked ${input.status}`,
        },
      }),
    onSuccess: async () => {
      toast.success("Appointment updated");
      await qc.invalidateQueries({ queryKey: ["advisors-booking-admin"] });
    },
    onError: (error) => toast.error(friendlyAuthError(error)),
  });

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return (
      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <ListWorkspace title="Appointments" description="Advisor calendar and booking controls.">
          <ErrorState
            title="Booking admin unavailable"
            description={friendlyAuthError(query.error)}
            onRetry={() => void query.refetch()}
          />
        </ListWorkspace>
      </main>
    );
  }

  const appointments = query.data.appointments as AppointmentRow[];

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6">
      <ListWorkspace
        title="Appointments"
        description="Configure working hours, buffers and manage consultation bookings. Availability is computed from real calendar rules."
        subnav={<AdvisorsSubnav />}
      >
        <section className="grid gap-3 rounded-xl border border-border/70 p-4 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="booking-reason">Change reason</Label>
            <Input
              id="booking-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Why are you changing availability?"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="advisor-tz">Advisor timezone</Label>
            <Input id="advisor-tz" value={timezone} onChange={(e) => setTimezone(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="consult-mins">Consultation minutes</Label>
            <Input
              id="consult-mins"
              type="number"
              value={consultationMinutes}
              onChange={(e) => setConsultationMinutes(Number(e.target.value) || 30)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="buffer-mins">Buffer minutes</Label>
            <Input
              id="buffer-mins"
              type="number"
              value={bufferMinutes}
              onChange={(e) => setBufferMinutes(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="notice-hours">Booking notice (hours)</Label>
            <Input
              id="notice-hours"
              type="number"
              value={noticeHours}
              onChange={(e) => setNoticeHours(Number(e.target.value) || 0)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="max-daily">Maximum daily appointments</Label>
            <Input
              id="max-daily"
              type="number"
              value={maxDaily}
              onChange={(e) => setMaxDaily(Number(e.target.value) || 1)}
            />
          </div>
          <div className="sm:col-span-2">
            <Button
              type="button"
              disabled={saveM.isPending || reason.trim().length < 3}
              onClick={() => saveM.mutate()}
            >
              Save availability settings
            </Button>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-border/70 p-4">
          <h2 className="text-lg font-semibold">Add unavailable period</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="ex-start">Starts at</Label>
              <Input
                id="ex-start"
                type="datetime-local"
                value={exceptionStart}
                onChange={(e) => setExceptionStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ex-end">Ends at</Label>
              <Input
                id="ex-end"
                type="datetime-local"
                value={exceptionEnd}
                onChange={(e) => setExceptionEnd(e.target.value)}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="ex-label">Label</Label>
              <Input
                id="ex-label"
                value={exceptionLabel}
                onChange={(e) => setExceptionLabel(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={
              exceptionM.isPending || reason.trim().length < 3 || !exceptionStart || !exceptionEnd
            }
            onClick={() => exceptionM.mutate()}
          >
            Add exception
          </Button>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Upcoming and recent appointments</h2>
          {appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No appointments yet.</p>
          ) : (
            <ul className="space-y-2">
              {appointments.map((appointment) => (
                <li
                  key={appointment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {appointment.customerName} · {appointment.status}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(appointment.startsAt).toISOString()} · {appointment.customerEmail}
                      {appointment.serviceCode ? ` · ${appointment.serviceCode}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => statusM.mutate({ id: appointment.id, status: "completed" })}
                    >
                      Completed
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => statusM.mutate({ id: appointment.id, status: "no_show" })}
                    >
                      No-show
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => statusM.mutate({ id: appointment.id, status: "cancelled" })}
                    >
                      Cancel
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </ListWorkspace>
    </main>
  );
}

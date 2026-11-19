import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { HrSubnav } from "@/components/hr/HrSubnav";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { StatusBadge } from "@/components/common/StatusBadge";
import { TableCard } from "@/components/common/table-card";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  listHrHolidayCalendars,
  upsertHrHoliday,
  upsertHrHolidayCalendar,
} from "@/lib/hr/time.functions";

export function HrHolidaysPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("hr.view");
  const canManage = useCanDo("hr.leave.manage");
  const queryClient = useQueryClient();

  const fetchCalendars = useServerFn(listHrHolidayCalendars);
  const saveCalendar = useServerFn(upsertHrHolidayCalendar);
  const saveHoliday = useServerFn(upsertHrHoliday);

  const [calOpen, setCalOpen] = useState(false);
  const [holOpen, setHolOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [isDefault, setIsDefault] = useState("no");
  const [calendarId, setCalendarId] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [isOptional, setIsOptional] = useState("no");

  const dataQ = useQuery({
    queryKey: ["hr-holiday-calendars", company?.id],
    queryFn: () => fetchCalendars({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
    retry: false,
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["hr-holiday-calendars", company?.id] });
  };

  const saveCalM = useMutation({
    mutationFn: () =>
      saveCalendar({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            code: code.trim(),
            name: name.trim(),
            locationId: null,
            isDefault: isDefault === "yes",
            isActive: true,
            notes: null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Holiday calendar saved");
      setCalOpen(false);
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  const saveHolM = useMutation({
    mutationFn: () =>
      saveHoliday({
        data: {
          companyId: company!.id,
          payload: {
            id: null,
            calendarId,
            holidayDate,
            name: holidayName.trim(),
            isOptional: isOptional === "yes",
            notes: null,
          },
        },
      }),
    onSuccess: async () => {
      toast.success("Holiday saved");
      setHolOpen(false);
      await invalidate();
    },
    onError: (err) => toast.error(friendlyAuthError(err)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <ListWorkspace
        title="Holidays & Calendar"
        breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Holidays & Calendar" }]}
        subnav={<HrSubnav current="holidays" />}
      >
        <EmptyState title="No access" description="You need hr.view to open holidays." />
      </ListWorkspace>
    );
  }

  const calendars = dataQ.data?.calendars ?? [];
  const holidays = dataQ.data?.holidays ?? [];
  const activeCalendars = calendars.filter((c) => c.isActive);

  return (
    <ListWorkspace
      title="Holidays & Calendar"
      description="Company and location holiday calendars for leave and attendance planning."
      breadcrumbs={[{ label: "HR", to: "/hr" }, { label: "Holidays & Calendar" }]}
      actions={
        canManage ? (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCalendarId(activeCalendars[0]?.id ?? "");
                setHolidayDate("");
                setHolidayName("");
                setIsOptional("no");
                setHolOpen(true);
              }}
            >
              Add holiday
            </Button>
            <Button
              type="button"
              onClick={() => {
                setCode("");
                setName("");
                setIsDefault(calendars.length === 0 ? "yes" : "no");
                setCalOpen(true);
              }}
            >
              New calendar
            </Button>
          </div>
        ) : undefined
      }
      subnav={<HrSubnav current="holidays" />}
    >
      <section className="mb-8 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Calendars
        </h2>
        {dataQ.isPending ? (
          <LoadingState />
        ) : dataQ.isError ? (
          <ErrorState
            title="Could not load holiday calendars"
            description={friendlyAuthError(dataQ.error)}
            onRetry={() => void dataQ.refetch()}
          />
        ) : calendars.length === 0 ? (
          <EmptyState
            title="No holiday calendars"
            description="Create a default calendar, then add public holidays."
            action={
              canManage ? (
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    setCode("");
                    setName("");
                    setIsDefault(calendars.length === 0 ? "yes" : "no");
                    setCalOpen(true);
                  }}
                >
                  New calendar
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Holidays</TableHead>
                  <TableHead>Default</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {calendars.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.code}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.holidayCount}</TableCell>
                    <TableCell>{row.isDefault ? "Yes" : "No"}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.isActive ? "active" : "inactive"} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Holidays
        </h2>
        {holidays.length === 0 ? (
          <EmptyState
            title="No holidays listed"
            description="Add dated holidays to an active calendar."
            action={
              canManage && activeCalendars.length > 0 ? (
                <Button
                  size="sm"
                  type="button"
                  onClick={() => {
                    setCalendarId(activeCalendars[0]?.id ?? "");
                    setHolidayDate("");
                    setHolidayName("");
                    setIsOptional("no");
                    setHolOpen(true);
                  }}
                >
                  Add holiday
                </Button>
              ) : canManage ? (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setCode("");
                    setName("");
                    setIsDefault("yes");
                    setCalOpen(true);
                  }}
                >
                  New calendar first
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableCard>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Calendar</TableHead>
                  <TableHead>Optional</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holidays.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.holidayDate}</TableCell>
                    <TableCell>{row.name}</TableCell>
                    <TableCell>{row.calendarCode}</TableCell>
                    <TableCell>{row.isOptional ? "Yes" : "No"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </section>

      <Dialog open={calOpen} onOpenChange={setCalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New holiday calendar</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="HQ" />
            </div>
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Headquarters calendar"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Default calendar</Label>
              <Select value={isDefault} onValueChange={setIsDefault}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!code.trim() || !name.trim() || saveCalM.isPending}
              onClick={() => saveCalM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={holOpen} onOpenChange={setHolOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add holiday</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Calendar</Label>
              <RecordLookupSelect value={calendarId} onValueChange={setCalendarId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select calendar" />
                </SelectTrigger>
                <SelectContent>
                  {activeCalendars.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </RecordLookupSelect>
            </div>
            <div className="grid gap-1.5">
              <Label>Date</Label>
              <Input
                type="date"
                value={holidayDate}
                onChange={(e) => setHolidayDate(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Name</Label>
              <Input
                value={holidayName}
                onChange={(e) => setHolidayName(e.target.value)}
                placeholder="Independence Day"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Optional</Label>
              <Select value={isOptional} onValueChange={setIsOptional}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setHolOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!calendarId || !holidayDate || !holidayName.trim() || saveHolM.isPending}
              onClick={() => saveHolM.mutate()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListWorkspace>
  );
}

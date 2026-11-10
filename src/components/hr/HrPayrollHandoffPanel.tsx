import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/states";
import { TableCard } from "@/components/common/table-card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCanDo } from "@/hooks/use-can";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { supabase } from "@/integrations/supabase/client";
import {
  applyHrCompensationHandoff,
  applyHrOffboardingHandoff,
  listHrPayrollHandoffs,
} from "@/lib/hr/integrations.functions";

export function HrPayrollHandoffPanel({ companyId }: { companyId: string }) {
  const canPayroll = useCanDo("payroll.employees.manage");
  const qc = useQueryClient();
  const fetch = useServerFn(listHrPayrollHandoffs);
  const applyComp = useServerFn(applyHrCompensationHandoff);
  const applyExit = useServerFn(applyHrOffboardingHandoff);
  const [componentByChange, setComponentByChange] = useState<Record<string, string>>({});

  const handoffQ = useQuery({
    queryKey: ["hr-payroll-handoffs", companyId],
    queryFn: () => fetch({ data: { companyId } }),
    enabled: Boolean(companyId) && canPayroll,
    retry: false,
  });
  const componentsQ = useQuery({
    queryKey: ["payroll-components-hr-handoff", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payroll_component_types" as never)
        .select("id, code, name" as never)
        .eq("company_id" as never, companyId as never)
        .order("name" as never);
      if (error) throw error;
      return (data as unknown as Array<{ id: string; code: string; name: string }>) ?? [];
    },
    enabled: Boolean(companyId) && canPayroll,
    retry: false,
  });

  const inv = async () => {
    await qc.invalidateQueries({ queryKey: ["hr-payroll-handoffs", companyId] });
    await qc.invalidateQueries({ queryKey: ["hr-comp", companyId] });
    await qc.invalidateQueries({ queryKey: ["hr-offboarding", companyId] });
    await qc.invalidateQueries({ queryKey: ["hr-dashboard-kpis", companyId] });
  };

  const applyCompM = useMutation({
    mutationFn: (args: { changeId: string; componentTypeId: string }) =>
      applyComp({ data: { companyId, changeId: args.changeId, componentTypeId: args.componentTypeId } }),
    onSuccess: async () => { toast.success("Compensation applied in Payroll"); await inv(); },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });
  const applyExitM = useMutation({
    mutationFn: (caseId: string) => applyExit({ data: { companyId, caseId } }),
    onSuccess: async () => { toast.success("Employee terminated via Payroll handoff"); await inv(); },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (!canPayroll) return null;

  const compensation = handoffQ.data?.compensation ?? [];
  const offboarding = handoffQ.data?.offboarding ?? [];
  const components = componentsQ.data ?? [];

  return (
    <section className="mt-8 space-y-4 rounded-lg border p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Payroll handoffs</h2>
        <p className="text-sm text-muted-foreground">Apply approved HR proposals. Finalized pay runs are never mutated.</p>
      </div>
      {handoffQ.isPending ? <LoadingState /> : handoffQ.isError ? (
        <ErrorState title="Could not load handoffs" description={friendlyAuthError(handoffQ.error)} onRetry={() => void handoffQ.refetch()} />
      ) : compensation.length === 0 && offboarding.length === 0 ? (
        <EmptyState title="No open Payroll handoffs" description="Approved compensation and ready offboarding cases appear here." />
      ) : (
        <>
          {compensation.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Compensation</h3>
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Component</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compensation.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.employeeName ?? "—"}</TableCell>
                        <TableCell>{row.effectiveOn}</TableCell>
                        <TableCell>{row.currencyCode} {row.proposedAmount}</TableCell>
                        <TableCell>
                          <div className="grid gap-1.5">
                            <Label className="sr-only">Component</Label>
                            <Select
                              value={componentByChange[row.id] ?? ""}
                              onValueChange={(v) => setComponentByChange((prev) => ({ ...prev, [row.id]: v }))}
                            >
                              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Select component" /></SelectTrigger>
                              <SelectContent>
                                {components.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            size="sm"
                            disabled={!componentByChange[row.id] || applyCompM.isPending}
                            onClick={() => applyCompM.mutate({ changeId: row.id, componentTypeId: componentByChange[row.id]! })}
                          >
                            Apply
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>
            </div>
          ) : null}
          {offboarding.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-medium">Offboarding terminations</h3>
              <TableCard>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Case</TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Last day</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {offboarding.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>{row.caseNumber}</TableCell>
                        <TableCell>{row.employeeName ?? "—"}</TableCell>
                        <TableCell>{row.lastWorkingDay}</TableCell>
                        <TableCell className="text-right">
                          <Button type="button" size="sm" disabled={applyExitM.isPending} onClick={() => applyExitM.mutate(row.id)}>
                            Terminate in Payroll
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableCard>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
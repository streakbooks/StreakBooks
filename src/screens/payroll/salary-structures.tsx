import { RecordLookupSelect } from "@/components/lookup/RecordLookupSelect";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { useActiveCompany } from "@/hooks/use-active-company";
import { useCanDo } from "@/hooks/use-can";
import { useFormat } from "@/hooks/use-format";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import {
  parseSalaryStructureDraft,
  type SalaryStructureDraft,
  type SalaryStructureLineDraft,
} from "@/lib/payroll/employee-draft";
import {
  listPayrollSalaryStructures,
  savePayrollSalaryStructure,
} from "@/lib/payroll/employees.functions";
import { getPayrollSettingsPage } from "@/lib/payroll/payroll.functions";
import type { PayrollSalaryStructureRow } from "@/lib/payroll/types";
import { PayrollSubnav } from "@/components/payroll/PayrollSubnav";
import { bpsToPercentString } from "@/components/sales/sales-form-utils";
import { CompanyEmptyState } from "@/components/common/company-empty";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { EmptyState, LoadingState } from "@/components/common/states";
import { ListWorkspace } from "@/components/workspace/ListWorkspace";
import { TableCard } from "@/components/common/table-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

function emptyStructureDraft(): SalaryStructureDraft {
  return { name: "", description: "", isActive: true, lines: [] };
}

function linesForStructure(
  structureId: string,
  allLines: {
    structure_id: string;
    component_type_id: string;
    amount_minor: number;
    rate_minor: number;
    percentage_bps: number;
    is_recurring: boolean;
    sort_order: number;
  }[],
  currency: string,
): SalaryStructureLineDraft[] {
  return allLines
    .filter((l) => l.structure_id === structureId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => ({
      componentTypeId: l.component_type_id,
      amount: fromMinorUnits(l.amount_minor, currency),
      rate: fromMinorUnits(l.rate_minor, currency),
      percentage: bpsToPercentString(l.percentage_bps),
      isRecurring: l.is_recurring,
      sortOrder: String(l.sort_order),
    }));
}

export function PayrollSalaryStructuresPage() {
  const { company, isPending } = useActiveCompany();
  const canView = useCanDo("payroll.view");
  const canManage = useCanDo("payroll.employees.manage");
  const fmt = useFormat();
  const queryClient = useQueryClient();
  const fetchStructures = useServerFn(listPayrollSalaryStructures);
  const fetchSettings = useServerFn(getPayrollSettingsPage);
  const saveStructure = useServerFn(savePayrollSalaryStructure);

  const settingsQ = useQuery({
    queryKey: ["payroll-settings-page", company?.id],
    queryFn: () => fetchSettings({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
  });

  const listQ = useQuery({
    queryKey: ["payroll-salary-structures", company?.id],
    queryFn: () => fetchStructures({ data: { companyId: company!.id } }),
    enabled: Boolean(company?.id) && canView,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SalaryStructureDraft>(emptyStructureDraft());

  const currency =
    settingsQ.data?.settings?.payroll_currency ??
    settingsQ.data?.company.base_currency ??
    company?.base_currency ??
    "USD";

  const components = settingsQ.data?.components.filter((c) => c.is_active) ?? [];

  useEffect(() => {
    if (!listQ.data?.available) return;
    if (selectedId === "new") return;
    const structures = listQ.data.structures;
    const pick = selectedId ?? structures[0]?.id ?? null;
    if (!pick) {
      setDraft(emptyStructureDraft());
      return;
    }
    const row = structures.find((s) => s.id === pick);
    if (!row) return;
    setDraft({
      id: row.id,
      name: row.name,
      description: row.description ?? "",
      isActive: row.is_active,
      lines: linesForStructure(row.id, listQ.data.lines, currency),
    });
    setSelectedId(pick);
  }, [listQ.data, selectedId, currency]);

  const saveM = useMutation({
    mutationFn: (payload: SalaryStructureDraft) =>
      saveStructure({ data: { companyId: company!.id, draft: payload, currencyCode: currency } }),
    onSuccess: async (row: PayrollSalaryStructureRow) => {
      await queryClient.invalidateQueries({ queryKey: ["payroll-salary-structures", company?.id] });
      setSelectedId(row.id);
      toast.success("Salary structure saved");
    },
    onError: (e) => toast.error(friendlyAuthError(e)),
  });

  if (isPending) return <LoadingState />;
  if (!company) {
    return <CompanyEmptyState title="No organisation" description="Select a company first." />;
  }
  if (!canView) {
    return (
      <EmptyState
        title="No payroll access"
        description="Ask an organisation administrator for the payroll.view permission."
      />
    );
  }
  if (listQ.isPending || settingsQ.isPending) return <LoadingState />;
  if (listQ.isError) {
    return <QueryErrorState queries={[listQ]} title="Could not load salary structures" />;
  }
  if (settingsQ.isError) {
    return (
      <QueryErrorState queries={[settingsQ]} title="Could not load payroll components" />
    );
  }

  const list = listQ.data;

  const addLine = () => {
    setDraft({
      ...draft,
      lines: [
        ...draft.lines,
        {
          componentTypeId: components[0]?.id ?? "",
          amount: "0",
          rate: "0",
          percentage: "0",
          isRecurring: true,
          sortOrder: String(100 + draft.lines.length * 10),
        },
      ],
    });
  };

  return (
    <ListWorkspace
      title="Salary structures"
      description="Reusable component templates for employee salary assignments."
      actions={
        canManage && list.available ? (
          <Button
            size="sm"
            onClick={() => {
              setSelectedId("new");
              setDraft(emptyStructureDraft());
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New structure
          </Button>
        ) : null
      }
      subnav={<PayrollSubnav current="salary-structures" />}
    >
      {!list.available ? (
        <Alert>
          <AlertTitle>Database update required</AlertTitle>
          <AlertDescription>{list.migrationMessage}</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          {list.structures.length === 0 ? (
            <EmptyState
              title="No salary structures yet"
              description="Create a reusable template of pay components before assigning salaries to employees."
              action={
                canManage ? (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSelectedId("new");
                      setDraft(emptyStructureDraft());
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    New structure
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <TableCard>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.structures.map((s) => (
                    <TableRow
                      key={s.id}
                      className={selectedId === s.id ? "bg-muted/50" : undefined}
                      onClick={() => setSelectedId(s.id)}
                    >
                      <TableCell className="cursor-pointer font-medium">{s.name}</TableCell>
                      <TableCell>
                        <Badge variant={s.is_active ? "default" : "secondary"}>
                          {s.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableCard>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {selectedId === "new" ? "New salary structure" : draft.name || "Structure details"}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedId !== null ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="struct-name">Name</Label>
                    <Input
                      id="struct-name"
                      value={draft.name}
                      disabled={!canManage}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="struct-desc">Description</Label>
                    <Textarea
                      id="struct-desc"
                      rows={2}
                      disabled={!canManage}
                      value={draft.description}
                      onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      disabled={!canManage}
                      checked={draft.isActive}
                      onCheckedChange={(c) => setDraft({ ...draft, isActive: c === true })}
                    />
                    Active
                  </label>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">Component lines</p>
                      {canManage ? (
                        <Button type="button" size="sm" variant="outline" onClick={addLine}>
                          Add line
                        </Button>
                      ) : null}
                    </div>
                    {draft.lines.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Add pay components and amounts.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {draft.lines.map((line, index) => (
                          <div
                            key={index}
                            className="grid gap-2 rounded-md border p-3 sm:grid-cols-2"
                          >
                            <div className="space-y-1 sm:col-span-2">
                              <Label>Component</Label>
                              {settingsQ.isSuccess ? (
                                <RecordLookupSelect
                                  disabled={!canManage}
                                  value={line.componentTypeId || "none"}
                                  onValueChange={(v) => {
                                    const lines = [...draft.lines];
                                    lines[index] = {
                                      ...line,
                                      componentTypeId: v === "none" ? "" : v,
                                    };
                                    setDraft({ ...draft, lines });
                                  }}
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Choose component" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {components.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {c.code} — {c.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </RecordLookupSelect>
                              ) : null}
                            </div>
                            <div className="space-y-1">
                              <Label>Fixed ({currency})</Label>
                              <Input
                                disabled={!canManage}
                                value={line.amount}
                                onChange={(e) => {
                                  const lines = [...draft.lines];
                                  lines[index] = { ...line, amount: e.target.value };
                                  setDraft({ ...draft, lines });
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Rate ({currency})</Label>
                              <Input
                                disabled={!canManage}
                                value={line.rate}
                                onChange={(e) => {
                                  const lines = [...draft.lines];
                                  lines[index] = { ...line, rate: e.target.value };
                                  setDraft({ ...draft, lines });
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Percentage</Label>
                              <Input
                                disabled={!canManage}
                                value={line.percentage}
                                onChange={(e) => {
                                  const lines = [...draft.lines];
                                  lines[index] = { ...line, percentage: e.target.value };
                                  setDraft({ ...draft, lines });
                                }}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label>Sort order</Label>
                              <Input
                                disabled={!canManage}
                                value={line.sortOrder}
                                onChange={(e) => {
                                  const lines = [...draft.lines];
                                  lines[index] = { ...line, sortOrder: e.target.value };
                                  setDraft({ ...draft, lines });
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {canManage ? (
                    <Button
                      size="sm"
                      disabled={saveM.isPending || !settingsQ.isSuccess}
                      onClick={() => {
                        const parsed = parseSalaryStructureDraft(draft, currency);
                        if (!parsed.ok) {
                          toast.error(parsed.error);
                          return;
                        }
                        saveM.mutate(draft);
                      }}
                    >
                      Save structure
                    </Button>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select a structure or create a new one.
                </p>
              )}

              {list.structures.length > 0 && selectedId && selectedId !== "new" ? (
                <p className="text-xs text-muted-foreground">
                  Last updated{" "}
                  {fmt.dateTime(list.structures.find((s) => s.id === selectedId)?.updated_at ?? "")}
                </p>
              ) : null}
            </CardContent>
          </Card>
        </div>
      )}
    </ListWorkspace>
  );
}

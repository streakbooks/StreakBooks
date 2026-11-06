import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useFormat } from "@/hooks/use-format";
import { useActiveCompany } from "@/hooks/use-active-company";
import { fromMinorUnits } from "@/lib/accounting/money";
import { friendlyAuthError } from "@/lib/auth-helpers";
import { parseAmountCell } from "@/lib/budgets/budget-csv";
import { monthLabel } from "@/lib/budgets/budget-math";
import {
  getBudgetDimensionAllocations,
  saveBudgetDimensionAllocations,
  type BudgetDimensionData,
} from "@/lib/budgets/budget-dimensions.functions";
import {
  validateBudgetAllocations,
  type AllocationCell,
} from "@/lib/budgets/budget-dimensions";
import { csvFilename, csvMoney, downloadCsv, toCsv } from "@/lib/reports/csv";
import { LookupSelect } from "@/components/lookup";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

type PairRow = { optionId: string; accountId: string; months: string[] };
type DimCategory = BudgetDimensionData["categories"][number];

function inputAmount(text: string, currency: string): number | null {
  try {
    const amount = parseAmountCell(text, currency);
    return amount >= 0 && amount <= 900_000_000_000_000 ? amount : null;
  } catch {
    return null;
  }
}

export function BudgetDimensionsPanel({
  companyId,budgetId,canEdit,parentDirty,
}:{
  companyId:string;
  budgetId:string;
  canEdit:boolean;
  parentDirty:boolean;
}) {
  const getFn=useServerFn(getBudgetDimensionAllocations);
  const [categoryId,setCategoryId]=useState("");
  const [editorDirty,setEditorDirty]=useState(false);
  const query=useQuery({
    queryKey:["budget-dimensions",companyId,budgetId],
    queryFn:()=>getFn({data:{companyId,budgetId}}),
  });
  const data=query.data;
  const categories=data?.categories ?? [];
  const active=categories.filter(c=>c.is_active);
  const selected=categories.find(c=>c.id===categoryId)??active[0]??categories[0];

  return (
    <section className="mt-6 space-y-3 rounded-lg border p-4" aria-label="Class and location budgets">
      <div>
        <h2 className="text-base font-semibold">Budgets by class, department or location</h2>
        <p className="text-sm text-muted-foreground">
          Allocate existing budget amounts across business units without changing your
          organisation's budget totals or posting any journals.
        </p>
      </div>
      {query.isPending ? (
        <p className="text-sm text-muted-foreground">Loading budget dimensions…</p>
      ) : query.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Could not load budget dimensions: {friendlyAuthError(query.error)}
            <Button size="sm" variant="outline" className="ml-2"
              onClick={()=>void query.refetch()}>Retry</Button>
          </AlertDescription>
        </Alert>
      ) : !data?.available ? (
        <Alert>
          <AlertDescription>
            Dimension budgeting needs migration
            20261106204000_budget_dimension_allocations.sql before this feature can be used.
          </AlertDescription>
        </Alert>
      ) : categories.length===0 ? (
        <Alert>
          <AlertDescription>
            No class, department or location categories exist yet. Create an active tracking
            category and options in Settings → Tracking Dimensions first.
          </AlertDescription>
        </Alert>
      ) : selected ? (
        <div className="space-y-3">
          <div className="max-w-sm space-y-1">
            <Label htmlFor="dimension-budget-category">Tracking category</Label>
            <LookupSelect
              id="dimension-budget-category"
              ariaLabel="Tracking category"
              value={selected.id}
              options={categories.map(c=>({
                id:c.id,name:c.name,label:c.name,
                description:`${c.dimension_kind}${c.is_active?"":" · Inactive"}`,
              }))}
              onChange={(id)=>{
                if(editorDirty&&!window.confirm("Discard unsaved category allocations?"))return;
                setEditorDirty(false);
                setCategoryId(id);
              }}
              allowClear={false}
              placeholder="Choose class, department or location"
            />
          </div>
          <CategoryBudgetEditor
            key={`${selected.id}-${data.updatedAt}`}
            data={data}
            category={selected}
            companyId={companyId}
            budgetId={budgetId}
            canEdit={canEdit&&!parentDirty}
            parentDirty={parentDirty}
            onDirtyChange={setEditorDirty}
          />
        </div>
      ) : null}
    </section>
  );
}

function CategoryBudgetEditor({
  data,category,companyId,budgetId,canEdit,parentDirty,onDirtyChange,
}:{
  data:BudgetDimensionData;
  category:DimCategory;
  companyId:string;
  budgetId:string;
  canEdit:boolean;
  parentDirty:boolean;
  onDirtyChange:(dirty:boolean)=>void;
}) {
  const fmt=useFormat();
  const {company}=useActiveCompany();
  const client=useQueryClient();
  const saveFn=useServerFn(saveBudgetDimensionAllocations);
  const options=data.options.filter(o=>o.category_id===category.id);
  const optionById=new Map(options.map(o=>[o.id,o]));
  const accountById=new Map(data.accounts.map(a=>[a.id,a]));
  const baseAccounts=new Set(data.base.filter(l=>l.amountMinor>0).map(l=>l.accountId));
  const monthIndex=new Map(data.months.map((month,index)=>[month,index]));
  const existing=useMemo(()=>{
    const pairs=new Map<string,PairRow>();
    for(const line of data.lines){
      if(!options.some(o=>o.id===line.optionId))continue;
      const key=`${line.optionId}|${line.accountId}`;
      const row=pairs.get(key)??{
        optionId:line.optionId,accountId:line.accountId,
        months:Array.from({length:12},()=>""),
      };
      const index=monthIndex.get(line.month);
      if(index!==undefined)row.months[index]=fromMinorUnits(line.amountMinor,data.currency);
      pairs.set(key,row);
    }
    return [...pairs.values()];
  },[data,category.id]);

  const [rows,setRows]=useState<PairRow[]>(existing);
  const [dirty,setDirty]=useState(false);
  const [optionId,setOptionId]=useState("");
  const [accountId,setAccountId]=useState("");
  const [search,setSearch]=useState("");
  const [saveConflict,setSaveConflict]=useState(false);
  useEffect(()=>{onDirtyChange(dirty);return ()=>onDirtyChange(false);},[dirty,onDirtyChange]);
  const savedCategory=data.revisions.filter(r=>r.category_id===category.id);
  const historicalError=rows.some(row=>
    !optionById.get(row.optionId)?.is_active ||
    !accountById.get(row.accountId)?.is_active ||
    !accountById.get(row.accountId)?.is_postable
  );
  const writable=canEdit&&category.is_active&&!historicalError;

  useEffect(()=>{
    if(!dirty)return;
    const guard=(event:BeforeUnloadEvent)=>{
      event.preventDefault();
      event.returnValue="";
    };
    window.addEventListener("beforeunload",guard);
    return ()=>window.removeEventListener("beforeunload",guard);
  },[dirty]);

  const updateRows=(updated:PairRow[])=>{
    setRows(updated);
    setDirty(true);
  };
  const pairs=new Set(rows.map(row=>`${row.optionId}|${row.accountId}`));
  const candidates=data.accounts.filter(a=>
    a.is_active&&a.is_postable&&baseAccounts.has(a.id)
  );
  const rowCells:AllocationCell[]=[];
  let invalid=0;
  for(const row of rows){
    for(let i=0;i<12;i++){
      const text=row.months[i]??"";
      const parsed=inputAmount(text,data.currency);
      if(parsed===null){invalid++;continue;}
      if(parsed!==0){
        rowCells.push({
          optionId:row.optionId,accountId:row.accountId,
          month:data.months[i]!,amountMinor:parsed,
        });
      }
    }
  }
  let ceilingError:string|null=null;
  if(invalid===0){
    try {
      validateBudgetAllocations({rows:rowCells,base:data.base,months:data.months});
    } catch (error) {
      ceilingError=friendlyAuthError(error);
    }
  }
  const allocationTotal=rowCells.reduce((v,row)=>v+BigInt(row.amountMinor),0n);
  const budgetTotal=data.base.reduce((v,line)=>v+BigInt(Math.max(line.amountMinor,0)),0n);
  const remaining=budgetTotal-allocationTotal;
  const previewRows=rows.filter(row=>{
    const o=optionById.get(row.optionId);
    const a=accountById.get(row.accountId);
    return `${o?.name??""} ${o?.code??""} ${a?.name??""} ${a?.code??""}`
      .toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  });

  const save=useMutation({
    mutationFn:()=>{
      if(!writable||!dirty||parentDirty)throw new Error("Budget allocations are read-only.");
      if(invalid||ceilingError)throw new Error(ceilingError??"Correct invalid amounts.");
      return saveFn({data:{
        companyId,budgetId,categoryId:category.id,expectedUpdatedAt:data.updatedAt,
        rows:rowCells,
      }});
    },
    onSuccess:async({version})=>{
      setDirty(false);
      setSaveConflict(false);
      await Promise.all([
        client.invalidateQueries({queryKey:["budget-dimensions",companyId,budgetId]}),
        client.invalidateQueries({queryKey:["budget",companyId,budgetId]}),
        client.invalidateQueries({queryKey:["budgets",companyId]}),
        client.invalidateQueries({queryKey:["budget-governance",companyId,budgetId]}),
      ]);
      toast.success(`Allocation version ${version} saved`);
    },
    onError:(e)=>{
      const message=friendlyAuthError(e);
      if(message.toLowerCase().includes("changed since it was opened"))setSaveConflict(true);
      toast.error(message);
    },
  });
  const exportCsv=()=>{
    if(invalid||ceilingError){
      toast.error("Correct invalid amounts before exporting.");
      return;
    }
    const monthHeaders=data.months.map(monthLabel);
    const body=rows.map(row=>{
      const option=optionById.get(row.optionId);
      const account=accountById.get(row.accountId);
      const amounts=row.months.map(text=>inputAmount(text,data.currency)??0);
      return [
        option?.code??"",option?.name??"",account?.code??"",account?.name??"",
        ...amounts.map(amount=>csvMoney(amount,data.currency)),
        csvMoney(amounts.reduce((a,b)=>a+BigInt(b),0n),data.currency),
      ];
    });
    downloadCsv(
      csvFilename(`budget-${category.name}`,data.months[0]??"period"),
      toCsv({
        company:company?.name??"",
        report:`Budget allocations: ${category.name}`,
        period:`From ${data.months[0]??""}`,
        currency:data.currency,
        basis:"Only this category. Do not add allocations across separate categories.",
      },["Option code","Option","Account code","Account",...monthHeaders,"Year"],body),
    );
  };

  const add=()=>{
    if(!optionId||!accountId||!writable)return;
    const key=`${optionId}|${accountId}`;
    if(pairs.has(key)){
      toast.error("That option and account is already present.");
      return;
    }
    updateRows([...rows,{
      optionId,accountId,months:Array.from({length:12},()=>""),
    }]);
    setAccountId("");
  };
  const money=(v:number|bigint)=>fmt.amount(v,data.currency);

  return (
    <div className="space-y-3">
      {!category.is_active?(
        <Alert><AlertDescription>This tracking category is inactive; allocations are read-only.</AlertDescription></Alert>
      ):null}
      {historicalError?(
        <Alert variant="destructive"><AlertDescription>
          Historical allocations refer to inactive or unavailable options/accounts.
          Existing records are preserved; reactivate or resolve them before editing.
        </AlertDescription></Alert>
      ):null}
      {parentDirty?(
        <p className="text-xs text-muted-foreground">
          Save or discard your changes to the main budget before editing allocations.
        </p>
      ):null}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Main budget (nonnegative cells)</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{money(budgetTotal)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Allocated in this category</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{money(allocationTotal)}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Remaining unallocated</p>
          <p className={`mt-1 text-lg font-semibold tabular-nums ${remaining<0n?"text-destructive":""}`}>
            {money(remaining)}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Allocations across different tracking categories are independent views of the same
        budget. Do not add Class and Location totals together.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-44 flex-1 space-y-1">
          <Label htmlFor="budget-dimension-option">Class / department / location</Label>
          <LookupSelect
            id="budget-dimension-option"
            ariaLabel="Tracking option"
            value={optionId}
            onChange={setOptionId}
            options={options.filter(o=>o.is_active).map(o=>({
              id:o.id,name:o.name,label:o.code?`${o.code} · ${o.name}`:o.name,
            }))}
            placeholder="Choose an option"
            disabled={!writable}
          />
        </div>
        <div className="min-w-44 flex-1 space-y-1">
          <Label htmlFor="budget-dimension-account">Account</Label>
          <LookupSelect
            id="budget-dimension-account"
            ariaLabel="Budget account"
            value={accountId}
            onChange={setAccountId}
            options={candidates.map(a=>({
              id:a.id,name:a.name,label:`${a.code} · ${a.name}`,
            }))}
            placeholder="Choose budget account"
            disabled={!writable}
          />
        </div>
        <Button size="sm" variant="outline" disabled={!writable||!optionId||!accountId}
          onClick={add}>
          <Plus className="mr-1 size-4"/> Add allocation row
        </Button>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="space-y-1">
          <Label htmlFor="budget-dimension-search">Search allocations</Label>
          <Input id="budget-dimension-search" value={search}
            onChange={e=>setSearch(e.target.value)}
            placeholder="Option or account" className="w-60 max-w-full"/>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline"
            disabled={!!invalid||!!ceilingError} onClick={exportCsv}>
            <Download className="mr-1 size-4"/> Export CSV
          </Button>
          <Button size="sm" disabled={!writable||!dirty||!!invalid||!!ceilingError||save.isPending}
            onClick={()=>save.mutate()}>
            <Save className="mr-1 size-4"/>
            {save.isPending?"Saving…":"Save allocations"}
          </Button>
        </div>
      </div>
      {invalid||ceilingError?(
        <Alert variant="destructive"><AlertDescription>
          {invalid?`${invalid} amount(s) are invalid. `:""}
          {ceilingError??""} Correct the entries before saving.
        </AlertDescription></Alert>
      ):null}
      {saveConflict?(
        <Alert variant="destructive"><AlertDescription>
          Another user changed this budget. Your draft is still displayed. Export a copy
          if needed, then reload the page to review the latest saved amounts.
        </AlertDescription></Alert>
      ):null}
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 min-w-52 bg-background">Option / account</TableHead>
              {data.months.map(month=>(
                <TableHead key={month} className="min-w-28 text-right">{monthLabel(month)}</TableHead>
              ))}
              <TableHead className="text-right">Year</TableHead>
              <TableHead/>
            </TableRow>
          </TableHeader>
          <TableBody>
            {previewRows.length===0?(
              <TableRow><TableCell colSpan={15} className="text-sm text-muted-foreground">
                No allocation rows match. Choose an option and an account to add one.
              </TableCell></TableRow>
            ):previewRows.map(row=>{
              const option=optionById.get(row.optionId);
              const account=accountById.get(row.accountId);
              const key=`${row.optionId}|${row.accountId}`;
              const annual=row.months.reduce((n,text)=>n+BigInt(inputAmount(text,data.currency)??0),0n);
              return (
                <TableRow key={key}>
                  <TableCell className="sticky left-0 bg-background text-xs">
                    <span className="font-semibold">{option?.name??"Unavailable option"}</span>
                    <span className="block text-muted-foreground">
                      {account?.code??""} · {account?.name??"Unavailable account"}
                    </span>
                  </TableCell>
                  {data.months.map((month,i)=>(
                    <TableCell key={month} className="p-1">
                      <Input
                        className="h-8 w-24 text-right tabular-nums"
                        inputMode="decimal"
                        aria-label={`${option?.name??"Option"} ${account?.name??"Account"} ${monthLabel(month)}`}
                        disabled={!writable}
                        value={row.months[i]??""}
                        aria-invalid={inputAmount(row.months[i]??"",data.currency)===null}
                        onChange={e=>{
                          updateRows(rows.map(current=>{
                            if(current.optionId!==row.optionId||current.accountId!==row.accountId)
                              return current;
                            const months=[...current.months];
                            months[i]=e.target.value;
                            return {...current,months};
                          }));
                        }}
                      />
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-medium tabular-nums">{money(annual)}</TableCell>
                  <TableCell className="p-1">
                    <Button size="icon" variant="ghost" disabled={!writable}
                      aria-label={`Remove allocation ${option?.name??""} ${account?.name??""}`}
                      onClick={()=>updateRows(rows.filter(r=>
                        r.optionId!==row.optionId||r.accountId!==row.accountId
                      ))}>
                      <Trash2 className="size-4"/>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {dirty?<p className="text-xs text-muted-foreground">
        You have unsaved dimension allocations.
      </p>:null}
      {savedCategory.length?(
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Allocation save history ({savedCategory.length} recent revision(s))
          </summary>
          <div className="mt-2 space-y-1 text-xs text-muted-foreground">
            {savedCategory.map(revision=>(
              <p key={revision.id}>
                Version {revision.version} · {fmt.dateTime(revision.recorded_at)} ·
                {" "}{revision.line_count} amount lines
              </p>
            ))}
          </div>
        </details>
      ):null}
    </div>
  );
}

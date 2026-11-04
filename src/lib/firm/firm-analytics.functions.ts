import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertCompanyPermission } from "@/lib/assert-company-access";

export type FirmPracticePulse = {
  asOfUtc: string;
  accessibleClients: number;
  openWork: number;
  overdueWork: number;
  myWork: number;
  incompleteOnboarding: number;
  activeEngagements: number;
  openDocumentRequestsVisibleToMe: number;
  invoiceReferencesVisibleToMe: number;
};

/** Portfolio metrics are permission-scoped, not claims about all practice clients. */
export const getFirmPracticePulse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ firmId: z.string().uuid() }).strict().parse(input),
  )
  .handler(async ({ data, context }): Promise<FirmPracticePulse> => {
    const sb=context.supabase;
    const {data:member,error:membershipError}=await sb
      .from("firm_members" as never)
      .select("id" as never)
      .eq("firm_id" as never,data.firmId as never)
      .eq("user_id" as never,context.userId as never)
      .maybeSingle();
    if(membershipError)throw new Error(membershipError.message);
    if(!member)throw new Error("Firm membership required");
    const {data:links,error:linkError}=await sb.from("firm_client_links" as never)
      .select("company_id" as never)
      .eq("firm_id" as never,data.firmId as never)
      .is("revoked_at" as never,null)
      .order("company_id" as never)
      .limit(201);
    if(linkError)throw new Error(linkError.message);
    if((links??[]).length>200)
      throw new Error("Practice insights cover at most 200 linked clients; use company workspaces for larger portfolios");
    const candidates=(links??[]).map(r=>(r as {company_id:string}).company_id);
    const accessible:string[]=[];
    for(let i=0;i<candidates.length;i+=10){
      const checks=await Promise.all(candidates.slice(i,i+10).map(async companyId=>{
        const {data:yes,error}=await sb.rpc("has_company_permission",{
          _company_id:companyId,_permission:"accounting.view",
        });
        if(error)throw new Error(error.message);
        return yes?companyId:null;
      }));
      accessible.push(...checks.filter((id):id is string=>id!==null));
    }
    const asOfUtc=new Date().toISOString().slice(0,10);
    const empty:FirmPracticePulse={
      asOfUtc,accessibleClients:accessible.length,openWork:0,overdueWork:0,myWork:0,
      incompleteOnboarding:0,activeEngagements:0,openDocumentRequestsVisibleToMe:0,
      invoiceReferencesVisibleToMe:0,
    };
    if(accessible.length===0)return empty;
    // Counts are fetched independently under the caller's RLS, never via service-role reads.
    const [open,overdue,mine,onboarding,engagements,requests,invoices]=await Promise.all([
      sb.from("practice_tasks" as never)
        .select("id" as never,{head:true,count:"exact"})
        .in("company_id" as never,accessible as never)
        .neq("status" as never,"completed" as never),
      sb.from("practice_tasks" as never)
        .select("id" as never,{head:true,count:"exact"})
        .in("company_id" as never,accessible as never)
        .neq("status" as never,"completed" as never)
        .lt("due_date" as never,asOfUtc as never),
      sb.from("practice_tasks" as never)
        .select("id" as never,{head:true,count:"exact"})
        .in("company_id" as never,accessible as never)
        .eq("assignee_id" as never,context.userId as never)
        .neq("status" as never,"completed" as never),
      sb.from("firm_client_onboarding_steps" as never)
        .select("task_key" as never,{head:true,count:"exact"})
        .eq("firm_id" as never,data.firmId as never)
        .in("company_id" as never,accessible as never)
        .is("completed_at" as never,null),
      sb.from("firm_engagements" as never)
        .select("id" as never,{head:true,count:"exact"})
        .eq("firm_id" as never,data.firmId as never)
        .in("company_id" as never,accessible as never)
        .eq("status" as never,"active" as never),
      sb.from("firm_document_request_tracking" as never)
        .select("request_id,action_document_requests(completed_at,cancelled_at)" as never)
        .eq("firm_id" as never,data.firmId as never)
        .in("company_id" as never,accessible as never)
        .limit(1001),
      sb.from("firm_engagement_invoice_links" as never)
        .select("invoice_id" as never,{head:true,count:"exact"})
        .eq("firm_id" as never,data.firmId as never)
        .in("company_id" as never,accessible as never),
    ]);
    for(const response of [open,overdue,mine,onboarding,engagements,requests,invoices])
      if(response.error)throw new Error(response.error.message);
    if((requests.data??[]).length>1000)
      throw new Error("Too many visible document requests for this summary");
    const pending=(requests.data??[]).filter(row=>{
      const r=(row as {
        action_document_requests:{completed_at:string|null;cancelled_at:string|null}|null;
      }).action_document_requests;
      return r&&!r.completed_at&&!r.cancelled_at;
    }).length;
    return {
      ...empty,
      openWork:open.count??0,
      overdueWork:overdue.count??0,
      myWork:mine.count??0,
      incompleteOnboarding:onboarding.count??0,
      activeEngagements:engagements.count??0,
      openDocumentRequestsVisibleToMe:pending,
      invoiceReferencesVisibleToMe:invoices.count??0,
    };
  });

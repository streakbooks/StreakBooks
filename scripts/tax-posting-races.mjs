/**
 * Two-connection race checks in the isolated Docker PostgreSQL instance.
 * Called by test-tax-master-history-postgres.mjs. Never touches cloud data.
 */
import { execFileSync, spawn } from "node:child_process";

const PSQL = ["psql","-h","127.0.0.1","-X","-q","-A","-t",
  "-U","postgres","-v","ON_ERROR_STOP=1"];

function check(ok, message) {
  if (!ok) throw new Error("Tax concurrency regression: " + message);
}

function sql(host, container, statement) {
  try {
    return { ok:true, output:execFileSync("docker",
      [host,"exec","-i",container,...PSQL], {
        input:statement, encoding:"utf8",maxBuffer:524288,
      }) };
  } catch (error) {
    return { ok:false, output:String(error.stderr??"") + "\n" + String(error.stdout??"") };
  }
}

function beginPosting(host, container, update, marker) {
  const child=spawn("docker",[host,"exec","-i",container,...PSQL],
    {stdio:["pipe","pipe","pipe"]});
  let output="",errors="",settled=false;
  let resolveReady, rejectReady;
  const ready=new Promise((resolve,reject)=>{
    resolveReady=resolve;rejectReady=reject;
  });
  const completed=new Promise((resolve,reject)=>{
    child.on("error",(error)=>{
      if(!settled){settled=true;rejectReady(error);}
      reject(error);
    });
    child.on("close",(code)=>{
      if(!settled) {
        settled=true;
        rejectReady(new Error("Transaction did not reach lock marker: "+errors));
      }
      if(code===0)resolve();
      else reject(new Error("Transaction failed ("+code+"): "+errors));
    });
  });
  const timeout=setTimeout(()=>{
    if(!settled) {
      settled=true;
      rejectReady(new Error("Timeout waiting for lock marker: "+errors));
      child.kill();
    }
  },12000);
  child.stdout.on("data",(chunk)=>{
    output+=String(chunk);
    if(!settled&&output.includes(marker)){
      settled=true;
      clearTimeout(timeout);
      resolveReady();
    }
  });
  child.stderr.on("data",(chunk)=>{errors+=String(chunk);});
  child.stdin.end([
    "BEGIN;",update,"SELECT '"+marker+"';","SELECT pg_sleep(4);","COMMIT;"
  ].join("\n"));
  return {ready,completed};
}

/**
 * Start the master/line UPDATE while the posting transaction still holds its
 * locks. The pending UPDATE MUST reject the now-posted source after commit,
 * rather than using the snapshot from when the UPDATE originally began.
 */
function beginPendingEdit(host,container,statement,marker) {
  const child=spawn("docker",[host,"exec","-i",container,...PSQL],
    {stdio:["pipe","pipe","pipe"]});
  let stdout="",stderr="",readyMarked=false;
  let resolveReady,rejectReady;
  const ready=new Promise((resolve,reject)=>{
    resolveReady=resolve;rejectReady=reject;
  });
  const timeout=setTimeout(()=>child.kill(),15000);
  const completed=new Promise((resolve,reject)=>{
    child.on("error",(error)=>{
      if(!readyMarked)rejectReady(error);
      reject(error);
    });
    child.on("close",(code)=>{
      clearTimeout(timeout);
      if(!readyMarked)rejectReady(new Error("Edit did not reach marker: "+stderr));
      resolve({code,stderr});
    });
  });
  child.stdout.on("data",(chunk)=>{
    stdout+=String(chunk);
    if(!readyMarked&&stdout.includes(marker)) {
      readyMarked=true;
      resolveReady();
    }
  });
  child.stderr.on("data",(chunk)=>{stderr+=String(chunk);});
  child.stdin.end("SET application_name='"+marker+"';\n"+
    "SELECT '"+marker+"';\n"+statement+"\n");
  return {ready,completed};
}

/** Prove the second database connection is actually blocked before commit. */
async function requirePendingLocks(host,container,markers) {
  for (const marker of markers) {
    check(/^[A-Z_]+$/.test(marker),"Unexpected test session marker");
  }
  const filter=markers.map((marker)=>"'"+marker+"'").join(",");
  const query="SELECT count(*) FROM pg_stat_activity "+
    "WHERE application_name IN ("+filter+") AND wait_event_type='Lock';";
  const deadline=Date.now()+1500;
  while(Date.now()<deadline) {
    const r=sql(host,container,query);
    if(r.ok&&Number(r.output.trim())===markers.length) return;
    await new Promise((resolve)=>setTimeout(resolve,40));
  }
  throw new Error("Concurrent edits did not visibly wait on PostgreSQL row locks: "+
    markers.join(","));
}

function mustRejectAfterCommit(result,label) {
  check(result.code!==0&&/posted documents|Posted tax source lines are immutable/i.test(result.stderr),
    label+" used stale posting history or another unexpected error: "+result.stderr);
}

function mustWait(host,container,statement,label){
  const r=sql(host,container,"SET lock_timeout = '650ms';\n"+statement);
  check(!r.ok&&/canceling statement due to lock timeout/i.test(r.output),
    label+" did not wait for concurrent posting: "+r.output);
}

function mustReject(host,container,statement,label){
  const r=sql(host,container,statement);
  check(!r.ok&&/posted documents|Posted tax source lines are immutable/i.test(r.output),
    label+" did not reject modification after posting: "+r.output);
}

function verifyPosted(host,container,id,source="sales_invoices") {
  check(source==="sales_invoices"||source==="purchase_bills",
    "Unknown posting source");
  const r=sql(host,container,
    "SELECT posted_journal_id IS NOT NULL FROM public."+source+
    " WHERE id='"+id+"';");
  check(r.ok&&r.output.trim()==="t","Posting transaction must commit: "+r.output);
}

export async function verifyTaxPostingRaces(host,container) {
  const rate="'20000000-0000-4000-8000-000000000004'";
  const code="'30000000-0000-4000-8000-000000000004'";
  const invoiceA="50000000-0000-4000-8000-000000000004";
  const invoiceB="50000000-0000-4000-8000-000000000005";
  const line="'60000000-0000-4000-8000-000000000005'";

  const a=beginPosting(host,container,
    "UPDATE public.sales_invoices SET status='authorised', "+
    "posted_journal_id='70000000-0000-4000-8000-000000000004' "+
    "WHERE id='"+invoiceA+"';","RATE_POST_READY");
  await a.ready;
  mustWait(host,container,
    "UPDATE public.tax_rates SET rate_bps=1800 WHERE id="+rate+";",
    "Rate edit");
  mustWait(host,container,
    "UPDATE public.tax_codes SET is_recoverable=false WHERE id="+code+";",
    "Code edit");
  // Both UPDATE statements start before A commits, and wait for its locks.
  // This specifically catches STABLE versus VOLATILE history-lookup mistakes.
  const pendingRate=beginPendingEdit(host,container,
    "UPDATE public.tax_rates SET rate_bps=1800 WHERE id="+rate+";",
    "RATE_EDIT_QUEUED");
  const pendingCode=beginPendingEdit(host,container,
    "UPDATE public.tax_codes SET is_recoverable=false WHERE id="+code+";",
    "CODE_EDIT_QUEUED");
  await Promise.all([pendingRate.ready,pendingCode.ready]);
  await requirePendingLocks(host,container,["RATE_EDIT_QUEUED","CODE_EDIT_QUEUED"]);
  await a.completed;
  verifyPosted(host,container,invoiceA);
  mustRejectAfterCommit(await pendingRate.completed,
    "Rate edit queued before posting commit");
  mustRejectAfterCommit(await pendingCode.completed,
    "Code edit queued before posting commit");
  mustReject(host,container,
    "UPDATE public.tax_rates SET rate_bps=1800 WHERE id="+rate+";",
    "Rate edit");
  mustReject(host,container,
    "UPDATE public.tax_codes SET is_recoverable=false WHERE id="+code+";",
    "Code edit");

  const b=beginPosting(host,container,
    "UPDATE public.sales_invoices SET status='authorised', "+
    "posted_journal_id='70000000-0000-4000-8000-000000000005' "+
    "WHERE id='"+invoiceB+"';","LINE_POST_READY");
  await b.ready;
  mustWait(host,container,
    "UPDATE public.sales_invoice_lines SET tax_code_id=NULL WHERE id="+line+";",
    "Source line edit");
  const pendingLine=beginPendingEdit(host,container,
    "UPDATE public.sales_invoice_lines SET tax_code_id=NULL WHERE id="+line+";",
    "LINE_EDIT_QUEUED");
  await pendingLine.ready;
  await requirePendingLocks(host,container,["LINE_EDIT_QUEUED"]);
  await b.completed;
  verifyPosted(host,container,invoiceB);
  mustRejectAfterCommit(await pendingLine.completed,
    "Source edit queued before posting commit");
  mustReject(host,container,
    "UPDATE public.sales_invoice_lines SET tax_code_id=NULL WHERE id="+line+";",
    "Source line edit");

  // Purchase side must not be implicitly covered only by the invoice test:
  // this source uses a distinct, previously unused code and rate.
  const purchaseRate="'20000000-0000-4000-8000-000000000007'";
  const purchaseCode="'30000000-0000-4000-8000-000000000007'";
  const purchaseLine="'60000000-0000-4000-8000-000000000007'";
  const billId="50000000-0000-4000-8000-000000000007";
  const purchase=beginPosting(host,container,
    "UPDATE public.purchase_bills SET status='paid', "+
    "posted_journal_id='70000000-0000-4000-8000-000000000007' "+
    "WHERE id='"+billId+"';","PURCHASE_POST_READY");
  await purchase.ready;
  mustWait(host,container,
    "UPDATE public.tax_rates SET rate_bps=1300 WHERE id="+purchaseRate+";",
    "Purchase tax rate edit");
  const purchaseRateEdit=beginPendingEdit(host,container,
    "UPDATE public.tax_rates SET rate_bps=1300 WHERE id="+purchaseRate+";",
    "PURCHASE_RATE_QUEUED");
  const purchaseCodeEdit=beginPendingEdit(host,container,
    "UPDATE public.tax_codes SET is_recoverable=false WHERE id="+purchaseCode+";",
    "PURCHASE_CODE_QUEUED");
  const purchaseLineEdit=beginPendingEdit(host,container,
    "UPDATE public.purchase_bill_lines SET tax_code_id=NULL WHERE id="+purchaseLine+";",
    "PURCHASE_LINE_QUEUED");
  await Promise.all([purchaseRateEdit.ready,purchaseCodeEdit.ready,purchaseLineEdit.ready]);
  await requirePendingLocks(host,container,[
    "PURCHASE_RATE_QUEUED","PURCHASE_CODE_QUEUED","PURCHASE_LINE_QUEUED",
  ]);
  await purchase.completed;
  verifyPosted(host,container,billId,"purchase_bills");
  mustRejectAfterCommit(await purchaseRateEdit.completed,
    "Purchase rate change queued before posting commit");
  mustRejectAfterCommit(await purchaseCodeEdit.completed,
    "Purchase code change queued before posting commit");
  mustRejectAfterCommit(await purchaseLineEdit.completed,
    "Purchase line change queued before posting commit");

  console.log("PASS: two-session posting versus tax rate, code and source line edits");
}

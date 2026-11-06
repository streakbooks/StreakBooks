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

function verifyPosted(host,container,id) {
  const r=sql(host,container,
    "SELECT posted_journal_id IS NOT NULL FROM public.sales_invoices WHERE id='"+id+"';");
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
  await a.completed;
  verifyPosted(host,container,invoiceA);
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
  await b.completed;
  verifyPosted(host,container,invoiceB);
  mustReject(host,container,
    "UPDATE public.sales_invoice_lines SET tax_code_id=NULL WHERE id="+line+";",
    "Source line edit");

  console.log("PASS: two-session posting versus tax rate, code and source line edits");
}

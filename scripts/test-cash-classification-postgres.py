"""Execute the actual verified-classification migration in isolated PostgreSQL 17."""
import json
import os
import pathlib
import subprocess
import time

ROOT = pathlib.Path(__file__).resolve().parent.parent
NAME = f"streakbooks-classification-{os.getpid()}"
ENV = os.environ.copy()
for key in ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]:
    ENV.pop(key, None)


def docker(*args, input=None):
    return subprocess.run(["docker", "--host=unix:///var/run/docker.sock", *args], input=input, text=True,
                          capture_output=True, check=True, env=ENV, timeout=120).stdout


def sql(source):
    return docker("exec", "-i", NAME, "psql", "-h", "127.0.0.1", "-X", "-qAt", "-U", "postgres", "-v", "ON_ERROR_STOP=1", input=source).strip()


C = "00000000-0000-4000-8000-000000000001"
OTHER = "00000000-0000-4000-8000-000000000002"
USER = "00000000-0000-4000-8000-000000000003"
def uid(n):
    return f"10000000-0000-4000-8000-{n:012d}"


def call(name, payload, approve=True):
    body = json.dumps(payload).replace("'", "''")
    return sql(f"SET ROLE authenticated; SET test.company='{C}'; SET test.actor='{USER}'; SET test.approve={'true' if approve else 'false'}; SELECT public.{name}('{C}','{body}'::jsonb);")


def denied(source, expected):
    try:
        sql(source)
        raise AssertionError("unexpectedly allowed " + expected)
    except subprocess.CalledProcessError as exc:
        assert expected.lower() in exc.stderr.lower(), exc.stderr


try:
    docker("run", "--detach", "--rm", "--name", NAME, "--network", "none", "--memory", "768m", "--cpus", "2", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17")
    for attempt in range(120):
        try:
            docker("exec", NAME, "pg_isready", "-h", "127.0.0.1", "-U", "postgres")
            break
        except subprocess.CalledProcessError:
            time.sleep(.25)
    sql(f"""
CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA private; CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.actor',true),'')::uuid $$;
CREATE TABLE public.companies(id uuid PRIMARY KEY);
CREATE FUNCTION public.is_company_member(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1::text=current_setting('test.company',true) $$;
CREATE FUNCTION public.has_company_permission(uuid,text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT public.is_company_member($1) AND auth.uid() IS NOT NULL AND ($2<>'accounting.post' OR current_setting('test.approve',true)='true') $$;
CREATE TABLE public.accounts(id uuid PRIMARY KEY,company_id uuid,account_type text,is_postable boolean DEFAULT true,is_control boolean DEFAULT false);
CREATE TABLE public.journals(id uuid PRIMARY KEY,company_id uuid,journal_date date,journal_number text,source_type text,source_id uuid,currency_code text,fx_rate_to_base numeric(18,8) DEFAULT 1,status text);
CREATE TABLE public.journal_lines(id uuid PRIMARY KEY,company_id uuid,journal_id uuid,account_id uuid,debit_minor bigint,credit_minor bigint);
CREATE TABLE public.sales_invoices(id uuid PRIMARY KEY,company_id uuid,total_minor bigint,currency_code text,posted_journal_id uuid,status text);
CREATE TABLE public.purchase_bills(LIKE public.sales_invoices INCLUDING ALL);
CREATE TABLE public.tax_codes(id uuid PRIMARY KEY,company_id uuid);
CREATE TABLE public.bank_accounts(id uuid PRIMARY KEY,company_id uuid,gl_account_id uuid);
CREATE FUNCTION public.ops_minor_to_base(uuid,bigint,text,numeric) RETURNS bigint LANGUAGE sql AS $$ SELECT round($2*$4)::bigint $$;
CREATE FUNCTION public.capture_cash_report_source(uuid,date) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER AS $$ BEGIN IF NOT public.has_company_permission($1,'reports.view') THEN RAISE EXCEPTION 'Reporting access denied'; END IF; RETURN '{{"journal_lines":[]}}'::jsonb; END $$;
GRANT USAGE ON SCHEMA auth,private TO authenticated;
INSERT INTO public.companies VALUES('{C}'),('{OTHER}');
INSERT INTO public.accounts VALUES ('{uid(1)}','{C}','asset',true,false),('{uid(2)}','{C}','expense',true,false),('{uid(3)}','{C}','income',true,false),('{uid(4)}','{C}','asset',true,true),('{uid(5)}','{C}','liability',true,true),('{uid(6)}','{C}','equity',true,false),('{uid(7)}','{C}','liability',true,true),('{uid(8)}','{OTHER}','expense',true,false);
INSERT INTO public.journals VALUES('{uid(20)}','{C}','2026-10-01','1','purchase_bill','{uid(40)}','GBP',1,'posted'),('{uid(21)}','{C}','2026-11-01','2','manual',NULL,'GBP',1,'posted'),('{uid(22)}','{C}','2026-09-30','3','opening_balance',NULL,'GBP',1,'posted'),('{uid(23)}','{OTHER}','2026-10-01','4','manual',NULL,'GBP',1,'posted');
INSERT INTO public.journal_lines VALUES ('{uid(100)}','{C}','{uid(20)}','{uid(1)}',100,0),('{uid(101)}','{C}','{uid(20)}','{uid(5)}',0,100),('{uid(102)}','{C}','{uid(21)}','{uid(2)}',20,0),('{uid(103)}','{C}','{uid(21)}','{uid(1)}',0,20),('{uid(104)}','{C}','{uid(22)}','{uid(4)}',120,0),('{uid(105)}','{C}','{uid(22)}','{uid(6)}',0,100),('{uid(106)}','{C}','{uid(22)}','{uid(7)}',0,20);
INSERT INTO public.purchase_bills VALUES('{uid(40)}','{C}',100,'GBP','{uid(20)}','authorised');
INSERT INTO public.sales_invoices VALUES('{uid(41)}','{C}',120,'GBP','{uid(22)}','authorised');
INSERT INTO public.tax_codes VALUES('{uid(50)}','{C}'),('{uid(51)}','{OTHER}');
""")
    migration = list((ROOT / "supabase/migrations").glob("*_verified_cash_classification.sql"))
    assert len(migration) == 1
    sql(migration[0].read_text())
    sql(next((ROOT / "supabase/migrations").glob("*_cash_inventory_acquisition_evidence.sql")).read_text())
    evidence = dict(evidence_reference="Verified source document 1", policy_note="Reviewed original invoice and verified cash recognition policy", user_confirmed=True)
    policy = dict(evidence, kind="inventory", source_account_id=uid(1), recognition_account_id=uid(2), effective_from="2026-10-01", evidence_journal_ids=[uid(20)])
    policy_id = call("approve_cash_classification_policy", policy)
    assert sql(f"SELECT version FROM cash_classification_policies WHERE id='{policy_id}'") == "1"
    snapshot = json.loads(sql(f"SELECT evidence_journal_snapshots FROM cash_classification_policies WHERE id='{policy_id}'"))
    assert snapshot[0]["lines"][0]["debit_minor"] == "100"
    assert snapshot[0]["fx_rate_to_base"] == "1.00000000"
    for invalid in [dict(policy, user_confirmed=False), dict(policy, recognition_account_id=uid(8)), dict(policy, evidence_journal_ids=[uid(23)])]:
        try:
            call("approve_cash_classification_policy", invalid)
            raise AssertionError("invalid policy allowed")
        except subprocess.CalledProcessError:
            pass
    try:
        call("approve_cash_classification_policy", policy, approve=False)
        raise AssertionError("viewer approved")
    except subprocess.CalledProcessError as exc:
        assert "permission" in exc.stderr
    revision_id = call("approve_cash_classification_policy", dict(policy, supersedes_id=policy_id, effective_from="2026-11-01"))
    assert sql(f"SELECT version FROM cash_classification_policies WHERE id='{revision_id}'") == "2"
    assert sql("SELECT count(*) FROM cash_classification_audit") == "2"
    denied(f"SET ROLE authenticated; SET test.company='{C}'; UPDATE cash_classification_policies SET policy_note='changed';", "permission denied")
    denied(f"UPDATE cash_classification_policies SET policy_note='unaudited change';", "immutable")
    assert sql(f"SET ROLE authenticated; SET test.company='{OTHER}'; SELECT count(*) FROM cash_classification_policies") == "0"
    opening = dict(evidence, source_kind="sales_invoice", document_id=uid(41), posted_journal_id=uid(22), control_account_id=uid(4), equity_account_id=uid(6), currency_code="GBP", gross_minor="120", components=[dict(account_id=uid(3), amount_minor="100"), dict(account_id=uid(7), amount_minor="20")], tax_lines=[dict(id="original-line",net_minor="100",tax_minor="20",tax_code_id=uid(50))], mode="recognize_on_settlement",effective_from="2026-09-30")
    try:
        call("approve_cash_opening_evidence", dict(opening,tax_lines=[dict(id="bad-rate",net_minor="100",tax_minor="20",tax_code_id=uid(50),tax_rate_bps=-1)]))
        raise AssertionError("negative original tax rate allowed")
    except subprocess.CalledProcessError:
        pass
    opening_id = call("approve_cash_opening_evidence", opening)
    assert sql(f"SELECT gross_minor FROM cash_opening_evidence WHERE id='{opening_id}'") == "120"
    try:
        call("approve_cash_opening_evidence", dict(opening, supersedes_id=opening_id, components=[dict(account_id=uid(3),amount_minor="119")]))
        raise AssertionError("unbalanced opening allowed")
    except subprocess.CalledProcessError:
        pass
    inventory = dict(evidence, purchase_document_id=uid(40),purchase_journal_id=uid(20),inventory_account_id=uid(1),movement_journal_id=uid(21),movement_kind="sale",cost_minor="20")
    inventory_id = call("approve_cash_inventory_evidence", inventory)
    try:
        call("approve_cash_inventory_evidence", dict(inventory,cost_minor="1"))
        raise AssertionError("duplicate inventory cost exceeded actual movement")
    except subprocess.CalledProcessError:
        pass
    sql(f"""
INSERT INTO public.accounts VALUES('{uid(9)}','{C}','asset',true,false);
INSERT INTO public.bank_accounts VALUES('{uid(60)}','{C}','{uid(9)}');
INSERT INTO public.journals VALUES('{uid(24)}','{C}','2026-09-01','direct','bank_transaction',NULL,'GBP',1,'posted'),('{uid(25)}','{C}','2026-11-02','direct-sale','inventory_adjustment',NULL,'GBP',1,'posted'),('{uid(26)}','{C}','2026-10-01','stock-opening','opening_balance',NULL,'GBP',1,'posted'),('{uid(27)}','{C}','2026-11-03','opening-sale','inventory_adjustment',NULL,'GBP',1,'posted');
INSERT INTO public.journal_lines VALUES('{uid(110)}','{C}','{uid(24)}','{uid(1)}',100,0),('{uid(111)}','{C}','{uid(24)}','{uid(9)}',0,100),('{uid(112)}','{C}','{uid(25)}','{uid(2)}',30,0),('{uid(113)}','{C}','{uid(25)}','{uid(1)}',0,30),('{uid(114)}','{C}','{uid(26)}','{uid(1)}',60,0),('{uid(115)}','{C}','{uid(26)}','{uid(6)}',0,60),('{uid(116)}','{C}','{uid(27)}','{uid(2)}',20,0),('{uid(117)}','{C}','{uid(27)}','{uid(1)}',0,20);
""")
    direct = dict(inventory,purchase_document_id=uid(24),purchase_journal_id=uid(24),source_kind="direct_cash",movement_journal_id=uid(25),cost_minor="30")
    direct_id=call("approve_cash_inventory_evidence",direct)
    opening_stock=dict(evidence,purchase_document_id=uid(26),purchase_journal_id=uid(26),source_kind="opening_inventory",inventory_account_id=uid(1),movement_journal_id=uid(26),movement_kind="opening_source",cost_minor="60",opening_paid_minor="60",opening_equity_account_id=uid(6),payment_evidence_journal_ids=[uid(24)])
    for invalid in [dict(opening_stock,opening_paid_minor="61"),dict(opening_stock,payment_evidence_journal_ids=[]),dict(opening_stock,payment_evidence_journal_ids=[uid(23)]),dict(direct,source_kind="purchase_bill")]:
        try:
            call("approve_cash_inventory_evidence",invalid)
            raise AssertionError("unverified direct/opening stock evidence allowed")
        except subprocess.CalledProcessError:
            pass
    opening_stock_id=call("approve_cash_inventory_evidence",opening_stock)
    call("approve_cash_inventory_evidence",dict(evidence,purchase_document_id=uid(26),purchase_journal_id=uid(26),source_kind="opening_inventory",inventory_account_id=uid(1),movement_journal_id=uid(27),movement_kind="sale",cost_minor="20"))
    assert json.loads(sql(f"SELECT payment_evidence_snapshots FROM cash_inventory_evidence WHERE id='{opening_stock_id}'"))[0]["id"]==uid(24)
    direct_exception=dict(exception_key="direct:inventory:period",code="cash_inventory_evidence_required",source_account_id=uid(1),journal_id=uid(24),document_id=uid(24),amount_minor="30",currency_code="GBP",period_from="2026-11-01",period_to="2026-11-30",missing_information="Verified original direct acquisition costing")
    direct_exception_id=call("record_cash_classification_exception",direct_exception,approve=False)
    sql(f"SET ROLE authenticated; SET test.company='{C}'; SET test.actor='{USER}'; SET test.approve=true; SELECT public.resolve_cash_classification_exception('{C}','{direct_exception_id}','inventory','{direct_id}','Verified original direct acquisition cost evidence');")
    exception = dict(exception_key="prepaid:source:period",code="cash_classification_required",source_account_id=uid(1),journal_id=uid(20),document_id=uid(40),amount_minor="50",currency_code="GBP",period_from="2026-11-01",period_to="2026-11-30",missing_information="Missing verified purchase classification")
    exception_id = call("record_cash_classification_exception",exception,approve=False)
    assert call("record_cash_classification_exception",exception,approve=False)==exception_id
    sql(f"SET ROLE authenticated; SET test.company='{C}'; SET test.actor='{USER}'; SET test.approve=true; SELECT public.resolve_cash_classification_exception('{C}','{exception_id}','policy','{revision_id}','Verified original invoice and approved account policy');")
    assert sql(f"SELECT status FROM cash_classification_exceptions WHERE id='{exception_id}'")=="resolved"
    original_capture=json.loads(sql(f"SET ROLE authenticated; SET test.company='{C}'; SET test.actor='{USER}'; SELECT public.capture_cash_report_source('{C}','2026-11-30');"))
    assert len(original_capture["cash_classification_policies"])==2
    assert original_capture["cash_opening_evidence"][0]["gross_minor"]=="120"
    assert any(row["id"]==inventory_id for row in original_capture["cash_inventory_evidence"])
    assert next(row for row in original_capture["cash_inventory_evidence"] if row["id"]==opening_stock_id)["opening_paid_minor"]=="60"
    sql("CREATE TABLE frozen_cash_source(source jsonb)")
    sql("INSERT INTO frozen_cash_source VALUES ('"+json.dumps(original_capture).replace("'", "''")+"'::jsonb)")
    call("approve_cash_classification_policy", dict(policy,effective_from="2026-11-01",supersedes_id=revision_id,policy_note="Revised policy after verifying additional historical evidence"))
    assert json.loads(sql("SELECT source FROM frozen_cash_source")) == original_capture
    updated=json.loads(sql(f"SET ROLE authenticated; SET test.company='{C}'; SET test.actor='{USER}'; SELECT public.capture_cash_report_source('{C}','2026-11-30');"))
    assert len(updated["cash_classification_policies"])==3
    assert original_capture["cash_classification_policies"][0]["evidence_journal_snapshots"][0]["lines"]
    assert sql(f"SELECT components FROM cash_opening_evidence WHERE id='{opening_id}'")
    print("PASS: actual classification migration, verified snapshots, approval authorization, tenant RLS, immutable version history, opening/tax reconciliation, inventory cost caps, traceable exception resolution and snapshot capture")
except subprocess.CalledProcessError as exc:
    print(exc.stderr)
    raise
finally:
    docker("rm","--force",NAME)

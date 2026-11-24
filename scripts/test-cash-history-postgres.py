import subprocess, pathlib, os

os.chdir(pathlib.Path(__file__).resolve().parent.parent)
name = f"streakbooks-cash-history-test-{os.getpid()}"
docker_env = os.environ.copy()
for selector in ["DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH"]:
    docker_env.pop(selector, None)


def docker(*args, input=None):
    return subprocess.run(
        ["docker", "--host=unix:///var/run/docker.sock", *args],
        input=input,
        text=True,
        capture_output=True,
        check=True,
        env=docker_env,
        timeout=300,
    ).stdout


def sql(s):
    return docker(
        "exec",
        "-i",
        name,
        "psql",
        "-X",
        "-qAt",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        input=s,
    )


try:
    docker(
        "run",
        "--detach",
        "--rm",
        "--name",
        name,
        "--network",
        "none",
        "-e",
        "POSTGRES_HOST_AUTH_METHOD=trust",
        "postgres:17",
    )
    import time

    for i in range(40):
        try:
            docker("exec", name, "pg_isready", "-h", "127.0.0.1", "-U", "postgres")
            break
        except subprocess.CalledProcessError:
            time.sleep(0.25)
    sql("""CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA private;
 CREATE TABLE public.companies(id uuid PRIMARY KEY);
 CREATE FUNCTION public.is_company_member(uuid) RETURNS boolean LANGUAGE sql STABLE AS $$SELECT $1::text = current_setting('test.company', true)$$;
 CREATE TABLE public.supplier_payment_allocations(id uuid PRIMARY KEY,company_id uuid,payment_id uuid,bill_id uuid,amount_minor bigint);
 CREATE TABLE public.money_document_credit_uses(id uuid PRIMARY KEY,company_id uuid,document_id uuid,source_kind text,source_id uuid,amount_minor bigint);
 INSERT INTO companies VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
 """)
    sql(
        pathlib.Path(
            "supabase/migrations/20261103153938_cash_allocation_history.sql"
        ).read_text()
    )
    sql(
        """INSERT INTO supplier_payment_allocations VALUES('00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001',gen_random_uuid(),gen_random_uuid(),9007199254740993);
 UPDATE supplier_payment_allocations SET amount_minor=6000;
 DELETE FROM supplier_payment_allocations;
 INSERT INTO money_document_credit_uses VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000002',gen_random_uuid(),'sales_credit_note',gen_random_uuid(),123);
 DELETE FROM money_document_credit_uses;
 """
    )
    assert sql("SELECT count(*) FROM cash_allocation_history;").strip() == "3"
    assert (
        sql(
            "SELECT source_row->>'amount_minor' FROM cash_allocation_history WHERE operation='UPDATE';"
        ).strip()
        == "9007199254740993"
    )
    assert (
        sql(
            "SET ROLE authenticated; SET test.company='00000000-0000-0000-0000-000000000001';SELECT count(*) FROM cash_allocation_history;"
        ).strip()
        == "2"
    )
    assert (
        sql(
            "SET ROLE authenticated; SET test.company='00000000-0000-0000-0000-000000000009';SELECT count(*) FROM cash_allocation_history;"
        ).strip()
        == "0"
    )
    for operation in [
        "INSERT INTO cash_allocation_history(company_id,source_table,allocation_id,operation,source_row) VALUES(gen_random_uuid(),'supplier_payment_allocations',gen_random_uuid(),'DELETE','{}')",
        "DELETE FROM cash_allocation_history",
        "UPDATE cash_allocation_history SET source_row='{}'",
        "SELECT private.archive_cash_allocation()",
    ]:
        try:
            sql("SET ROLE authenticated;" + operation)
            raise AssertionError("write allowed")
        except subprocess.CalledProcessError as e:
            assert "permission denied" in e.stderr, e.stderr
    sql(
        "BEGIN; INSERT INTO supplier_payment_allocations VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000001',gen_random_uuid(),gen_random_uuid(),123);DELETE FROM supplier_payment_allocations;ROLLBACK;"
    )
    assert sql("SELECT count(*) FROM cash_allocation_history;").strip() == "3"
    sql(pathlib.Path("tests/fixtures/cash/snapshot-baseline.sql").read_text())
    sql(
        pathlib.Path(
            "supabase/migrations/20261103154433_cash_delivery_snapshots.sql"
        ).read_text()
    )
    company = "00000000-0000-0000-0000-000000000001"
    user = "00000000-0000-0000-0000-000000000008"
    setup = f"SET test.company='{company}'; SET test.actor='{user}';"
    sql(
        setup
        + f"INSERT INTO sales_receipts VALUES(gen_random_uuid(),'{company}',gen_random_uuid(),NULL,'GBP',1,9007199254740993,'2026-11-01'),(gen_random_uuid(),'00000000-0000-0000-0000-000000000002',gen_random_uuid(),NULL,'GBP',1,99999,'2026-11-01'),(gen_random_uuid(),'{company}',gen_random_uuid(),NULL,'GBP',1,777,'2027-01-01');"
    )
    import json

    snapshot = json.loads(
        sql(
            setup
            + f"SET ROLE authenticated; SELECT public.capture_cash_report_source('{company}','2026-11-30');"
        )
    )
    assert len(snapshot["sales_receipts"]) == 1
    assert snapshot["sales_receipts"][0]["amount_minor"] == "9007199254740993"
    assert len(snapshot) == 11
    view = "00000000-0000-0000-0000-000000000007"
    sql(
        setup
        + f"INSERT INTO report_saved_views VALUES('{view}','{company}','{user}','profit-and-loss','{{\"basis\":\"cash\"}}','Cash report');"
    )
    payload = json.dumps(
        {
            "viewId": view,
            "recipients": ["fixture@example.invalid"],
            "subject": "Test only",
            "from": "2026-11-01",
            "to": "2026-11-30",
        }
    )
    delivery = sql(
        setup
        + f"SET ROLE authenticated; SELECT public.queue_report_delivery('{company}','{payload}'::jsonb);"
    ).strip()
    queued = json.loads(
        sql(
            f"SELECT jsonb_build_object('facts',facts,'definition',definition) FROM report_deliveries WHERE id='{delivery}';"
        )
    )
    assert queued["facts"]["cashSourceVersion"] == 1
    assert queued["facts"]["cashSource"] == snapshot
    assert json.loads(queued["definition"]["config"]["settings"])["basis"] == "cash"
    sql(f"UPDATE sales_receipts SET amount_minor=456 WHERE company_id='{company}';")
    assert (
        sql(
            f"SELECT facts->'cashSource'->'sales_receipts'->0->>'amount_minor' FROM report_deliveries WHERE id='{delivery}';"
        ).strip()
        == "9007199254740993"
    )
    try:
        sql(
            setup
            + "SET ROLE authenticated; SELECT public.capture_cash_report_source('00000000-0000-0000-0000-000000000002','2026-11-30');"
        )
        raise AssertionError("cross-company snapshot allowed")
    except subprocess.CalledProcessError as e:
        assert "Reporting access denied" in e.stderr
    print(
        "PASS: cash snapshot RPC, exact bigint strings, date/company scope, queue frozen facts, legacy cash view normalisation, denied cross-company capture"
    )
    print(
        "PASS: exact bigint archive, supplier/refund delete, update history, tenant isolation, denied archive mutations/function calls, atomic rollback"
    )

    # Exercise the forward migration against the original functions, with the
    # real custom-column period constructor and its authorization boundary.
    sql("""CREATE FUNCTION private.validate_report_filters(jsonb) RETURNS void LANGUAGE sql AS $$SELECT$$;
CREATE FUNCTION public.report_filtered_balances(uuid,date,date,jsonb)
RETURNS TABLE(account_id uuid,debit_minor bigint,credit_minor bigint,line_count bigint)
LANGUAGE sql AS $$SELECT NULL::uuid,0::bigint,0::bigint,0::bigint WHERE false$$;
""")
    custom_sql = pathlib.Path(
        "supabase/migrations/20261102180105_reporting_posted_ledger_filters.sql"
    ).read_text()
    sql(custom_sql[custom_sql.index("CREATE OR REPLACE FUNCTION public.capture_custom_report_facts"):])
    payment = "00000000-0000-0000-0000-000000000021"
    allocation = "00000000-0000-0000-0000-000000000022"
    credit = "00000000-0000-0000-0000-000000000023"
    credit_allocation = "00000000-0000-0000-0000-000000000024"
    source = "00000000-0000-0000-0000-000000000025"
    sql(f"""INSERT INTO supplier_payments(id,company_id,payment_date,status)
VALUES('{payment}','{company}','2026-10-01','paid');
INSERT INTO supplier_payment_allocations VALUES('{allocation}','{company}','{payment}',gen_random_uuid(),123);
INSERT INTO purchase_credit_notes VALUES('{credit}','{company}',gen_random_uuid(),'2026-10-02');
INSERT INTO purchase_credit_allocations VALUES('{credit_allocation}','{company}',gen_random_uuid(),'{credit}',9007199254740993);
INSERT INTO sales_invoices VALUES('{source}','{company}',gen_random_uuid(),'2026-10-01'),(gen_random_uuid(),'00000000-0000-0000-0000-000000000002',gen_random_uuid(),'2026-10-01');
""")
    sql("""CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
ALTER TABLE report_packs ADD COLUMN from_date date, ADD COLUMN to_date date,
 ADD COLUMN reviewer_id uuid, ADD COLUMN preparer_id uuid, ADD COLUMN prepared_by uuid,
 ADD COLUMN approved_by uuid, ADD COLUMN approved_at timestamptz, ADD COLUMN published_at timestamptz,
 ADD COLUMN previous_status text, ADD COLUMN snapshot_hash text, ADD COLUMN version integer DEFAULT 1,
 ADD COLUMN modified_by uuid, ADD COLUMN updated_at timestamptz;
CREATE TABLE company_members(company_id uuid,user_id uuid,status text,role text);
CREATE TABLE report_comments(pack_id uuid,company_id uuid,author_id uuid,body text);
""")
    ecosystem = pathlib.Path("supabase/migrations/20261102042056_reporting_ecosystem.sql").read_text()
    transition = ecosystem[ecosystem.index("CREATE FUNCTION public.transition_report_pack"):]
    transition = transition[:transition.index("-- Versioned assumptions")]
    # The catalogue entitlement migration inserts this existing guard in place.
    transition = transition.replace("BEGIN\n SELECT * INTO p", "BEGIN PERFORM private.assert_reporting_feature((SELECT company_id FROM public.report_packs WHERE id=_id));\n SELECT * INTO p")
    sql(transition)
    history_before = sql("SELECT count(*) FROM cash_allocation_history;").strip()
    sql(pathlib.Path("supabase/migrations/20261104081033_cash_source_links_and_report_snapshots.sql").read_text())
    assert sql("SELECT count(*) FROM cash_allocation_history;").strip() == history_before
    assert sql(f"SELECT allocated_on FROM supplier_payment_allocations WHERE id='{allocation}';").strip() == "2026-10-01"
    assert sql("SELECT count(*) FROM cash_allocation_history WHERE event_seq IS NOT NULL;").strip() == '0'
    sql(f"BEGIN; UPDATE supplier_payment_allocations SET amount_minor=124 WHERE id='{allocation}'; UPDATE supplier_payment_allocations SET amount_minor=125 WHERE id='{allocation}'; COMMIT;")
    sequenced=json.loads(sql(f"SELECT jsonb_agg(jsonb_build_object('amount',source_row->>'amount_minor','event_seq',event_seq,'time',recorded_at) ORDER BY event_seq) FROM cash_allocation_history WHERE allocation_id='{allocation}';"))
    assert [event['amount'] for event in sequenced] == ['123','124']
    assert sequenced[0]['event_seq'] < sequenced[1]['event_seq']
    assert sequenced[0]['time'] == sequenced[1]['time']
    try:
        sql("SET ROLE authenticated; SELECT nextval('private.cash_allocation_event_seq');")
        raise AssertionError('archive sequence client mutation allowed')
    except subprocess.CalledProcessError as e:
        assert 'permission denied' in e.stderr

    assert sql(f"SELECT allocated_on FROM purchase_credit_allocations WHERE id='{credit_allocation}';").strip() == "2026-10-02"
    # New application dates distinguish draft initial payment splits from later
    # allocation of already-posted supplier advances.
    sql(f"""INSERT INTO supplier_payment_allocations(id,company_id,payment_id,bill_id,amount_minor)
VALUES(gen_random_uuid(),'{company}','{payment}',gen_random_uuid(),456);
UPDATE supplier_payments SET status='draft' WHERE id='{payment}';
INSERT INTO supplier_payment_allocations(id,company_id,payment_id,bill_id,amount_minor)
VALUES(gen_random_uuid(),'{company}','{payment}',gen_random_uuid(),789);""")
    assert sql("SELECT allocated_on=CURRENT_DATE FROM supplier_payment_allocations WHERE amount_minor=456;").strip() == "t"
    assert sql("SELECT allocated_on FROM supplier_payment_allocations WHERE amount_minor=789;").strip() == "2026-10-01"
    for bad_sql in [
        f"INSERT INTO supplier_payment_allocations(id,company_id,payment_id,bill_id,amount_minor,allocated_on) VALUES(gen_random_uuid(),'{company}','{payment}',gen_random_uuid(),1,'2026-09-01')",
        f"INSERT INTO supplier_payment_allocations(id,company_id,payment_id,bill_id,amount_minor) VALUES(gen_random_uuid(),'00000000-0000-0000-0000-000000000002','{payment}',gen_random_uuid(),1)",
    ]:
        try:
            sql(bad_sql)
            raise AssertionError("invalid dated/company allocation accepted")
        except subprocess.CalledProcessError as e:
            assert "Allocation date cannot precede" in e.stderr or "not found in this organisation" in e.stderr
    linked = json.loads(sql(setup + f"SET ROLE authenticated; SELECT public.capture_cash_report_source('{company}','2026-11-30');"))
    assert len(linked) == 15
    assert len(linked['sales_invoices']) == 1
    assert linked['sales_invoices'][0]['id'] == source
    assert linked['purchase_credit_allocations'][0]['amount_minor'] == '9007199254740993'
    assert linked['purchase_credit_allocations'][0]['allocated_on'] == '2026-10-02'
    assert all('allocated_on' in item for item in linked['supplier_payment_allocations'])
    # A November cash payment may apply to a December document. Its dated link
    # must survive the cutoff although the December source journal is omitted,
    # letting the shared engine keep the November payment as an advance.
    future_documents=[]
    for index, (table,date_key,source_kind) in enumerate([
        ('sales_invoices','invoice_date','sales_invoice'),
        ('purchase_bills','bill_date','purchase_bill'),
        ('sales_credit_notes','credit_date','sales_credit_note'),
        ('purchase_credit_notes','credit_date','purchase_credit_note'),
    ], start=41):
        document_id=f'00000000-0000-0000-0000-{index:012d}'
        journal_id=f'00000000-0000-0000-0000-{index+10:012d}'
        sql(f"""INSERT INTO {table}(id,company_id,posted_journal_id,{date_key}) VALUES('{document_id}','{company}','{journal_id}','2026-12-10');
INSERT INTO journals(id,company_id,journal_date,source_type,source_id,status) VALUES('{journal_id}','{company}','2026-12-10','{source_kind}','{document_id}','posted');
INSERT INTO journal_lines(id,company_id,journal_id,account_id,debit_minor,credit_minor) VALUES(gen_random_uuid(),'{company}','{journal_id}',gen_random_uuid(),100,0);""")
        future_documents.append((table,date_key,document_id,journal_id))
    future_snapshot=json.loads(sql(setup+f"SET ROLE authenticated; SELECT public.capture_cash_report_source('{company}','2026-11-30');"))
    for table,date_key,document_id,journal_id in future_documents:
        document=next(row for row in future_snapshot[table] if row['id']==document_id)
        assert document[date_key] == '2026-12-10'
        assert document['posted_journal_id'] == journal_id
        assert all(line['journals']['id'] != journal_id for line in future_snapshot['journal_lines'])
    future_delivery=sql(setup+f"SET ROLE authenticated; SELECT public.queue_report_delivery('{company}','{payload}'::jsonb);").strip()
    frozen_source=json.loads(sql(f"SELECT facts->'cashSource' FROM report_deliveries WHERE id='{future_delivery}';"))
    assert frozen_source == future_snapshot
    sql(f"UPDATE sales_invoices SET invoice_date='2027-01-11' WHERE id='{future_documents[0][2]}';")
    assert sql(f"SELECT document->>'invoice_date' FROM report_deliveries d CROSS JOIN LATERAL jsonb_array_elements(d.facts->'cashSource'->'sales_invoices') document WHERE d.id='{future_delivery}' AND document->>'id'='{future_documents[0][2]}';").strip() == '2026-12-10'
    sql(f"DELETE FROM purchase_credit_allocations WHERE id='{credit_allocation}';")
    assert sql("SELECT source_row->>'amount_minor' FROM cash_allocation_history WHERE source_table='purchase_credit_allocations';").strip() == '9007199254740993'
    assert sql("SELECT source_row->>'allocated_on' FROM cash_allocation_history WHERE source_table='purchase_credit_allocations';").strip() == '2026-10-02'
    custom_definition = json.dumps({'basis':'cash','columns':[{'id':'current','mode':'period'},{'id':'future','mode':'fixed','from':'2027-01-01','to':'2027-01-31'}]})
    custom_facts = json.loads(sql(setup + f"SET ROLE authenticated; SELECT public.capture_custom_report_facts('{company}','2026-11-01','2026-11-30','{custom_definition}'::jsonb);"))
    assert custom_facts['cashSourceVersion'] == 1
    assert len(custom_facts['cashSource']['sales_receipts']) == 2
    assert custom_facts['customColumns'][1]['to'] == '2027-01-31'
    assert all(c['balances'] == [] for c in custom_facts['customColumns'])
    accrual_definition = json.dumps({'basis':'accrual','columns':[{'id':'current','mode':'period'}]})
    accrual_facts = json.loads(sql(setup + f"SET ROLE authenticated; SELECT public.capture_custom_report_facts('{company}','2026-11-01','2026-11-30','{accrual_definition}'::jsonb);"))
    assert 'cashSource' not in accrual_facts
    for report_id in ['trial-balance','cash-summary','cash-flow-indirect']:
        sql(f"UPDATE report_saved_views SET report_id='{report_id}',config='{{\"basis\":\"cash\"}}' WHERE id='{view}';")
        delivery = sql(setup + f"SET ROLE authenticated; SELECT public.queue_report_delivery('{company}','{payload}'::jsonb);").strip()
        assert sql(f"SELECT facts->>'cashSourceVersion' FROM report_deliveries WHERE id='{delivery}';").strip() == '1'
    # A report-level explicit override wins over encoded settings in all paths.
    for report_id in ['profit-and-loss','trial-balance']:
        for top_basis, nested_basis, expected in [(None,'cash','cash'),('accrual','cash','accrual'),('cash','accrual','cash')]:
            cfg={'settings':json.dumps({'basis':nested_basis})}
            if top_basis is not None: cfg['basis']=top_basis
            sql(f"UPDATE report_saved_views SET report_id='{report_id}',config='{json.dumps(cfg)}'::jsonb WHERE id='{view}';")
            result_id=sql(setup+f"SET ROLE authenticated; SELECT public.queue_report_delivery('{company}','{payload}'::jsonb);").strip()
            frozen=json.loads(sql(f"SELECT jsonb_build_object('facts',facts,'definition',definition) FROM report_deliveries WHERE id='{result_id}';"))
            assert frozen['definition']['config']['basis'] == expected
            assert ('cashSource' in frozen['facts']) == (expected == 'cash')
            if report_id == 'profit-and-loss':
                assert json.loads(frozen['definition']['config']['settings'])['basis'] == expected
    sql(f"UPDATE report_saved_views SET report_id='profit-and-loss',config=jsonb_build_object('_builder','{custom_definition}'::jsonb) WHERE id='{view}';")
    delivery = sql(setup + f"SET ROLE authenticated; SELECT public.queue_report_delivery('{company}','{payload}'::jsonb);").strip()
    assert sql(f"SELECT facts->>'cashSourceVersion' FROM report_deliveries WHERE id='{delivery}';").strip() == '1'
    # Standard cash filters are applied by the shared recognition renderer;
    # the source snapshot must remain complete and preserve the filter settings.
    standard = json.loads(sql(setup + f"SET ROLE authenticated; SELECT public.capture_standard_report_facts('{company}','2026-11-01','2026-11-30','profit-and-loss','{{\"basis\":\"cash\",\"filters\":{{\"clauses\":[{{\"field\":\"description\",\"op\":\"contains\",\"values\":[\"retainer\"]}}]}}}}');"))
    assert standard['cashSourceVersion'] == 1
    # Missing overrides inherit only the current company's existing accounting
    # setting, at new capture time; explicit report settings remain authoritative.
    sql("INSERT INTO organisation_config VALUES('00000000-0000-0000-0000-000000000002','accounting','{\"reporting_basis\":\"cash\"}');")
    own_default = json.loads(sql(setup + f"SET ROLE authenticated; SELECT public.capture_standard_report_facts('{company}','2026-11-01','2026-11-30','profit-and-loss','{{}}');"))
    assert 'cashSource' not in own_default
    sql(f"INSERT INTO organisation_config VALUES('{company}','accounting','{{\"reporting_basis\":\"cash\"}}');")
    for function, definition in [
        ('custom', {'columns':[{'id':'current','mode':'period'}]}),
        ('standard', {}),
    ]:
        for override in [None, 'accrual']:
            cfg=dict(definition)
            if override: cfg['basis']=override
            arguments = f"'{json.dumps(cfg)}'::jsonb" if function == 'custom' else f"'profit-and-loss','{json.dumps(cfg)}'::jsonb"
            captured=json.loads(sql(setup + f"SET ROLE authenticated; SELECT public.capture_{function}_report_facts('{company}','2026-11-01','2026-11-30',{arguments});"))
            assert ('cashSource' in captured) == (override is None)
    company_default_deliveries=[]
    for report_id, cfg in [
        ('profit-and-loss', {}), ('trial-balance', {}),
        ('profit-and-loss', {'_builder':{'columns':[{'id':'current','mode':'period'}]}}),
        ('profit-and-loss', {'basis':'cash','_builder':{'basis':'accrual','columns':[{'id':'current','mode':'period'}]}}),
        ('profit-and-loss', {'basis':'accrual'}),
        ('profit-and-loss', {'settings':json.dumps({'basis':'accrual'})}),
    ]:
        expected = cfg.get('_builder',{}).get('basis',cfg.get('basis',json.loads(cfg.get('settings','{}')).get('basis','cash')))
        sql(f"UPDATE report_saved_views SET report_id='{report_id}',config='{json.dumps(cfg)}'::jsonb WHERE id='{view}';")
        result_id=sql(setup+f"SET ROLE authenticated; SELECT public.queue_report_delivery('{company}','{payload}'::jsonb);").strip()
        frozen=json.loads(sql(f"SELECT jsonb_build_object('facts',facts,'definition',definition) FROM report_deliveries WHERE id='{result_id}';"))
        assert frozen['definition']['config']['basis'] == expected
        assert ('cashSource' in frozen['facts']) == (expected == 'cash')
        if '_builder' in cfg: assert frozen['definition']['config']['_builder']['basis'] == expected
        company_default_deliveries.append((result_id,frozen))
    # Approval hashes must freeze all original raw cash facts, and later source
    # edits must not alter a submitted or delivered pack.
    pack = "00000000-0000-0000-0000-000000000031"
    accrual_pack = "00000000-0000-0000-0000-000000000032"
    reviewer = "00000000-0000-0000-0000-000000000033"
    default_pack = "00000000-0000-0000-0000-000000000034"
    legacy_pack = "00000000-0000-0000-0000-000000000035"
    sql(f"""INSERT INTO company_members VALUES('{company}','{reviewer}','active','accountant');
INSERT INTO report_packs(id,company_id,owner_id,status,name,config,from_date,to_date,reviewer_id)
VALUES('{pack}','{company}','{user}','draft','Cash pack','{{"basis":"cash","reports":["profit-and-loss","balance-sheet","trial-balance"]}}','2026-11-01','2026-11-30','{reviewer}'),
('{accrual_pack}','{company}','{user}','draft','Accrual pack','{{"basis":"accrual","reports":["profit-and-loss"]}}','2026-11-01','2026-11-30','{reviewer}'),
('{default_pack}','{company}','{user}','draft','Company default pack','{{"reports":["profit-and-loss"]}}','2026-11-01','2026-11-30','{reviewer}');
INSERT INTO report_packs(id,company_id,owner_id,status,name,config,snapshot,from_date,to_date)
VALUES('{legacy_pack}','{company}','{user}','published','Legacy frozen pack','{{"reports":["profit-and-loss"]}}','{{"from":"2026-11-01","to":"2026-11-30","priorTo":"2026-10-31"}}','2026-11-01','2026-11-30');""")
    sql(setup + f"SET ROLE authenticated; SELECT public.transition_report_pack('{pack}',1,'submit'); SELECT public.transition_report_pack('{accrual_pack}',1,'submit'); SELECT public.transition_report_pack('{default_pack}',1,'submit');")
    assert sql(f"SELECT snapshot->>'cashSourceVersion' FROM report_packs WHERE id='{pack}';").strip() == '1'
    assert sql(f"SELECT snapshot ? 'cashSource' FROM report_packs WHERE id='{accrual_pack}';").strip() == 'f'
    assert sql(f"SELECT snapshot_hash=encode(extensions.digest(convert_to(snapshot::text||config::text,'UTF8'),'sha256'),'hex') FROM report_packs WHERE id='{pack}';").strip() == 't'
    assert sql(f"SELECT config->>'basis'='cash' AND snapshot->>'cashSourceVersion'='1' AND snapshot_hash=encode(extensions.digest(convert_to(snapshot::text||config::text,'UTF8'),'sha256'),'hex') FROM report_packs WHERE id='{default_pack}';").strip() == 't'
    legacy_payload=json.dumps({'packId':legacy_pack,'recipients':['fixture@example.invalid'],'subject':'Legacy snapshot'})
    legacy_delivery=sql(setup+f"SET ROLE authenticated; SELECT public.queue_report_delivery('{company}','{legacy_payload}'::jsonb);").strip()
    assert sql(f"SELECT NOT(definition->'config' ? 'basis') AND NOT(facts ? 'cashSource') AND facts=(SELECT snapshot FROM report_packs WHERE id='{legacy_pack}') FROM report_deliveries WHERE id='{legacy_delivery}';").strip() == 't'
    sql(f"UPDATE organisation_config SET document='{{\"reporting_basis\":\"accrual\"}}' WHERE company_id='{company}';")
    for result_id, frozen in company_default_deliveries:
        assert json.loads(sql(f"SELECT jsonb_build_object('facts',facts,'definition',definition) FROM report_deliveries WHERE id='{result_id}';")) == frozen
    assert sql(f"SELECT config->>'basis'='cash' AND snapshot->>'cashSourceVersion'='1' AND snapshot_hash=encode(extensions.digest(convert_to(snapshot::text||config::text,'UTF8'),'sha256'),'hex') FROM report_packs WHERE id='{default_pack}';").strip() == 't'
    for denied in [
        setup + f"SET ROLE authenticated; SELECT public.transition_report_pack('{pack}',2,'approve');",
        f"SET test.company='00000000-0000-0000-0000-000000000002'; SET test.actor='{reviewer}'; SET ROLE authenticated; SELECT public.transition_report_pack('{pack}',2,'approve');",
    ]:
        try:
            sql(denied)
            raise AssertionError('pack review separation/company permission bypassed')
        except subprocess.CalledProcessError as e:
            assert 'independent reviewer' in e.stderr or 'Reporting access denied' in e.stderr
    sql(f"SET test.company='{company}'; SET test.actor='{reviewer}'; SET ROLE authenticated; SELECT public.transition_report_pack('{pack}',2,'approve');")
    sql(setup + f"SET ROLE authenticated; SELECT public.transition_report_pack('{pack}',3,'publish');")
    pack_payload=json.dumps({'packId':pack,'recipients':['fixture@example.invalid'],'subject':'Cash pack test'})
    delivery=sql(setup + f"SET ROLE authenticated; SELECT public.queue_report_delivery('{company}','{pack_payload}'::jsonb);").strip()
    assert sql(f"SELECT facts=(SELECT snapshot FROM report_packs WHERE id='{pack}') FROM report_deliveries WHERE id='{delivery}';").strip() == 't'
    sql(f"UPDATE sales_invoices SET posted_journal_id=gen_random_uuid() WHERE id='{source}';")
    assert sql(f"SELECT facts->'cashSource'->'sales_invoices'=(SELECT snapshot->'cashSource'->'sales_invoices' FROM report_packs WHERE id='{pack}') FROM report_deliveries WHERE id='{delivery}';").strip() == 't'
    print('PASS: filtered cash standard snapshots, cash pack submit/approve/publish/delivery, immutable cash source hashes, independent reviewer and tenant isolation, accrual pack unchanged')
    print('PASS: company-default cash captures, explicit accrual and custom overrides, saved-view/pack basis frozen with facts, legacy snapshots unchanged, company-isolated defaults')
    print("PASS: dated/future document journal-link snapshots and frozen cutoff parity, exact credit amounts, dated AP applications/credit history, metadata backfill without false reallocations, tenant/date validation, custom future columns, generic cash delivery snapshots, accrual custom capture preserved")
except subprocess.CalledProcessError as e:
    print(e.stderr)
    raise
finally:
    docker("rm", "--force", name)

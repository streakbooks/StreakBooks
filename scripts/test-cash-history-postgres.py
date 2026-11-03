import subprocess, pathlib, os

os.chdir(pathlib.Path(__file__).resolve().parent.parent)
name = f"linkbooks-cash-history-test-{os.getpid()}"


def docker(*args, input=None):
    return subprocess.run(
        ["docker", "--host=unix:///var/run/docker.sock", *args],
        input=input,
        text=True,
        capture_output=True,
        check=True,
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
except subprocess.CalledProcessError as e:
    print(e.stderr)
    raise
finally:
    docker("rm", "--force", name)

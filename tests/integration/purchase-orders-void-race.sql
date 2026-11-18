BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true);
SELECT public.void_purchase_order_bill_atomic('10000000-0000-4000-8000-000000000001',(SELECT id FROM public.purchase_bills WHERE purchase_order_id=(SELECT value FROM public.po_test_context WHERE key='race_order')),'Concurrent supplier cancellation','2026-11-18');
SELECT pg_sleep(0.05);
COMMIT;

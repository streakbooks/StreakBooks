BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true);
SELECT public.manage_purchase_requisition('10000000-0000-4000-8000-000000000001',(SELECT value FROM public.po_test_context WHERE key='race_requisition'),3,'convert');
SELECT pg_sleep(0.05);
COMMIT;

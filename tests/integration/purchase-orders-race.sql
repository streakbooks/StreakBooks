BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000000001"}',true);
SELECT public.receive_purchase_order(
 '10000000-0000-4000-8000-000000000001',
 (SELECT value FROM public.po_test_context WHERE key='race_order'),
 (SELECT value FROM public.po_test_context WHERE key='race_receipt_request'),
 '2026-11-18','CONCURRENT-GR',
 jsonb_build_array(jsonb_build_object('lineId',(SELECT value FROM public.po_test_context WHERE key='race_line'),'receiveQuantity',3))
);
SELECT pg_sleep(0.05);
COMMIT;

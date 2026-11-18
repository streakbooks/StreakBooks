\set c '20000000-0000-4000-8000-000000000001'
\set r '50000000-0000-4000-8000-000000000001'
\set loc '30000000-0000-4000-8000-000000000001'
\set cash '40000000-0000-4000-8000-000000000001'
\set product '60000000-0000-4000-8000-000000000001'
\set open_op '60000000-0000-4000-8000-000000000010'
\set sale_op '61000000-0000-4000-8000-000000000001'
\set refund_op '62000000-0000-4000-8000-000000000001'
\set close_op '70000000-0000-4000-8000-000000000010'

SELECT public.test_assert(NOT has_table_privilege('authenticated','public.pos_sales','INSERT'),'no direct POS sale inserts');

SET ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001"}',false);
SELECT public.pos_create_register(:'c',:'r',:'loc',:'cash','TILL-1','Front Counter');
SELECT public.pos_set_location_access(:'c',:'loc','10000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002"}',false);
SELECT public.pos_open_session(:'c',:'r',:'open_op',5000);
SELECT public.test_assert((public.pos_get_workspace(:'c')->'openSessions'->0->>'expected_cash_minor')='5000','opening session seeds expected cash');

SELECT public.test_raises(
  $q$SELECT public.pos_complete_cash_sale('20000000-0000-4000-8000-000000000001',
    (SELECT id FROM public.pos_register_sessions WHERE closed_at IS NULL LIMIT 1),
    '61000000-0000-4000-8000-000000000099',10000,
    jsonb_build_array(jsonb_build_object('product_id','60000000-0000-4000-8000-000000000001','quantity',1)))$q$,
  'below sale total','under-tender sale rejected');

SELECT public.pos_complete_cash_sale(
  :'c',
  (SELECT id FROM public.pos_register_sessions WHERE closed_at IS NULL LIMIT 1),
  :'sale_op',
  11000,
  jsonb_build_array(jsonb_build_object('product_id',:'product','quantity',1))
);
SELECT public.test_assert((SELECT expected_cash_minor FROM public.pos_register_sessions WHERE closed_at IS NULL)=16000,'sale increases expected cash by gross 11000');
SELECT public.test_assert((SELECT count(*)=1 FROM public.pos_sales WHERE sale_operation_id=:'sale_op'::uuid),'one sale row persisted');
SELECT public.test_assert((SELECT count(*)=3 FROM public.journal_lines j JOIN public.journals x ON x.id=j.journal_id WHERE x.source_type='pos_sale'),'sale posts cash, revenue and tax lines');

SELECT public.test_assert(
  (public.pos_complete_cash_sale(:'c',
    (SELECT id FROM public.pos_register_sessions WHERE closed_at IS NULL LIMIT 1),
    :'sale_op',11000,
    jsonb_build_array(jsonb_build_object('product_id',:'product','quantity',1)))->>'sale_id')
  IS NOT NULL,
'sale replay is idempotent');

SELECT public.pos_refund_cash_sale(:'c',(SELECT id FROM public.pos_sales WHERE sale_operation_id=:'sale_op'::uuid),:'refund_op');
SELECT public.test_assert((SELECT status FROM public.pos_sales WHERE sale_operation_id=:'sale_op'::uuid)='refunded','full refund marks sale refunded');
SELECT public.test_assert((SELECT expected_cash_minor FROM public.pos_register_sessions WHERE closed_at IS NULL)=5000,'refund restores expected cash to opening float');
SELECT public.test_assert((SELECT count(*)=1 FROM public.pos_refunds),'one refund row per sale');

SELECT public.pos_close_session(:'c',(SELECT id FROM public.pos_register_sessions WHERE closed_at IS NULL),:'close_op',5000);
SELECT public.test_assert((SELECT closed_at IS NOT NULL FROM public.pos_register_sessions WHERE close_operation_id=:'close_op'::uuid),'zero-variance close after refund succeeds');

SELECT set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001"}',false);
SELECT public.test_assert(coalesce(public.pos_get_workspace(:'c')->>'canSell','false')='true','workspace exposes canSell');
SELECT public.test_assert(coalesce(public.pos_get_workspace(:'c')->>'canRefund','false')='true','workspace exposes canRefund');
RESET ROLE;
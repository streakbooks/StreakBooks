SELECT public.po_test_assert(
 (SELECT count(*) FROM public.purchase_orders WHERE client_request_id=(SELECT value FROM public.po_test_context WHERE key='race_requisition'))=1
 AND EXISTS(SELECT 1 FROM public.purchase_requisitions WHERE id=(SELECT value FROM public.po_test_context WHERE key='race_requisition') AND status='ordered' AND order_id IS NOT NULL),
 'three concurrent requisition conversions commit one linked order');

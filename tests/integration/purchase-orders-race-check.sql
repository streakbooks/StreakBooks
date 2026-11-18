SELECT public.po_test_assert(
 (SELECT quantity_received FROM public.purchase_order_lines WHERE id=(SELECT value FROM public.po_test_context WHERE key='race_line'))=3
 AND (SELECT count(*) FROM public.purchase_order_receipts WHERE order_id=(SELECT value FROM public.po_test_context WHERE key='race_order'))=1,
 'three concurrent receipt retries commit one receipt and one quantity increment');

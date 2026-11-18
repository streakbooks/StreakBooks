SELECT public.po_test_assert(
 (SELECT quantity_billed FROM public.purchase_order_lines WHERE id=(SELECT value FROM public.po_test_context WHERE key='race_line'))=3
 AND (SELECT count(*) FROM public.purchase_bills WHERE purchase_order_id=(SELECT value FROM public.po_test_context WHERE key='race_order'))=1,
 'three concurrent conversions commit one bill and one cumulative allocation');

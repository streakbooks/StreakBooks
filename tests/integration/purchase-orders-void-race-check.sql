SELECT public.po_test_assert(
 (SELECT count(*) FROM public.journals WHERE reverses_journal_id=(SELECT posted_journal_id FROM public.purchase_bills WHERE purchase_order_id=(SELECT value FROM public.po_test_context WHERE key='race_order')))=1
 AND (SELECT status FROM public.purchase_bills WHERE purchase_order_id=(SELECT value FROM public.po_test_context WHERE key='race_order'))='void'
 AND (SELECT quantity_billed FROM public.purchase_order_lines WHERE id=(SELECT value FROM public.po_test_context WHERE key='race_line'))=0,
 'three concurrent voids commit one reversal and release allocation once');

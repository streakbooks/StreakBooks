SELECT public.po_test_assert(
 (SELECT count(*) FROM public.journals WHERE source_id=(SELECT id FROM public.purchase_bills WHERE purchase_order_id=(SELECT value FROM public.po_test_context WHERE key='race_order')))=1
 AND EXISTS(SELECT 1 FROM public.purchase_bills WHERE purchase_order_id=(SELECT value FROM public.po_test_context WHERE key='race_order') AND status='authorised' AND posted_journal_id IS NOT NULL),
 'three concurrent authorisations commit one linked balanced journal');

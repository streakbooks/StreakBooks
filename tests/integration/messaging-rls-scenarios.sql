-- Messaging RLS / authorization scenario checklist (run on isolated staging after migrations).
-- Replace UUIDs with seeded fixtures. Expect DENY where noted.

-- SETUP (harness):
-- company_a, company_b
-- user_a1, user_a2 members of company_a
-- user_b1 member of company_b
-- portal_customer_a active on company_a contact C1
-- portal_customer_other on company_a contact C2

-- 1) Internal DM isolation
-- SET request.jwt.claim.sub = user_a1;
-- SELECT messaging_create_dm(company_a, user_a2); -- ALLOW
-- SET request.jwt.claim.sub = user_b1;
-- SELECT * FROM messaging_conversations WHERE company_id = company_a; -- DENY (empty)

-- 2) Cross-tenant send forge
-- SET request.jwt.claim.sub = user_a1;
-- SELECT messaging_send_message(company_b, <conv_in_a>, 'x', gen_random_uuid()); -- DENY

-- 3) Membership revoke
-- Update company_members status for user_a2 to suspended;
-- SET request.jwt.claim.sub = user_a2;
-- SELECT messaging_send_message(company_a, <conv>, 'x', gen_random_uuid()); -- DENY
-- SELECT * FROM messaging_messages WHERE conversation_id = <conv>; -- DENY

-- 4) Customer invoice discuss
-- SET request.jwt.claim.sub = portal_customer_a;
-- SELECT messaging_portal_open_invoice_discussion(<membership>, <invoice_for_C1>); -- ALLOW
-- SELECT messaging_portal_open_invoice_discussion(<membership>, <invoice_for_C2>); -- DENY

-- 5) Vendor PO discuss
-- SET request.jwt.claim.sub = portal_vendor;
-- SELECT messaging_portal_open_po_discussion(<membership>, <po_for_vendor>); -- ALLOW
-- SELECT messaging_portal_open_po_discussion(<membership>, <po_for_other>); -- DENY

-- 6) Attachment after revoke
-- After revoke, createSignedUrl / select messaging_attachments -- DENY

-- 7) Informal approval text
-- messaging_request_formal_approval creates action_notifications only; sales_invoices.status unchanged.

DO $$
BEGIN
  IF to_regclass('public.messaging_conversations') IS NULL THEN
    RAISE EXCEPTION 'Apply messaging migrations before running scenarios';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'messaging_portal_open_invoice_discussion') THEN
    RAISE EXCEPTION 'Portal messaging RPCs missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'messaging_request_formal_approval') THEN
    RAISE EXCEPTION 'Formal approval RPC missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'messaging_register_attachment') THEN
    RAISE EXCEPTION 'Attachment RPC missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'messaging_open_advisor_engagement') THEN
    RAISE EXCEPTION 'Advisor engagement RPC missing';
  END IF;
  RAISE NOTICE 'messaging-rls-scenarios: RPC presence checks passed';
END $$;

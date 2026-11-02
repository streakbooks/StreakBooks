-- 20261102180000_definer_anon_execute revoked EXECUTE from PUBLIC only. Supabase also
-- grants EXECUTE to anon directly (default privileges), so those functions stayed
-- callable by signed-out users. Revoke that direct grant for the same functions.
-- get_shared_invoice and the public billing plan/price lists stay executable by anon.
-- Reverse each statement with: GRANT EXECUTE ON FUNCTION <signature> TO anon;
REVOKE EXECUTE ON FUNCTION public.accounts_write_audit() FROM anon;
REVOKE EXECUTE ON FUNCTION public.attach_company_subscription() FROM anon;
REVOKE EXECUTE ON FUNCTION public.copy_chart_accounts(_source uuid, _target uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.count_ai_usage_last_hour(_company_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.document_attachments_before_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_company_allowance() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_document_quota() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_storage_allowance() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_subscription_posting() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_subscription_seats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.import_chart_accounts(_company_id uuid, _rows jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.journals_assert_lock_dates() FROM anon;
REVOKE EXECUTE ON FUNCTION public.protect_system_accounts() FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_ai_usage(_company_id uuid, _intent text, _status text, _provider text, _model text, _prompt_chars integer, _estimated_tokens integer, _latency_ms integer, _error_code text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_audit_event(_company_id uuid, _action text, _entity_type text, _entity_id uuid, _details jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recurring_claim_occurrence(_company_id uuid, _schedule_id uuid, _scheduled_date date, _document_date date, _template_version_id uuid, _idempotency_key text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.recurring_complete_occurrence(_occurrence_id uuid, _purchase_bill_id uuid, _sales_invoice_id uuid, _failed_message text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reset_demo_company(_company_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_country_tax_pack(_company_id uuid, _pack_id text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.seed_default_tax_pack(_company_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.subscription_allows_posting(_company_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_fx_purchase_alloc_delete() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_fx_purchase_alloc_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_fx_purchase_payment_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_fx_sales_alloc_delete() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_fx_sales_alloc_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_fx_sales_alloc_update() FROM anon;
REVOKE EXECUTE ON FUNCTION public.void_exchange_rate(_rate_id uuid) FROM anon;

-- Cover reporting references used by foreign-key checks and scoped queries.
CREATE INDEX IF NOT EXISTS report_comments_author_id_idx ON public.report_comments (author_id);
CREATE INDEX IF NOT EXISTS report_comments_company_id_idx ON public.report_comments (company_id);
CREATE INDEX IF NOT EXISTS report_deliveries_owner_id_idx ON public.report_deliveries (owner_id);
CREATE INDEX IF NOT EXISTS report_deliveries_pack_id_idx ON public.report_deliveries (pack_id);
CREATE INDEX IF NOT EXISTS report_deliveries_view_id_idx ON public.report_deliveries (view_id);
CREATE INDEX IF NOT EXISTS report_grants_granted_by_idx ON public.report_grants (granted_by);
CREATE INDEX IF NOT EXISTS report_model_versions_created_by_idx ON public.report_model_versions (created_by);
CREATE INDEX IF NOT EXISTS report_models_owner_id_idx ON public.report_models (owner_id);
CREATE INDEX IF NOT EXISTS report_packs_approved_by_idx ON public.report_packs (approved_by);
CREATE INDEX IF NOT EXISTS report_packs_modified_by_idx ON public.report_packs (modified_by);
CREATE INDEX IF NOT EXISTS report_packs_owner_id_idx ON public.report_packs (owner_id);
CREATE INDEX IF NOT EXISTS report_packs_prepared_by_idx ON public.report_packs (prepared_by);
CREATE INDEX IF NOT EXISTS report_packs_preparer_id_idx ON public.report_packs (preparer_id);
CREATE INDEX IF NOT EXISTS report_packs_reviewer_id_idx ON public.report_packs (reviewer_id);
CREATE INDEX IF NOT EXISTS report_saved_views_firm_id_idx ON public.report_saved_views (firm_id);
CREATE INDEX IF NOT EXISTS report_saved_views_modified_by_idx ON public.report_saved_views (modified_by);
CREATE INDEX IF NOT EXISTS report_saved_views_user_id_idx ON public.report_saved_views (user_id);
CREATE INDEX IF NOT EXISTS report_schedules_company_id_idx ON public.report_schedules (company_id);
CREATE INDEX IF NOT EXISTS report_schedules_owner_id_idx ON public.report_schedules (owner_id);
CREATE INDEX IF NOT EXISTS report_schedules_pack_id_idx ON public.report_schedules (pack_id);
CREATE INDEX IF NOT EXISTS report_schedules_view_id_idx ON public.report_schedules (view_id);

-- Cache the current user once per statement without changing tenant predicates.
ALTER POLICY report_views_delete ON public.report_saved_views USING (user_id=(SELECT auth.uid()) AND public.has_company_permission(company_id,'reports.view'));
ALTER POLICY report_views_insert ON public.report_saved_views WITH CHECK (user_id=(SELECT auth.uid()) AND public.has_company_permission(company_id,'reports.view') AND access_level='private' AND firm_id IS NULL);
ALTER POLICY report_views_read ON public.report_saved_views USING (public.has_company_permission(company_id,'reports.view') AND (user_id=(SELECT auth.uid()) OR private.report_access(id,false)));
ALTER POLICY report_deliveries_read ON public.report_deliveries USING (owner_id=(SELECT auth.uid()) AND public.has_company_permission(company_id,'reports.export'));
ALTER POLICY report_schedules_read ON public.report_schedules USING (owner_id=(SELECT auth.uid()) AND public.has_company_permission(company_id,'reports.export'));
ALTER POLICY report_models_owner ON public.report_models USING (owner_id=(SELECT auth.uid()) AND public.has_company_permission(company_id,'reports.view')) WITH CHECK (owner_id=(SELECT auth.uid()) AND public.has_company_permission(company_id,'reports.view'));
ALTER POLICY report_model_versions_read ON public.report_model_versions USING (EXISTS(SELECT 1 FROM public.report_models m WHERE m.id=model_id AND m.owner_id=(SELECT auth.uid()) AND public.has_company_permission(m.company_id,'reports.view')));
ALTER POLICY report_comments_insert ON public.report_comments WITH CHECK(author_id=(SELECT auth.uid()) AND public.has_company_permission(company_id,'reports.view') AND EXISTS(SELECT 1 FROM public.report_packs p WHERE p.id=pack_id AND p.company_id=report_comments.company_id));
-- Retain the established restrictive MFA policy for all newly introduced public tables.
SELECT private.apply_mfa_policies();

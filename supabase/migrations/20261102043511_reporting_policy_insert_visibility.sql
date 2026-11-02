-- Owner predicate is evaluated directly so INSERT ... RETURNING can see its newly inserted row.
DROP POLICY report_views_read ON public.report_saved_views;
CREATE POLICY report_views_read ON public.report_saved_views FOR SELECT TO authenticated
 USING(public.has_company_permission(company_id,'reports.view') AND (user_id=auth.uid() OR private.report_access(id,false)));

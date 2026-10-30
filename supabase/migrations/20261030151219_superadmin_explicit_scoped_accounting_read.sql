CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT private.customer_access_ok() AND (
 EXISTS(SELECT 1 FROM public.company_members WHERE company_id=_company_id AND user_id=auth.uid() AND status='active')
 OR (private.scoped_permission(_company_id,'company.view') AND private.scoped_permission(_company_id,'accounting.view')));
$$;

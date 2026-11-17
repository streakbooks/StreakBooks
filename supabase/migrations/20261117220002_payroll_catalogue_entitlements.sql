-- Register the payroll module already declared by FEATURE_REGISTRY.
-- Does not edit customer plans, grants, prices, or an existing configured feature.
INSERT INTO public.billing_features
 (key,label,description,category,module,metering,cost_tag,catalogue_status,default_enabled)
VALUES ('payroll','Payroll module','Payroll writes.','module','payroll','none',NULL,'live',true)
ON CONFLICT (key) DO NOTHING;

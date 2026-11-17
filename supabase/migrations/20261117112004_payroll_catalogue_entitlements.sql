-- Match the existing live TypeScript catalogue; do not alter plans, grants, prices,
-- customer subscriptions or an existing customised Payroll feature definition.
insert into public.billing_features (
  key, label, description, category, module, metering, cost_tag, catalogue_status, default_enabled
) values (
  'payroll', 'Payroll module', 'Payroll writes.', 'module', 'payroll', 'none', null, 'live', true
) on conflict (key) do nothing;

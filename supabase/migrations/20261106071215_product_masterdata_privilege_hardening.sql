-- Restrict new catalogue tables to exact application privileges.
-- Supabase's default authenticated grants may otherwise include TRUNCATE/TRIGGER.
REVOKE ALL ON TABLE public.product_categories, public.product_price_lists,
  public.product_price_list_items FROM authenticated, anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.product_categories, public.product_price_lists TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.product_price_list_items TO authenticated;

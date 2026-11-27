-- This rollback removes saved account-wide appearance preferences.
DROP TABLE IF EXISTS public.user_global_preferences;

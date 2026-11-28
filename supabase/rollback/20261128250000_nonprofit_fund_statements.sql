-- Reverses the historical fund statement function. Posted journals are left unchanged.

DROP FUNCTION IF EXISTS public.nonprofit_fund_statement(UUID, DATE, DATE);

CREATE TABLE public.expense_management_settings (
  company_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  claim_number_prefix text NOT NULL DEFAULT 'EXP-',
  default_claim_currency char(3),
  employee_payable_account_id uuid,
  employee_advance_account_id uuid,
  petty_cash_account_id uuid,
  rebilling_income_account_id uuid,
  fx_gain_account_id uuid,
  fx_loss_account_id uuid,
  require_receipt_above_minor bigint NOT NULL DEFAULT 0,
  require_spending_request_above_minor bigint NOT NULL DEFAULT 0,
  allow_multi_currency_claims boolean NOT NULL DEFAULT true,
  prevent_self_approval boolean NOT NULL DEFAULT true,
  default_distance_unit text NOT NULL DEFAULT 'km',
  approval_escalation_days integer NOT NULL DEFAULT 5,
  required_approval_count integer NOT NULL DEFAULT 1
);

CREATE TABLE public.expense_cash_advances (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  advance_number text NOT NULL,
  title text NOT NULL,
  employee_user_id uuid NOT NULL REFERENCES auth.users(id),
  advance_date date NOT NULL,
  currency_code char(3) NOT NULL,
  amount_minor bigint NOT NULL,
  remaining_minor bigint NOT NULL,
  status text NOT NULL,
  bank_account_id uuid REFERENCES public.accounts(id),
  issue_journal_id uuid REFERENCES public.journals(id),
  issued_at timestamptz,
  issued_by uuid REFERENCES auth.users(id),
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.expense_petty_cash_floats (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  float_number text NOT NULL,
  name text NOT NULL,
  custodian_user_id uuid NOT NULL REFERENCES auth.users(id),
  currency_code char(3) NOT NULL,
  target_minor bigint NOT NULL,
  balance_minor bigint NOT NULL DEFAULT 0,
  status text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
